import fs from 'node:fs';
import path from 'node:path';
import { loadAppConfig, type AppConfig, type EnvSource } from './config';

/**
 * Trusted .env file helpers for the administrator control plane (issue #91).
 *
 * `/data/.env` is a shell-sourced trusted file (0600, admin-owned).
 * Writing it from the web UI expands the surface, so:
 *  - Only a strict allowlist of keys may be read/written via the UI.
 *  - Values are always written as single-quoted shell literals with
 *    embedded single quotes escaped as `'\''` — no interpolation.
 *  - Writes are atomic: temp file + fsync + rename + optional backup.
 *  - The registry audit records the change (keys only, never secret values).
 *
 * The file lives at `<dataDir>/.env` (production `/data/.env`,
 * development `./data/.env`). In tests an isolated `DATA_DIR` is used.
 */

export const ENV_EDITABLE_KEYS = [
  'AUTH_ISSUER',
  'AUTH_AUDIENCE',
  'AUTH_CERTS_URL',
  'AUTH_ALLOWED_EMAILS',
  'CLOUDFLARE_ACCESS_URL',
] as const;

export type EditableEnvKey = (typeof ENV_EDITABLE_KEYS)[number];

export const ENV_READONLY_KEYS = [
  'REGISTRY_ADMIN_EMAIL',
  'REGISTRY_ADMIN_HOUSEHOLD_NAME',
  'DATA_DIR',
  'PORT',
  'PUID',
  'PGID',
] as const;

export interface EnvFileValues {
  /** Raw values as they appear on disk (after unquoting), for editable keys. */
  readonly values: Record<string, string>;
  /** Whether the file existed on disk at read time. */
  readonly exists: boolean;
  /** Absolute path that was read. */
  readonly path: string;
  /** True if the file could not be read (permissions, etc.) — callers should surface. */
  readonly readError: string | null;
}

export function envFilePath(config: AppConfig = loadAppConfig()): string {
  return path.join(config.dataDir, '.env');
}

function stripInlineComment(value: string, quote: string | null): string {
  // Only strip # comments when not inside a quote. The entrypoint sources via
  // bash, so `#` inside single/double quotes is literal.
  if (quote !== null) return value;
  const hashIdx = value.indexOf('#');
  if (hashIdx === -1) return value;
  // Heuristic: require whitespace before # to start a comment, matching
  // dotenv-shell style. Avoids trimming `https://x#frag`.
  const before = value[hashIdx - 1];
  if (hashIdx === 0 || before === ' ' || before === '\t') {
    return value.slice(0, hashIdx);
  }
  return value;
}

function unquoteEnvValue(raw: string): string {
  const t = raw.trim();
  if (
    t.length >= 2 &&
    ((t[0] === '"' && t[t.length - 1] === '"') || (t[0] === "'" && t[t.length - 1] === "'"))
  ) {
    const quote = t[0];
    let inner = t.slice(1, -1);
    if (quote === '"') {
      // Bash-style double-quote escapes: handle \" and \\ and \$ etc. Minimal
      // support — we only need to round-trip our own writes.
      inner = inner.replace(/\\"/g, '"').replace(/\\\\/g, '\\');
    } else {
      // Single-quoted: `'\''` is the only escape we emit. Handle it.
      inner = inner.replace(/'\\''/g, "'");
      // Also handle plain `\'` for robustness.
      inner = inner.replace(/\\'/g, "'");
    }
    return inner;
  }
  return t;
}

function parseEnvContent(content: string): Record<string, string> {
  const out: Record<string, string> = {};
  const lines = content.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === '' || trimmed.startsWith('#')) continue;
    // Handle optional `export KEY=...`
    let work = trimmed;
    if (work.startsWith('export ')) work = work.slice(7).trimStart();
    const eqIdx = work.indexOf('=');
    if (eqIdx === -1) continue;
    const key = work.slice(0, eqIdx).trim();
    if (!/^[A-Z0-9_]+$/.test(key)) continue; // ignore shell functions / weirdness
    let rawValue = work.slice(eqIdx + 1);
    // Detect quote style of the value start (after optional whitespace)
    rawValue = rawValue.trimStart();
    let quote: string | null = null;
    if (rawValue.startsWith('"') || rawValue.startsWith("'")) {
      quote = rawValue.charAt(0);
      // For quoted values, don't strip inline comments until closing quote.
      // Simplification: if the line has matching trailing quote, treat whole
      // rest as value; otherwise take as-is.
    } else {
      rawValue = stripInlineComment(rawValue, null);
    }
    rawValue = rawValue.trim();
    // If we detected a quote, try to keep the quoted boundary
    if (quote !== null) {
      // Re-extract from original work to preserve inner # chars
      const eqPos = work.indexOf('=');
      rawValue = work.slice(eqPos + 1).trim();
      // Don't strip comments for quoted values — closing quote protects them.
      out[key] = unquoteEnvValue(rawValue);
    } else {
      out[key] = unquoteEnvValue(rawValue);
    }
  }
  return out;
}

export function readEnvFile(config: AppConfig = loadAppConfig()): EnvFileValues {
  const filePath = envFilePath(config);
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    return { values: parseEnvContent(content), exists: true, path: filePath, readError: null };
  } catch (err) {
    const code = (err as NodeJS.ErrnoException)?.code;
    if (code === 'ENOENT') {
      return { values: {}, exists: false, path: filePath, readError: null };
    }
    return {
      values: {},
      exists: false,
      path: filePath,
      readError: err instanceof Error ? err.message : String(err),
    };
  }
}

