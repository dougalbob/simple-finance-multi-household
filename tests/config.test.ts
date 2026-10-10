import assert from 'node:assert/strict';
import path from 'node:path';
import { describe, it } from 'node:test';
import { isAuthConfigComplete, loadAppConfig } from '../src/lib/config';

describe('loadAppConfig', () => {
  it('defaults the data root to ./data in development and /data in production', () => {
    const dev = loadAppConfig({ NODE_ENV: 'development' });
    assert.equal(dev.dataDir, './data');
    assert.equal(dev.registryPath, path.join('data', 'system', 'registry.sqlite'));

    const prod = loadAppConfig({ NODE_ENV: 'production' });
    assert.equal(prod.dataDir, '/data');
    assert.equal(prod.registryPath, '/data/system/registry.sqlite');
  });

  it('honours only the data root; finance paths cannot be overridden globally', () => {
    const config = loadAppConfig({
      DATA_DIR: '/srv/finance',
      DATABASE_PATH: '/elsewhere/x.sqlite',
      DOCUMENTS_DIR: '/elsewhere/documents',
    });
    assert.equal(config.dataDir, '/srv/finance');
    assert.equal(config.registryPath, path.join('/srv/finance', 'system', 'registry.sqlite'));
    assert.equal('databasePath' in config, false);
    assert.equal('documentsDir' in config, false);
  });

  it('derives the JWKS URL from the issuer unless overridden', () => {
    const derived = loadAppConfig({ AUTH_ISSUER: 'https://team.cloudflareaccess.com' });
    assert.equal(derived.auth.certsUrl, 'https://team.cloudflareaccess.com/cdn-cgi/access/certs');

    const explicit = loadAppConfig({
      AUTH_ISSUER: 'https://team.cloudflareaccess.com',
      AUTH_CERTS_URL: 'https://mirror.example.com/certs',
    });
    assert.equal(explicit.auth.certsUrl, 'https://mirror.example.com/certs');
  });

  it('parses the allowlist case-insensitively, ignoring blanks', () => {
    const config = loadAppConfig({ AUTH_ALLOWED_EMAILS: ' Alex@Example.com , ,sam@example.com ' });
    assert.deepEqual(config.auth.allowedEmails, ['alex@example.com', 'sam@example.com']);
  });

  it('never activates the dev bypass in production, whatever the flags say', () => {
    const config = loadAppConfig({
      NODE_ENV: 'production',
      AUTH_DEV_BYPASS: 'true',
      AUTH_DEV_IDENTITY_EMAIL: 'dev@example.com',
    });
    assert.equal(config.auth.devBypass, false);
  });

  it('activates the dev bypass only with flag AND identity AND non-production', () => {
    assert.equal(
      loadAppConfig({
        NODE_ENV: 'development',
        AUTH_DEV_BYPASS: 'true',
        AUTH_DEV_IDENTITY_EMAIL: 'dev@example.com',
      }).auth.devBypass,
      true,
    );
    assert.equal(
      loadAppConfig({ NODE_ENV: 'development', AUTH_DEV_BYPASS: 'true' }).auth.devBypass,
      false,
    );
    assert.equal(
      loadAppConfig({
        NODE_ENV: 'development',
        AUTH_DEV_IDENTITY_EMAIL: 'dev@example.com',
      }).auth.devBypass,
      false,
    );
  });

  it('marks auth incomplete until issuer, audience and allowlist are all present', () => {
    assert.equal(isAuthConfigComplete(loadAppConfig({}).auth), false);
    assert.equal(
      isAuthConfigComplete(
        loadAppConfig({ AUTH_ISSUER: 'https://x', AUTH_ALLOWED_EMAILS: 'a@example.com' }).auth,
      ),
      false,
    );
    assert.equal(
      isAuthConfigComplete(
        loadAppConfig({
          AUTH_ISSUER: 'https://x',
          AUTH_AUDIENCE: 'aud',
          AUTH_ALLOWED_EMAILS: 'a@example.com',
        }).auth,
      ),
      true,
    );
  });

  it('derives the system registry path from the data root (fixed layout)', () => {
    assert.equal(
      loadAppConfig({ DATA_DIR: '/srv/finance' }).registryPath,
      path.join('/srv/finance', 'system', 'registry.sqlite'),
    );
    assert.equal(
      loadAppConfig({ NODE_ENV: 'production' }).registryPath,
      path.join('/data', 'system', 'registry.sqlite'),
    );
  });

  it('reads the administrator bootstrap knobs, defaulting the household name', () => {
    const none = loadAppConfig({});
    assert.equal(none.registryBootstrap.adminEmail, null);
    assert.equal(none.registryBootstrap.householdName, 'Main household');

    const configured = loadAppConfig({
      REGISTRY_ADMIN_EMAIL: ' Owner@Example.com ',
      REGISTRY_ADMIN_HOUSEHOLD_NAME: 'Owner household',
    });
    assert.equal(configured.registryBootstrap.adminEmail, 'owner@example.com');
    assert.equal(configured.registryBootstrap.householdName, 'Owner household');
  });
});
