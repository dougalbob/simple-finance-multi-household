import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import { loadAppConfig, type AppConfig } from '../src/lib/config';
import {
  ENV_EDITABLE_KEYS,
  effectiveEnvFromFile,
  envDrift,
  envFilePath,
  formatEnvValue,
  isEditableEnvKey,
  readEnvFile,
  writeEnvFile,
} from '../src/lib/env-file';
import { makeTempDir } from './helpers';

/**
 * The trusted env-file helpers behind the /admin Server settings panel
 * (issue #91). The file is shell-sourced by the container entrypoint, so the
 * write path must produce safe single-quoted literals, preserve comments and
 * unrelated keys, be atomic, and keep a `.bak` copy. Nothing here touches a
 * real /data: every test runs against a throwaway DATA_DIR.
 */
async function testConfig(): Promise<{ config: AppConfig; dataDir: string }> {
  const dataDir = await makeTempDir('sf-env-file-');
  return { config: loadAppConfig({ NODE_ENV: 'production', DATA_DIR: dataDir }), dataDir };
}

function writeFileRaw(config: AppConfig, content: string): string {
  const p = envFilePath(config);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, content, { mode: 0o600 });
  return p;
}

describe('env file: parsing', () => {
  it('reads a missing file as empty without an error', async () => {
    const { config } = await testConfig();
    const file = readEnvFile(config);
    assert.equal(file.exists, false);
    assert.equal(file.readError, null);
    assert.deepEqual(file.values, {});
  });

  it('parses quoted values, export prefixes, comments and blanks', async () => {
    const { config } = await testConfig();
    writeFileRaw(
      config,
      [
        '# leading comment',
        '',
        "AUTH_ISSUER='https://team.cloudflareaccess.com'",
        'export AUTH_AUDIENCE=aud-tag-123',
        'AUTH_ALLOWED_EMAILS="a@example.com, B@example.com"',
        'CLOUDFLARE_ACCESS_URL=https://dash.cloudflare.com/abc # trailing comment',
        'not a variable line',
        'lower_case=ignored',
      ].join('\n'),
    );
    const file = readEnvFile(config);
    assert.equal(file.exists, true);
    assert.equal(file.values.AUTH_ISSUER, 'https://team.cloudflareaccess.com');
    assert.equal(file.values.AUTH_AUDIENCE, 'aud-tag-123');
    assert.equal(file.values.AUTH_ALLOWED_EMAILS, 'a@example.com, B@example.com');
    assert.equal(file.values.CLOUDFLARE_ACCESS_URL, 'https://dash.cloudflare.com/abc');
    assert.equal('lower_case' in file.values, false);
  });

  it('keeps # characters inside quoted values literal', async () => {
    const { config } = await testConfig();
    writeFileRaw(config, "CLOUDFLARE_ACCESS_URL='https://dash.cloudflare.com/x#anchor'\n");
    const file = readEnvFile(config);
    assert.equal(file.values.CLOUDFLARE_ACCESS_URL, 'https://dash.cloudflare.com/x#anchor');
  });
});

