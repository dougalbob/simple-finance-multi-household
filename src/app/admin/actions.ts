'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import type { ActionState, ServerSettingsActionState } from '@/lib/action-state';
import { appSessionFromRequest } from '@/lib/auth/next';
import { loadAppConfig, type AppConfig } from '@/lib/config';
import { isEditableEnvKey, readEnvFile, writeEnvFile } from '@/lib/env-file';
import { getRegistry } from '@/lib/registry/db';
import {
  assignIdentity,
  createHousehold,
  recordAudit,
  renameHousehold,
  setHouseholdStatus,
  unassignIdentity,
} from '@/lib/registry/domain';
import { MAX_DISPLAY_NAME_LENGTH } from '@/lib/registry/ids';

/**
 * Platform administration server actions (MULTI_HOUSEHOLD_PLAN §4): create,
 * rename and deactivate households; pre-assign and unassign sign-in
 * identities. Every action re-checks the session on the server — the roster
 * writes are administrator-only, audited in the registry, and never touch any
 * household's financial data.
 *
 * A platform administrator whose own household is deactivated may still reach
 * these actions (they must be able to restore it); everyone else is refused.
 */

const NOT_SIGNED_IN: ActionState = {
  status: 'error',
  message: 'Sign in through your household link first.',
};

const NOT_ADMIN: ActionState = {
  status: 'error',
  message: 'Platform administration is limited to the service administrator.',
};

async function requireAdministrator(): Promise<
  { ok: true; actor: string } | { ok: false; state: ActionState }
> {
  const session = await appSessionFromRequest();
  if (
    session.status === 'not-signed-in' ||
    session.status === 'unassigned' ||
    session.status === 'registry-unavailable'
  ) {
    return { ok: false, state: NOT_SIGNED_IN };
  }
  if (session.user.role !== 'platform_admin') return { ok: false, state: NOT_ADMIN };
  return { ok: true, actor: session.user.email };
}

function domainMessage(error: unknown, fallback: string): ActionState {
  return { status: 'error', message: error instanceof Error ? error.message : fallback };
}

function firstIssue(error: { issues: Array<{ message?: string }> }, fallback: string): string {
  return error.issues[0]?.message ?? fallback;
}

const displayNameSchema = z
  .string()
  .trim()
  .min(1, 'Give the household a short name.')
  .max(
    MAX_DISPLAY_NAME_LENGTH,
    `Household names are at most ${MAX_DISPLAY_NAME_LENGTH} characters.`,
  );

const emailSchema = z
  .string()
  .trim()
  .min(1, 'Enter the sign-in email address to assign.')
  .max(254, 'That address is too long.');
// Shape validation lives in the registry domain (assertAssignableEmail), so a
// malformed address gets one message from one place.

export async function createHouseholdAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const auth = await requireAdministrator();
  if (!auth.ok) return auth.state;
  const parsed = displayNameSchema.safeParse(String(formData.get('displayName') ?? ''));
  if (!parsed.success) {
    return { status: 'error', message: firstIssue(parsed.error, 'Check the household name.') };
  }
  try {
    const household = createHousehold(getRegistry(), {
      displayName: parsed.data,
      actor: auth.actor,
    });
    revalidatePath('/admin');
    return {
      status: 'ok',
      message: `Household “${household.displayName}” created. Assign its one or two sign-in emails next.`,
    };
  } catch (error) {
    return domainMessage(error, 'The household could not be created.');
  }
}

export async function renameHouseholdAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const auth = await requireAdministrator();
  if (!auth.ok) return auth.state;
  const parsed = z.object({ householdId: z.string(), displayName: displayNameSchema }).safeParse({
    householdId: String(formData.get('householdId') ?? ''),
    displayName: String(formData.get('displayName') ?? ''),
  });
  if (!parsed.success) {
    return { status: 'error', message: firstIssue(parsed.error, 'Check the household name.') };
  }
  try {
    renameHousehold(getRegistry(), { ...parsed.data, actor: auth.actor });
    revalidatePath('/admin');
    return { status: 'ok', message: 'Household name saved.' };
  } catch (error) {
    return domainMessage(error, 'The household could not be renamed.');
  }
}

