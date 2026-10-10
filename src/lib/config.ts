import path from 'node:path';

/**
 * Environment configuration for Simple Finance.
 *
 * The finance database and documents paths are deliberately not configurable
 * independently: both are derived from the authenticated registry household
 * via `src/lib/registry/paths.ts`. The data root is deployment configuration;
 * a browser request never chooses a tenant or path.
 *
 * Fail-closed rule (AGENT_APP_BLUEPRINT.md §4): when authentication is not
 * fully configured in production, every protected entry point must reject.
 * `isAuthConfigComplete` is what the auth guards consult — nothing may cache a
 * partial config as "good enough".
 */
export interface AuthConfig {
  /** Expected Cloudflare Access issuer, e.g. https://team.cloudflareaccess.com */
  readonly issuer: string | null;
  /** Cloudflare Access application AUD tag */
  readonly audience: string | null;
  /** JWKS URL; defaults to `${issuer}/cdn-cgi/access/certs` */
  readonly certsUrl: string | null;
  /** The Cloudflare Access email policy, mirrored at the app boundary. */
  readonly allowedEmails: readonly string[];
  /**
   * Development identity bypass. Computed as false whenever NODE_ENV is
   * production, no matter what the environment says — production must never
   * honour it (blueprint §4.6).
   */
  readonly devBypass: boolean;
  readonly devIdentityEmail: string | null;
}

export interface AppConfig {
  readonly isProduction: boolean;
  /** Data root: ./data in development, /data in the production container */
  readonly dataDir: string;
  /**
   * System registry (control plane, SPEC §18.1):
   * `<dataDir>/system/registry.sqlite`. It contains membership/admin metadata,
   * never finance records.
   */
  readonly registryPath: string;
  /**
   * One-time administrator bootstrap (SPEC §3, MULTI_HOUSEHOLD_PLAN §2):
   * consumed only while the registry roster is empty. The household name is
   * operational metadata for the administrator's own household.
   */
  readonly registryBootstrap: {
    readonly adminEmail: string | null;
    readonly householdName: string;
  };
  readonly auth: AuthConfig;
}

export function isAuthConfigComplete(auth: AuthConfig): boolean {
  return auth.issuer !== null && auth.audience !== null && auth.allowedEmails.length > 0;
}

function trimmed(value: string | undefined): string | null {
  const t = value?.trim();
  return t && t.length > 0 ? t : null;
}

/** Loose env shape so tests can pass partial environments; process.env satisfies it. */
export type EnvSource = Record<string, string | undefined>;

export function loadAppConfig(env: EnvSource = process.env): AppConfig {
  const isProduction = env.NODE_ENV === 'production';
  const dataDir = trimmed(env.DATA_DIR) ?? (isProduction ? '/data' : './data');
  // The registry location is fixed under the data root; finance paths are
  // derived later from the authenticated household ID, never environment input.
  const registryPath = path.join(dataDir, 'system', 'registry.sqlite');

  const registryBootstrap = {
    adminEmail: trimmed(env.REGISTRY_ADMIN_EMAIL)?.toLowerCase() ?? null,
    householdName: trimmed(env.REGISTRY_ADMIN_HOUSEHOLD_NAME) ?? 'Main household',
  };

  const issuer = trimmed(env.AUTH_ISSUER);
  const audience = trimmed(env.AUTH_AUDIENCE);
  const certsUrl =
    trimmed(env.AUTH_CERTS_URL) ??
    (issuer !== null ? `${issuer.replace(/\/+$/, '')}/cdn-cgi/access/certs` : null);
  const allowedEmails = (env.AUTH_ALLOWED_EMAILS ?? '')
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry) => entry.length > 0);

  const devIdentityEmail = trimmed(env.AUTH_DEV_IDENTITY_EMAIL)?.toLowerCase() ?? null;
  const devBypass = env.AUTH_DEV_BYPASS === 'true' && !isProduction && devIdentityEmail !== null;

  return {
    isProduction,
    dataDir,
    registryPath,
    registryBootstrap,
    auth: { issuer, audience, certsUrl, allowedEmails, devBypass, devIdentityEmail },
  };
}
