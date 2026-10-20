import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import type { AuthConfig } from '../src/lib/config';
import { AuthConfigError, AuthVerificationError, verifyAccessJwt } from '../src/lib/auth/verify';
import { startMockAccessAuthority, type MockAccessAuthority } from './helpers';

/**
 * Exercises the real jose verification path against a local JWKS endpoint:
 * signature, issuer, audience and expiry — the fail-closed rules from
 * AGENT_APP_BLUEPRINT.md §4. Allowlist enforcement moved to the session gate
 * (issue #91: env allowlist is a fallback; the registry roster auto-derives).
 */
describe('verifyAccessJwt', () => {
  let authority: MockAccessAuthority;
  let auth: AuthConfig;

  before(async () => {
    authority = await startMockAccessAuthority();
    auth = {
      issuer: authority.issuer,
      audience: authority.audience,
      certsUrl: authority.certsUrl,
      allowedEmails: ['alex@example.com', 'sam@example.com'],
      cloudflareAccessUrl: null,
      devBypass: false,
      devIdentityEmail: null,
    };
  });

  after(async () => {
    await authority.close();
  });

  it('accepts a valid token and returns the identity', async () => {
    const identity = await verifyAccessJwt(await authority.mintToken(), auth);
    assert.equal(identity.email, 'alex@example.com');
  });

  it('reads the standard email claim as a fallback', async () => {
    const token = await authority.mintToken({ email: 'sam@example.com', emailClaim: 'email' });
    const identity = await verifyAccessJwt(token, auth);
    assert.equal(identity.email, 'sam@example.com');
  });

  it('normalises email case before checking the allowlist', async () => {
    const token = await authority.mintToken({ email: 'ALEX@EXAMPLE.COM' });
    const identity = await verifyAccessJwt(token, auth);
    assert.equal(identity.email, 'alex@example.com');
  });

  it('rejects expired tokens', async () => {
    const token = await authority.mintToken({ expiresInSeconds: -60 });
    await assert.rejects(() => verifyAccessJwt(token, auth), AuthVerificationError);
  });

  it('rejects tokens from the wrong issuer', async () => {
    const token = await authority.mintToken({ issuer: 'https://evil.example.com' });
    await assert.rejects(() => verifyAccessJwt(token, auth), AuthVerificationError);
  });

  it('rejects tokens for the wrong audience', async () => {
    const token = await authority.mintToken({ audience: 'somebody-elses-app' });
    await assert.rejects(() => verifyAccessJwt(token, auth), AuthVerificationError);
  });

  it('returns the identity even when the env allowlist does not list it (issue #91)', async () => {
    // The allowlist is enforced by the session gate (registry roster OR env
    // fallback), not here — a verified token for a stranger resolves fine and
    // is denied later if no roster row or env entry allows it.
    const token = await authority.mintToken({ email: 'stranger@example.com' });
    const identity = await verifyAccessJwt(token, auth);
    assert.equal(identity.email, 'stranger@example.com');
  });

  it('rejects signatures from a key that is not in the JWKS', async () => {
    const token = await authority.mintToken({ signWithWrongKey: true });
    await assert.rejects(() => verifyAccessJwt(token, auth), AuthVerificationError);
  });

  it('rejects garbage that is not a JWT at all', async () => {
    await assert.rejects(() => verifyAccessJwt('not-a-token', auth), AuthVerificationError);
  });

  it('fails closed with a config error when auth is not fully configured', async () => {
    const token = await authority.mintToken();
    await assert.rejects(() => verifyAccessJwt(token, { ...auth, issuer: null }), AuthConfigError);
    await assert.rejects(
      () => verifyAccessJwt(token, { ...auth, audience: null }),
      AuthConfigError,
    );
    await assert.rejects(
      () => verifyAccessJwt(token, { ...auth, certsUrl: null }),
      AuthConfigError,
    );
  });
});
