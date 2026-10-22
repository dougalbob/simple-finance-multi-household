import { z } from 'zod';
import type { EnvSource } from '../config';

const applicationSchema = z.object({
  id: z.string(),
  name: z.string(),
  aud: z.string(),
  policies: z.array(z.object({ id: z.string() })),
});
const policySchema = z.object({
  id: z.string(),
  name: z.string(),
  decision: z.literal('allow'),
  include: z.array(z.unknown()),
  require: z.array(z.unknown()).default([]),
  exclude: z.array(z.unknown()).default([]),
});
const emailRule = z.object({ email: z.object({ email: z.string().email() }) }).strict();
export type CloudflareInspection =
  | { status: 'unconfigured' | 'error'; message: string }
  | { status: 'ok'; application: string; policy: string; emails: string[]; complex: boolean };

/** Read-only API boundary. Never return provider bodies/errors: they may contain secrets. */
export async function inspectCloudflare(
  env: EnvSource = process.env,
  request: typeof fetch = fetch,
): Promise<CloudflareInspection> {
  const keys = [
    'CLOUDFLARE_ACCOUNT_ID',
    'CLOUDFLARE_APPLICATION_ID',
    'CLOUDFLARE_POLICY_ID',
    'CLOUDFLARE_API_TOKEN',
  ] as const;
  const values = keys.map((key) => env[key]?.trim() ?? '');
  if (values.some((value) => !value))
    return {
      status: 'unconfigured',
      message:
        'Configure the four CLOUDFLARE_* connection settings on the server, then restart. No Cloudflare changes are made.',
    };
  const [account, application, policy, token] = values;
  if (![account, application, policy].every((value) => /^[a-zA-Z0-9-]+$/.test(value!)))
    return {
      status: 'error',
      message: 'Cloudflare identifiers are invalid. Check server configuration.',
    };
  if (!env.AUTH_AUDIENCE?.trim())
    return {
      status: 'error',
      message: 'AUTH_AUDIENCE is required to verify the application binding.',
    };
  const base = `https://api.cloudflare.com/client/v4/accounts/${account}/access`;
  async function get(path: string): Promise<unknown> {
    const response = await request(`${base}${path}`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
      redirect: 'error',
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) throw new Error('Request failed');
    const envelope = z
      .object({ success: z.literal(true), result: z.unknown() })
      .parse(await response.json());
    return envelope.result;
  }
  try {
    const app = applicationSchema.parse(await get(`/apps/${application}`));
    if (
      app.id !== application ||
      app.aud !== env.AUTH_AUDIENCE.trim() ||
      !app.policies.some((p) => p.id === policy)
    )
      throw new Error('Binding mismatch');
    const rule = policySchema.parse(await get(`/apps/${application}/policies/${policy}`));
    if (rule.id !== policy) throw new Error('Policy mismatch');
    const emails: string[] = [];
    let complex = rule.require.length > 0 || rule.exclude.length > 0;
    for (const item of rule.include) {
      const parsed = emailRule.safeParse(item);
      if (parsed.success) emails.push(parsed.data.email.email.trim().toLowerCase());
      else complex = true;
    }
    return {
      status: 'ok',
      application: app.name,
      policy: rule.name,
      emails: [...new Set(emails)].sort(),
      complex,
    };
  } catch {
    return {
      status: 'error',
      message:
        'Unable to verify Cloudflare access. Check the token permissions, account/application/policy IDs, application audience and network connection. Status is unknown, not denied.',
    };
  }
}