describe('env file: writing', () => {
  it('quotes values as single-quoted shell literals (formatEnvValue)', () => {
    assert.equal(formatEnvValue('plain'), "'plain'");
    assert.equal(formatEnvValue(''), "''");
    // The only escape bash understands inside single quotes.
    assert.equal(formatEnvValue("it's"), "'it'\\''s'");
    // Metacharacters stay literal — no interpolation ever.
    assert.equal(formatEnvValue('$(rm -rf /) `x` " \\;'), "'$(rm -rf /) `x` \" \\;'");
  });

  it('round-trips hostile values through write and read', async () => {
    const { config } = await testConfig();
    const nasty = 'https://x.example.com/$(touch /tmp/pwn)\'`id`" \\ *?[]';
    const result = writeEnvFile({ CLOUDFLARE_ACCESS_URL: nasty }, config);
    assert.equal(result.ok, true);
    const file = readEnvFile(config);
    assert.equal(file.values.CLOUDFLARE_ACCESS_URL, nasty);
  });

  it('rejects values containing line breaks', async () => {
    const { config } = await testConfig();
    const result = writeEnvFile({ AUTH_ISSUER: 'https://x\nrm -rf /' }, config);
    assert.equal(result.ok, false);
    if (!result.ok) assert.match(result.error, /line breaks/);
  });

  it('preserves comments and unrelated keys, patches in place, appends new keys', async () => {
    const { config } = await testConfig();
    writeFileRaw(
      config,
      [
        '# Authentication',
        "AUTH_ISSUER='https://old.cloudflareaccess.com'",
        'PORT=3000 # runtime',
        'AUTH_ALLOWED_EMAILS=a@example.com',
      ].join('\n'),
    );
    const result = writeEnvFile(
      {
        AUTH_ISSUER: 'https://new.cloudflareaccess.com',
        AUTH_ALLOWED_EMAILS: null,
        CLOUDFLARE_ACCESS_URL: 'https://dash.cloudflare.com/abc',
      },
      config,
    );
    assert.equal(result.ok, true);
    const content = fs.readFileSync(envFilePath(config), 'utf8');
    assert.match(content, /# Authentication/);
    assert.match(content, /PORT=3000 # runtime/);
    assert.match(content, /AUTH_ISSUER='https:\/\/new\.cloudflareaccess\.com'/);
    assert.doesNotMatch(content, /AUTH_ALLOWED_EMAILS=/);
    assert.match(content, /CLOUDFLARE_ACCESS_URL='https:\/\/dash\.cloudflare\.com\/abc'/);
    // Unrelated key survived (inline comment stripped on read).
    const file = readEnvFile(config);
    assert.equal(file.values.PORT, '3000');
    assert.equal(file.values.AUTH_ISSUER, 'https://new.cloudflareaccess.com');
    assert.equal('AUTH_ALLOWED_EMAILS' in file.values, false);
  });

  it('creates the file when it does not exist and keeps a .bak of the previous version', async () => {
    const { config } = await testConfig();
    // First write creates the file.
    assert.equal(writeEnvFile({ AUTH_AUDIENCE: 'first' }, config).ok, true);
    assert.equal(fs.existsSync(envFilePath(config)), true);
    assert.equal(fs.existsSync(`${envFilePath(config)}.bak`), false); // nothing to back up
    // Second write backs up the first version.
    assert.equal(writeEnvFile({ AUTH_AUDIENCE: 'second' }, config).ok, true);
    assert.equal(readEnvFile(config).values.AUTH_AUDIENCE, 'second');
    const bak = fs.readFileSync(`${envFilePath(config)}.bak`, 'utf8');
    assert.match(bak, /AUTH_AUDIENCE='first'/);
  });

  it('writes the file with mode 0600', async () => {
    const { config } = await testConfig();
    writeEnvFile({ AUTH_AUDIENCE: 'aud' }, config);
    const mode = fs.statSync(envFilePath(config)).mode & 0o777;
    assert.equal(mode, 0o600);
  });

  it('refuses to write keys outside the editable allowlist', async () => {
    const { config } = await testConfig();
    writeFileRaw(config, "REGISTRY_ADMIN_EMAIL='owner@example.com'\n");
    const result = writeEnvFile({ REGISTRY_ADMIN_EMAIL: 'attacker@example.com' }, config);
    assert.equal(result.ok, false);
    if (!result.ok) assert.match(result.error, /not editable/);
    // The original file is untouched.
    assert.equal(readEnvFile(config).values.REGISTRY_ADMIN_EMAIL, 'owner@example.com');
    // PATH-style keys are refused too — this module never touches the shell
    // environment beyond the allowlist.
    assert.equal(writeEnvFile({ PATH: '/evil' }, config).ok, false);
  });

  it('exposes exactly the issue-#91 keys as editable', () => {
    assert.deepEqual(
      [...ENV_EDITABLE_KEYS],
      [
        'AUTH_ISSUER',
        'AUTH_AUDIENCE',
        'AUTH_CERTS_URL',
        'AUTH_ALLOWED_EMAILS',
        'CLOUDFLARE_ACCESS_URL',
      ],
    );
    assert.equal(isEditableEnvKey('AUTH_ISSUER'), true);
    assert.equal(isEditableEnvKey('REGISTRY_ADMIN_EMAIL'), false);
  });
});

describe('env file: restart drift', () => {
  it('reports no drift when the file is absent or matches the live values', async () => {
    const { config } = await testConfig();
    const base = {
      NODE_ENV: 'production',
      DATA_DIR: config.dataDir,
      AUTH_ISSUER: 'https://team.cloudflareaccess.com',
      AUTH_AUDIENCE: 'aud-1',
    };
    const live = loadAppConfig(base);
    // No file yet: nothing saved, nothing to drift.
    assert.equal(envDrift(readEnvFile(config), live, base), false);
    // File matches: no drift.
    writeEnvFile(
      { AUTH_ISSUER: 'https://team.cloudflareaccess.com', AUTH_AUDIENCE: 'aud-1' },
      config,
    );
    assert.equal(envDrift(readEnvFile(config), live, base), false);
  });

  it('reports drift when the file differs from the live values', async () => {
    const { config } = await testConfig();
    const base = {
      NODE_ENV: 'production',
      DATA_DIR: config.dataDir,
      AUTH_ISSUER: 'https://team.cloudflareaccess.com',
      AUTH_AUDIENCE: 'aud-1',
    };
    const live = loadAppConfig(base);
    writeEnvFile({ AUTH_AUDIENCE: 'aud-2' }, config);
    assert.equal(envDrift(readEnvFile(config), live, base), true);
  });

  it('overlays only keys present in the file (entrypoint semantics)', async () => {
    const { config } = await testConfig();
    writeFileRaw(config, "AUTH_AUDIENCE='from-file'\n");
    const file = readEnvFile(config);
    const merged = effectiveEnvFromFile(file, {
      AUTH_ISSUER: 'https://from-container',
      AUTH_AUDIENCE: 'from-container',
      AUTH_ALLOWED_EMAILS: 'container@example.com',
    });
    // File wins for present keys…
    assert.equal(merged.AUTH_AUDIENCE, 'from-file');
    // …and the container keeps anything the file does not mention.
    assert.equal(merged.AUTH_ISSUER, 'https://from-container');
    assert.equal(merged.AUTH_ALLOWED_EMAILS, 'container@example.com');
  });
});
