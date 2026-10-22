import { z } from 'zod';

// Deliberately bounded subset of the current Cloudflare writable schema. Every
// object is strict: a new field/selector must be reviewed, never silently lost.
export const directEmailRule = z
  .object({
    email: z.object({ email: z.string().email() }).strict(),
  })
  .strict();
const stringValue = z.string().min(1);
const ruleSchema = z.union([
  directEmailRule,
  z.object({ email_domain: z.object({ domain: stringValue }).strict() }).strict(),
  z.object({ group: z.object({ id: stringValue }).strict() }).strict(),
  z.object({ everyone: z.object({}).strict() }).strict(),
  z.object({ ip: z.object({ ip: stringValue }).strict() }).strict(),
  z.object({ geo: z.object({ country_code: stringValue }).strict() }).strict(),
  z.object({ login_method: z.object({ id: stringValue }).strict() }).strict(),
  z.object({ auth_method: z.object({ auth_method: stringValue }).strict() }).strict(),
]);
export const writablePolicySchema = z
  .object({
    name: stringValue,
    decision: z.literal('allow'),
    include: z.array(ruleSchema).min(1),
    require: z.array(ruleSchema).optional(),
    exclude: z.array(ruleSchema).optional(),
    approval_groups: z
      .array(
        z
          .object({
            approvals_needed: z.number().int().nonnegative(),
            email_addresses: z.array(z.string().email()).optional(),
            email_list_uuid: stringValue.optional(),
          })
          .strict(),
      )
      .optional(),
    approval_required: z.boolean().optional(),
    isolation_required: z.boolean().optional(),
    purpose_justification_prompt: z.string().optional(),
    purpose_justification_required: z.boolean().optional(),
    session_duration: z.string().nullable().optional(),
    connection_rules: z
      .object({
        rdp: z
          .object({
            allowed_clipboard_local_to_remote_formats: z.array(z.enum(['text', 'file'])).optional(),
            allowed_clipboard_remote_to_local_formats: z.array(z.enum(['text', 'file'])).optional(),
          })
          .strict()
          .optional(),
      })
      .strict()
      .optional(),
    mfa_config: z
      .object({
        allowed_authenticators: z.array(z.enum(['totp', 'biometrics', 'security_key'])).optional(),
        mfa_disabled: z.boolean().optional(),
        session_duration: z.string().optional(),
      })
      .strict()
      .optional(),
  })
  .strict();
// Read-only response metadata. Cloudflare returns these on the account-level
// reusable-policy GET even though they are not writable parameters: `uid` is a
// legacy identifier still emitted alongside `id`, and `precedence` is
// documented on the policy response but absent in some accounts (where it can
// also be null). Accepting a bounded, reviewed shape keeps the read strict
// without turning known provider metadata into a refusal. Both are stripped
// from the PUT body by `writablePolicy()`.
export const reusablePolicySchema = writablePolicySchema
  .extend({
    id: stringValue,
    uid: stringValue.optional(),
    account_id: stringValue.optional(),
    reusable: z.literal(true),
    app_count: z.literal(1),
    precedence: z.number().int().nullable().optional(),
    created_at: z.string().optional(),
    updated_at: z.string().optional(),
  })
  .strict();
export type ReusablePolicy = z.infer<typeof reusablePolicySchema>;
export type WritablePolicy = z.infer<typeof writablePolicySchema>;

/** Explicit projection, NOT the read-only inspection's lossy email summary. */
export function writablePolicy(policy: ReusablePolicy): WritablePolicy {
  // `uid`/`precedence` are read-only provider metadata: they are validated on
  // read but never written, and excluding them keeps drift comparisons free of
  // metadata-only churn.
  const { id, uid, account_id, reusable, app_count, precedence, created_at, updated_at, ...body } =
    policy;
  void [id, uid, account_id, reusable, app_count, precedence, created_at, updated_at];
  return writablePolicySchema.parse(body);
}

/** Object key order is not an edit; array order and every value are. */
export function fingerprint(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(fingerprint).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    return `{${Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${fingerprint(item)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}