export async function setHouseholdStatusAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const auth = await requireAdministrator();
  if (!auth.ok) return auth.state;
  const parsed = z
    .object({
      householdId: z.string(),
      status: z.enum(['active', 'deactivated']),
    })
    .safeParse({
      householdId: String(formData.get('householdId') ?? ''),
      status: String(formData.get('status') ?? ''),
    });
  if (!parsed.success) {
    return { status: 'error', message: 'Check the household state change.' };
  }
  try {
    const household = setHouseholdStatus(getRegistry(), { ...parsed.data, actor: auth.actor });
    revalidatePath('/admin');
    return {
      status: 'ok',
      message:
        household.status === 'active'
          ? `Household “${household.displayName}” reactivated — its members can sign in again.`
          : `Household “${household.displayName}” deactivated — its members are denied until it is reactivated.`,
    };
  } catch (error) {
    return domainMessage(error, 'The household state could not be changed.');
  }
}

export async function assignIdentityAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const auth = await requireAdministrator();
  if (!auth.ok) return auth.state;
  const parsed = z.object({ householdId: z.string(), email: emailSchema }).safeParse({
    householdId: String(formData.get('householdId') ?? ''),
    email: String(formData.get('email') ?? ''),
  });
  if (!parsed.success) {
    return { status: 'error', message: firstIssue(parsed.error, 'Check the email address.') };
  }
  try {
    const identity = assignIdentity(getRegistry(), {
      email: parsed.data.email,
      householdId: parsed.data.householdId,
      actor: auth.actor,
    });
    revalidatePath('/admin');
    return {
      status: 'ok',
      message: `${identity.email} can now sign in to this household.`,
    };
  } catch (error) {
    return domainMessage(error, 'The address could not be assigned.');
  }
}

export async function unassignIdentityAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const auth = await requireAdministrator();
  if (!auth.ok) return auth.state;
  const parsed = emailSchema.safeParse(String(formData.get('email') ?? ''));
  if (!parsed.success) {
    return { status: 'error', message: firstIssue(parsed.error, 'Check the email address.') };
  }
  try {
    unassignIdentity(getRegistry(), { email: parsed.data, actor: auth.actor });
    revalidatePath('/admin');
    return {
      status: 'ok',
      message: `${parsed.data.toLowerCase()} is unassigned and can no longer sign in.`,
    };
  } catch (error) {
    return domainMessage(error, 'The address could not be unassigned.');
  }
}

// --- Server settings: the trusted /data/.env file (issue #91) ----------------

const NOT_ENV_ADMIN: ActionState = {
  status: 'error',
  message:
    'Server settings can only be changed by the REGISTRY_ADMIN_EMAIL administrator named in the environment file.',
};

/**
 * Strict gate for anything that rewrites /data/.env (issue #91): the session
 * must be the bootstrap `REGISTRY_ADMIN_EMAIL` identity — a promoted
 * `platform_admin` role is not enough. This is the break-glass identity; if
 * it is not configured, nobody can edit the file from the UI (fail closed).
 */
async function requireEnvAdministrator(
  config: AppConfig,
): Promise<{ ok: true; actor: string } | { ok: false; state: ServerSettingsActionState }> {
  const adminEmail = config.registryBootstrap.adminEmail;
  const session = await appSessionFromRequest();
  if (
    session.status === 'not-signed-in' ||
    session.status === 'unassigned' ||
    session.status === 'registry-unavailable'
  ) {
    return { ok: false, state: { ...NOT_SIGNED_IN, restartRequired: false } };
  }
  if (adminEmail === null || session.user.email.toLowerCase() !== adminEmail.toLowerCase()) {
    return { ok: false, state: { ...NOT_ENV_ADMIN, restartRequired: false } };
  }
  return { ok: true, actor: session.user.email };
}

const envUrlSchema = z
  .string()
  .trim()
  .max(2048, 'That URL is too long.')
  .refine(
    (v) => v === '' || /^https?:\/\/\S+$/.test(v),
    'Enter a full URL starting with https:// or leave it blank.',
  );

const envRequiredUrlSchema = z
  .string()
  .trim()
  .min(1, 'This value cannot be blank.')
  .max(2048, 'That value is too long.')
  .refine((v) => /^https?:\/\/\S+$/.test(v), 'Enter a full URL starting with https://.');

const envAudienceSchema = z
  .string()
  .trim()
  .min(1, 'This value cannot be blank.')
  .max(128, 'That value is too long.')
  .refine((v) => !/\s/.test(v), 'An AUD tag cannot contain spaces.');

function parseAllowedEmails(
  raw: string,
): { ok: true; value: string } | { ok: false; message: string } {
  const entries = raw
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter((e) => e.length > 0);
  for (const entry of entries) {
    if (/,/.test(entry) || /\s/.test(entry) || !/^[^@\s]+@[^@\s]+$/.test(entry)) {
      return { ok: false, message: `“${entry}” does not look like an email address.` };
    }
  }
  return { ok: true, value: entries.join(',') };
}

