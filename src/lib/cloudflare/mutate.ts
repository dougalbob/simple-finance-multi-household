import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { ActionState } from '../action-state';
import { isRegistryAdminSession, type SessionState } from '../auth/current-user';
import type { AppConfig, EnvSource } from '../config';
import type { RegistryDb } from '../registry/db';
import { recordAudit, resolveIdentity } from '../registry/domain';
import {
  directEmailRule,
  fingerprint,
  reusablePolicySchema,
  writablePolicy,
  writablePolicySchema,
} from './policy';

const inputSchema = z.object({
  operation: z.enum(['grant', 'remove']),
  email: z.string().trim().toLowerCase().max(254).email(),
  exclusiveEdit: z.literal(true),
  confirmRemoval: z.boolean(),
});
const applicationSchema = z.object({
  id: z.string(),
  aud: z.string(),
  policies: z.array(z.object({ id: z.string() })),
});
type Outcome = 'pending' | 'changed' | 'noop' | 'refused' | 'unknown';
class Refusal extends Error {}

/**
 * Trusted dependencies come only from the server action, never FormData.
 * Authorisation lives here as well so direct calls cannot bypass the gate.
 * No registry assignment, household status or authentication semantics change.
 */
export async function mutateCloudflare(
  input: unknown,
  trusted: {
    session: SessionState;
    config: AppConfig;
    registry: () => RegistryDb;
    env?: EnvSource;
    request?: typeof fetch;
  },
): Promise<ActionState> {
  if (!isRegistryAdminSession(trusted.session, trusted.config)) {
    return {
      status: 'error',
      message: 'Only the REGISTRY_ADMIN_EMAIL administrator may change Cloudflare access.',
    };
  }
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      status: 'error',
      message:
        'Select a valid email and operation, and confirm that no other Cloudflare policy or application edits are in progress.',
    };
  }
  const { operation, email, confirmRemoval } = parsed.data;
  const actor = (trusted.session as Extract<SessionState, { user: unknown }>).user.email;
  const attempt = randomUUID();
  let registry: RegistryDb | undefined;
  let lock: number | undefined;
  const lockPath = path.join(path.dirname(trusted.config.registryPath), 'cloudflare-policy.lock');
  let dispatched = false;
  let lockReleaseFailed = false;
  let outcome: Outcome = 'refused';
  let message = '';
  function audit(result: Outcome) {
    recordAudit(registry!, {
      actor,
      action: `cloudflare.${operation}`,
      email,
      now: new Date(),
      detail: { attempt, outcome: result },
    });
  }
  try {
    registry = trusted.registry();
    // Intent is durable before any provider request. Crash recovery leaves a
    // pending audit row rather than implying the write never happened.
    audit('pending');
    if (
      operation === 'remove' &&
      email === trusted.config.registryBootstrap.adminEmail?.toLowerCase()
    )
      throw new Refusal('The configured administrator cannot be removed through this interface.');
    if (operation === 'remove' && !confirmRemoval)
      throw new Refusal('Confirm removal from this policy before submitting.');
    function checkAssignment() {
      if (operation === 'grant' && resolveIdentity(registry!, email) === null)
        throw new Refusal(
          'Grant refused: this email has no current registry assignment. Assign it first; no Cloudflare change was made.',
        );
    }
    checkAssignment();
    // Cross-request/process exclusion for this installation. Never steal an
    // old lock automatically: a crashed/uncertain write needs operator review.
    try {
      lock = fs.openSync(lockPath, 'wx', 0o600);
    } catch {
      throw new Refusal(
        'Another Cloudflare operation is running, or its safety lock needs operator review. Refresh inspection before retrying.',
      );
    }
    const env = trusted.env ?? process.env;
    const request = trusted.request ?? fetch;
    const [account, application, policy, token, audience] = [
      'CLOUDFLARE_ACCOUNT_ID',
      'CLOUDFLARE_APPLICATION_ID',
      'CLOUDFLARE_POLICY_ID',
      'CLOUDFLARE_API_TOKEN',
      'AUTH_AUDIENCE',
    ].map((key) => env[key]?.trim() ?? '');
    if (
      !token ||
      !audience ||
      ![account, application, policy].every((id) => /^[a-zA-Z0-9-]+$/.test(id!))
    )
      throw new Refusal(
        'Cloudflare server configuration is incomplete or invalid. No change was made.',
      );
    const base = `https://api.cloudflare.com/client/v4/accounts/${account}/access`;
    async function api(route: string, body?: unknown): Promise<unknown> {
      const response = await request(`${base}${route}`, {
        method: body === undefined ? 'GET' : 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        cache: 'no-store',
        redirect: 'error',
        signal: AbortSignal.timeout(10000),
      });
      if (!response.ok) throw new Error('Provider request failed');
      return z
        .object({ success: z.literal(true), result: z.unknown() })
        .parse(await response.json()).result;
    }
    async function snapshot() {
      const app = applicationSchema.parse(await api(`/apps/${application}`));
      if (
        app.id !== application ||
        app.aud !== audience ||
        app.policies.filter((p) => p.id === policy).length !== 1
      )
        throw new Refusal(
          'Application audience or policy binding changed or does not match. No further change will be attempted.',
        );
      // Account endpoint supplies reusable/app_count metadata; a dedicated name
      // or the application-scoped inspection response is not sufficient.
      const rule = reusablePolicySchema.safeParse(await api(`/policies/${policy}`));
      if (
        !rule.success ||
        rule.data.id !== policy ||
        (rule.data.account_id !== undefined && rule.data.account_id !== account)
      )
        throw new Refusal(
          'Policy is not a supported single-application reusable Allow policy. Shared, legacy, unknown fields/rules or malformed settings require dashboard review.',
        );
      return { app, policy: rule.data };
    }
    const before = await snapshot();
    checkAssignment();
    const body = writablePolicy(before.policy);
    function matches(item: unknown) {
      const rule = directEmailRule.safeParse(item);
      return rule.success && rule.data.email.email.trim().toLowerCase() === email;
    }
    const present = body.include.some(matches);
    // Even a no-op must verify current binding, policy kind and registry state.
    if (operation === 'grant' ? present : !present) {
      outcome = 'noop';
      message =
        operation === 'grant'
          ? 'Email already present in this policy; no change needed. This does not guarantee effective access.'
          : 'Email already absent from this policy; no change needed. This is not session revocation or a guarantee of denial.';
    } else {
      const include =
        operation === 'grant'
          ? [...body.include, { email: { email } }]
          : body.include.filter((item) => !matches(item));
      if (include.length === 0)
        throw new Refusal(
          'Removing the last Include rule is unsupported. Review the policy in Cloudflare; no change was made.',
        );
      const next = writablePolicySchema.parse({ ...body, include });
      const current = await snapshot();
      if (fingerprint(current) !== fingerprint(before))
        throw new Refusal(
          'Cloudflare configuration changed during this operation. Nothing was written; refresh inspection and deliberately retry.',
        );
      checkAssignment();
      // No documented provider CAS/If-Match support. The exclusive-edit
      // acknowledgement is essential; this reread cannot close the final race.
      dispatched = true;
      const updated = reusablePolicySchema.parse(await api(`/policies/${policy}`, next));
      if (updated.id !== policy || fingerprint(writablePolicy(updated)) !== fingerprint(next))
        throw new Error('Write response not verified');
      const after = await snapshot();
      if (
        fingerprint(after.app) !== fingerprint(before.app) ||
        fingerprint(writablePolicy(after.policy)) !== fingerprint(next)
      )
        throw new Error('Readback not verified');
      outcome = 'changed';
      message =
        operation === 'grant'
          ? 'Direct email entry added and verified. Registry assignment kept. Effective access still depends on other rules and household status.'
          : 'Direct email entry removed and verified. Registry assignment unchanged. Existing sessions are not revoked, and other policies may still allow access.';
    }
  } catch (error) {
    outcome = dispatched || !(error instanceof Refusal) ? 'unknown' : 'refused';
    message = dispatched
      ? 'Cloudflare write outcome is unknown. Do not treat onboarding or removal as complete. Registry assignment is unchanged; Cloudflare access remains pending verification. Refresh inspection, then deliberately retry only after reviewing the current policy.'
      : error instanceof Refusal
        ? error.message
        : 'Unable to verify Cloudflare; status is unknown. No write was attempted. Registry assignment is unchanged; Cloudflare access remains pending. Check server configuration, token permissions and connectivity, then retry.';
  } finally {
    if (lock !== undefined) {
      try {
        fs.closeSync(lock);
        fs.unlinkSync(lockPath);
      } catch {
        lockReleaseFailed = true;
      }
    }
  }
  try {
    if (registry !== undefined) audit(outcome);
  } catch {
    return {
      status: 'error',
      message:
        'Cloudflare operation audit could not be completed. Registry assignment is unchanged. Do not assume completion: inspect Cloudflare and the pending audit entry before retrying.',
    };
  }
  if (lockReleaseFailed)
    return {
      status: 'error',
      message: `${message} The safety lock needs operator review before another operation.`,
    };
  return { status: outcome === 'changed' || outcome === 'noop' ? 'ok' : 'error', message };
}