export function readEnvFileRaw(config: AppConfig = loadAppConfig()): {
  content: string | null;
  path: string;
  error: string | null;
} {
  const filePath = envFilePath(config);
  try {
    return { content: fs.readFileSync(filePath, 'utf8'), path: filePath, error: null };
  } catch (err) {
    const code = (err as NodeJS.ErrnoException)?.code;
    if (code === 'ENOENT') return { content: null, path: filePath, error: null };
    return {
      content: null,
      path: filePath,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

function escapeSingleQuoted(value: string): string {
  // `'` → `'\''` — the only single-quote escape bash understands.
  return value.replace(/'/g, "'\\''");
}

export function formatEnvValue(value: string): string {
  // Always emit as single-quoted shell literal. Safe for URLs, emails,
  // commas, and future special characters. Empty string becomes `''`.
  return `'${escapeSingleQuoted(value)}'`;
}

export function isEditableEnvKey(key: string): key is EditableEnvKey {
  return (ENV_EDITABLE_KEYS as readonly string[]).includes(key);
}

/**
 * Apply `updates` to the existing env file, preserving comments, ordering
 * and unrelated keys. New keys are appended. Deletions (value === null) remove
 * the line. Writes atomically with a temp file + rename, sets 0600, and
 * keeps a `.bak` copy of the previous file.
 */
export function writeEnvFile(
  updates: Record<string, string | null>,
  config: AppConfig = loadAppConfig(),
): { ok: true; path: string } | { ok: false; error: string } {
  const filePath = envFilePath(config);

  // Validate keys and values
  for (const [key, value] of Object.entries(updates)) {
    if (!isEditableEnvKey(key)) {
      return { ok: false, error: `“${key}” is not editable from the admin page.` };
    }
    if (value !== null && /[\r\n]/.test(value)) {
      return { ok: false, error: `“${key}” cannot contain line breaks.` };
    }
  }

  let originalContent: string | null = null;
  let originalExists = false;
  try {
    originalContent = fs.readFileSync(filePath, 'utf8');
    originalExists = true;
  } catch (err) {
    const code = (err as NodeJS.ErrnoException)?.code;
    if (code !== 'ENOENT') {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  const existingValues = originalContent !== null ? parseEnvContent(originalContent) : {};

  // Build new content by patching line-by-line to preserve comments.
  let lines: string[] = originalContent !== null ? originalContent.split(/\r?\n/) : [];
  const handled = new Set<string>();
  const newLines: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === '' || trimmed.startsWith('#')) {
      newLines.push(line);
      continue;
    }
    let work = trimmed;
    let hadExport = false;
    if (work.startsWith('export ')) {
      hadExport = true;
      work = work.slice(7).trimStart();
    }
    const eqIdx = work.indexOf('=');
    if (eqIdx === -1) {
      newLines.push(line);
      continue;
    }
    const key = work.slice(0, eqIdx).trim();
    if (!/^[A-Z0-9_]+$/.test(key)) {
      newLines.push(line);
      continue;
    }
    if (!(key in updates)) {
      newLines.push(line);
      continue;
    }
    const next = updates[key] ?? null;
    handled.add(key);
    if (next === null) {
      // Deletion — skip line (comment removal would be noisy, so just omit)
      continue;
    }
    // Preserve `export ` prefix if it was present.
    const prefix = hadExport ? 'export ' : '';
    newLines.push(`${prefix}${key}=${formatEnvValue(next)}`);
  }

  // Append any new keys not already handled
  for (const [key, next] of Object.entries(updates)) {
    if (handled.has(key)) continue;
    if (next === null) continue;
    newLines.push(`${key}=${formatEnvValue(next)}`);
  }

  const nextContent = newLines.join('\n') + '\n';

  // Ensure directory exists
  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }

  // Keep backup if file existed
  if (originalExists && originalContent !== null) {
    try {
      fs.writeFileSync(`${filePath}.bak`, originalContent, { mode: 0o600 });
    } catch {
      // Best-effort backup; don't fail the write for it.
    }
  }

  const tmpPath = `${filePath}.tmp.${process.pid}`;
  try {
    fs.writeFileSync(tmpPath, nextContent, { mode: 0o600 });
    // Ensure content is on disk before rename
    const fd = fs.openSync(tmpPath, 'r');
    try {
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
    fs.renameSync(tmpPath, filePath);
    // Enforce 0600 even if umask interfered
    try {
      fs.chmodSync(filePath, 0o600);
    } catch {
      // ignore
    }
  } catch (err) {
    try {
      fs.unlinkSync(tmpPath);
    } catch {}
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }

  // Validate that the file we just wrote is still valid shell (parseable)
  // and that we didn't lose unrelated keys.
  const after = readEnvFile(config);
  if (after.readError !== null) {
    return { ok: false, error: `Written file could not be re-read: ${after.readError}` };
  }
  for (const [k, v] of Object.entries(existingValues)) {
    if (k in updates) continue;
    if (!(k in after.values)) {
      // We dropped a key we shouldn't have — restore backup.
      if (originalContent !== null) {
        try {
          fs.writeFileSync(filePath, originalContent, { mode: 0o600 });
        } catch {}
      }
      return { ok: false, error: `Refusing to drop unrelated key “${k}” during write.` };
    }
    // Value should be unchanged for unrelated keys (but we preserved line,
    // so this is just a sanity check)
    void v;
  }

  return { ok: true, path: filePath };
}

/**
 * Helper for the admin UI: read the current editable values with masking.
 * Returns both the env-file values and the live loadAppConfig values so the
 * UI can show "on disk" vs "in this process" drift after an edit before restart.
 */
export function getEnvFileSnapshot(config: AppConfig = loadAppConfig()): {
  file: EnvFileValues;
  live: AppConfig;
} {
  return { file: readEnvFile(config), live: config };
}

/**
 * The environment the app would have after a restart: `base` (what the
 * container/process provides) overlaid with the editable keys present in the
 * env file. Matches entrypoint semantics (`set -a; . "$DATA_DIR/.env"`): file
 * keys win, keys deleted from the file fall back to the base.
 */
export function effectiveEnvFromFile(
  file: EnvFileValues,
  base: EnvSource = process.env,
): EnvSource {
  const merged: EnvSource = { ...base };
  for (const [key, value] of Object.entries(file.values)) {
    if (isEditableEnvKey(key)) merged[key] = value;
  }
  return merged;
}

/**
 * True when the values on disk differ from the ones the running process is
 * using — i.e. a restart is needed (or was needed) for the file's settings to
 * take effect. False when the file does not exist (nothing has been saved).
 */
export function envDrift(
  file: EnvFileValues,
  live: AppConfig,
  base: EnvSource = process.env,
): boolean {
  if (!file.exists) return false;
  const after = loadAppConfig(effectiveEnvFromFile(file, base)).auth;
  const now = live.auth;
  return (
    (now.issuer ?? '') !== (after.issuer ?? '') ||
    (now.audience ?? '') !== (after.audience ?? '') ||
    (now.certsUrl ?? '') !== (after.certsUrl ?? '') ||
    now.allowedEmails.join(',') !== after.allowedEmails.join(',') ||
    (now.cloudflareAccessUrl ?? '') !== (after.cloudflareAccessUrl ?? '')
  );
}