/**
 * Save the editable /data/.env fields (issue #91). Values are written as
 * single-quoted shell literals, atomically, with a `.bak` copy and a registry
 * audit row (keys only — never values). The entrypoint sources the file at
 * container start, so the running process keeps its current values until the
 * container is restarted; the form shows a restart banner afterwards.
 */
export async function saveServerSettingsAction(
  _previous: ServerSettingsActionState,
  formData: FormData,
): Promise<ServerSettingsActionState> {
  const config = loadAppConfig();
  const auth = await requireEnvAdministrator(config);
  if (!auth.ok) return auth.state;

  const issuer = envRequiredUrlSchema.safeParse(String(formData.get('AUTH_ISSUER') ?? ''));
  const audience = envAudienceSchema.safeParse(String(formData.get('AUTH_AUDIENCE') ?? ''));
  const certsUrl = envUrlSchema.safeParse(String(formData.get('AUTH_CERTS_URL') ?? ''));
  const cloudflareUrl = envUrlSchema.safeParse(String(formData.get('CLOUDFLARE_ACCESS_URL') ?? ''));
  const allowedRaw = String(formData.get('AUTH_ALLOWED_EMAILS') ?? '').trim();
  const allowed = parseAllowedEmails(allowedRaw);

  for (const parsed of [issuer, audience, certsUrl, cloudflareUrl]) {
    if (!parsed.success) {
      return {
        status: 'error',
        message: firstIssue(parsed.error, 'Check the values.'),
        restartRequired: false,
      };
    }
  }
  if (!issuer.success || !audience.success || !certsUrl.success || !cloudflareUrl.success) {
    return { status: 'error', message: 'Check the values.', restartRequired: false };
  }
  if (!allowed.ok) {
    return { status: 'error', message: allowed.message, restartRequired: false };
  }

  // Blank optional fields delete their line (the derived default or the
  // registry-derived allowlist then applies). Blank issuer/audience rejected.
  const updates: Record<string, string | null> = {
    AUTH_ISSUER: issuer.data,
    AUTH_AUDIENCE: audience.data,
    AUTH_CERTS_URL: certsUrl.data === '' ? null : certsUrl.data,
    AUTH_ALLOWED_EMAILS: allowed.value === '' ? null : allowed.value,
    CLOUDFLARE_ACCESS_URL: cloudflareUrl.data === '' ? null : cloudflareUrl.data,
  };
  for (const key of Object.keys(updates)) {
    if (!isEditableEnvKey(key)) {
      return { status: 'error', message: `“${key}” is not editable here.`, restartRequired: false };
    }
  }

  // Only write keys that actually changed; a no-op save must not rewrite the
  // file (and must not demand a restart).
  const current = readEnvFile(config);
  const changed: string[] = [];
  const toWrite: Record<string, string | null> = {};
  for (const [key, next] of Object.entries(updates)) {
    const prev = current.values[key] ?? '';
    // Normalise both sides the way loadAppConfig reads them, so cosmetic
    // differences (case, spacing around commas) do not count as changes.
    const prevForCompare =
      key === 'AUTH_ALLOWED_EMAILS'
        ? prev
            .split(',')
            .map((e) => e.trim().toLowerCase())
            .filter((e) => e !== '')
            .join(',')
        : prev.trim();
    const nextForCompare = next ?? '';
    if (prevForCompare !== nextForCompare) {
      toWrite[key] = next;
      changed.push(key);
    }
  }

  if (changed.length === 0) {
    revalidatePath('/admin');
    return {
      status: 'ok',
      message: 'Nothing changed — the environment file is already up to date.',
      restartRequired: false,
    };
  }

  const result = writeEnvFile(toWrite, config);
  if (!result.ok) {
    return {
      status: 'error',
      message: `The environment file could not be written: ${result.error}`,
      restartRequired: false,
    };
  }

  try {
    recordAudit(getRegistry(config), {
      actor: auth.actor,
      action: 'config.update',
      detail: { keys: changed },
      now: new Date(),
    });
  } catch {
    // Audit is best-effort here: the file write is the important half and it
    // already succeeded. The .bak copy records the previous values.
  }

  revalidatePath('/admin');
  return {
    status: 'ok',
    message: `Saved ${changed.join(', ')} to the environment file. Restart the container for the running app to use the new values.`,
    restartRequired: true,
  };
}
