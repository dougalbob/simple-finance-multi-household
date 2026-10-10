import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { exportJWK, generateKeyPair, SignJWT, type KeyLike } from 'jose';
import { openDatabase } from '../src/lib/db/client';
import { applyMigrations } from '../src/lib/db/migrate';
import { storeAttachment } from '../src/lib/records/attachments';
import { findChildCategory } from '../src/lib/records/categories';
import { createPerson, setPersonEmail } from '../src/lib/records/people';
import { addCheckpoint, createPot } from '../src/lib/records/pots';
import { createPurchase } from '../src/lib/records/purchases';
import { createSupplier } from '../src/lib/records/suppliers';
import { openRegistry } from '../src/lib/registry/db';
import { assignIdentity, createHousehold, setHouseholdStatus } from '../src/lib/registry/domain';
import {
  householdDatabasePath,
  householdDocumentsDir,
  systemRegistryPath,
} from '../src/lib/registry/paths';

/**
 * Plan step 6 acceptance on FICTIONAL data (docs/MULTI_HOUSEHOLD_PLAN.md §7).
 *
 * It runs the production build (`npm run build` first) with the same
 * production settings the container uses, against a throwaway data root under
 * the git-ignored `.acceptance/` folder:
 *
 *   - three fictional households: Alex & Sam (Alex is an administrator), Other,
 *     and a Retired household that the administrator has deactivated;
 *   - a local stand-in for Cloudflare Access: a JWKS server and tokens signed
 *     with a key this script makes. The app verifies those tokens exactly as it
 *     verifies real Access tokens (issuer, audience, expiry, RS256, allowlist);
 *   - real HTTP requests to the running app, for each access rule.
 *
 * It does not contact Cloudflare, Unraid, Docker or GHCR, and it never touches
 * a real appdata path. Run with `npm run acceptance` (after `npm run build`).
 */

const REPO = process.cwd();
const ROOT = path.join(REPO, '.acceptance');
const DATA_DIR = path.join(ROOT, 'appdata');
const REPORT = path.join(ROOT, 'REPORT.md');
const APP_PORT = 3320;
const JWKS_PORT = 3321;
const BASE = `http://127.0.0.1:${APP_PORT}`;
const ISSUER = 'https://acceptance-team.example.invalid';
const AUDIENCE = 'acceptance-audience-tag';
const CERTS_URL = `http://127.0.0.1:${JWKS_PORT}/cdn-cgi/access/certs`;
const PASSPHRASE = 'acceptance-passphrase-only';

const ALEX = 'alex@example.com';
const SAM = 'sam@example.com';
const OTHER = 'other@example.com';
const RETIRED = 'retired@example.com';
const STRANGER = 'stranger@example.com';
const ALLOWED = [ALEX, SAM, OTHER, RETIRED, STRANGER];

const MARK = {
  A: 'Acceptance Main account',
  B: 'Other Main account',
  C: 'Retired Main account',
} as const;

interface Result {
  area: string;
  name: string;
  ok: boolean;
  detail: string;
}
const results: Result[] = [];
let area = '';
function section(name: string): void {
  area = name;
  console.log(`\n== ${name}`);
}
function record(name: string, ok: boolean, detail = ''): void {
  results.push({ area, name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

// ---------------------------------------------------------------------------
// Fictional installation
// ---------------------------------------------------------------------------

async function buildInstallation(): Promise<{
  a: string;
  b: string;
  c: string;
  fileKey: string;
  sha256: string;
}> {
  const registry = openRegistry(systemRegistryPath(DATA_DIR));
  let a = '';
  let b = '';
  let c = '';
  try {
    a = createHousehold(registry, { displayName: 'Alex & Sam (acceptance)', actor: 'system' }).id;
    assignIdentity(registry, {
      email: ALEX,
      householdId: a,
      role: 'platform_admin',
      actor: 'system',
    });
    assignIdentity(registry, { email: SAM, householdId: a, actor: 'system' });
    b = createHousehold(registry, { displayName: 'Other (acceptance)', actor: 'system' }).id;
    assignIdentity(registry, {
      email: OTHER,
      householdId: b,
      role: 'platform_admin',
      actor: 'system',
    });
    c = createHousehold(registry, { displayName: 'Retired (acceptance)', actor: 'system' }).id;
    assignIdentity(registry, { email: RETIRED, householdId: c, actor: 'system' });
    setHouseholdStatus(registry, { householdId: c, status: 'deactivated', actor: 'system' });
  } finally {
    registry.close();
  }

  const now = new Date('2026-09-01T10:00:00Z');
  const seedHousehold = async (
    id: string,
    potLabel: string,
    personLabel: string,
    email: string | null,
    withAttachment: boolean,
  ) => {
    const handle = openDatabase(householdDatabasePath(DATA_DIR, id));
    applyMigrations(handle.db);
    const db = handle.db;
    const person = createPerson(db, { label: personLabel, actor: 'seed', now });
    if (email !== null) {
      setPersonEmail(db, {
        id: person.id,
        email,
        allowedEmails: ALLOWED,
        actor: 'seed',
        now,
      });
    }
    const pot = createPot(db, { label: potLabel, kind: 'bank', actor: 'seed', now });
    addCheckpoint(db, { potId: pot.id, amountPence: 123400, actor: 'seed', now });
    const groceries = findChildCategory(db, 'Groceries', 'Weekly Shop');
    if (groceries === null) throw new Error('acceptance: category tree is missing Weekly Shop');
    const supplier = createSupplier(db, { name: `${personLabel} supplier`, actor: 'seed', now });
    const purchase = createPurchase(db, {
      potId: pot.id,
      totalPence: 2500,
      occurredAt: new Date('2026-08-20T12:00:00Z'),
      paidByPersonId: person.id,
      supplierId: supplier.id,
      note: 'Fictional acceptance shop',
      actor: 'seed',
      lines: [{ amountPence: 2500, categoryId: groceries.id, targetKind: 'household' }],
      now,
    });
    let stored: { fileKey: string; sha256: string } | null = null;
    if (withAttachment) {
      const pdf = Buffer.from('%PDF-1.4\n% fictional acceptance receipt\n%%EOF\n', 'latin1');
      const saved = await storeAttachment({
        db,
        purchaseId: purchase.purchase.id,
        originalName: 'fictional-receipt.pdf',
        bytes: pdf,
        actor: 'seed',
        documentsDir: householdDocumentsDir(DATA_DIR, id),
        now,
      });
      stored = { fileKey: saved.fileKey, sha256: saved.sha256 };
    }
    handle.raw.close();
    return stored;
  };

  const storedA = await seedHousehold(a, MARK.A, 'Alex', ALEX, true);
  await seedHousehold(b, MARK.B, 'Other person', OTHER, false);
  await seedHousehold(c, MARK.C, 'Retired person', RETIRED, false);
  if (storedA === null) throw new Error('acceptance: household A attachment was not stored');
  return { a, b, c, fileKey: storedA.fileKey, sha256: storedA.sha256 };
}

// ---------------------------------------------------------------------------
// Stand-in for Cloudflare Access
// ---------------------------------------------------------------------------

interface Keys {
  trusted: KeyLike;
  trustedKid: string;
  attacker: KeyLike;
  attackerKid: string;
  jwks: { keys: object[] };
}

async function makeKeys(): Promise<Keys> {
  const trusted = await generateKeyPair('RS256');
  const attacker = await generateKeyPair('RS256');
  const trustedJwk = {
    ...(await exportJWK(trusted.publicKey)),
    kid: 'acceptance-trusted',
    alg: 'RS256',
    use: 'sig',
  };
  return {
    trusted: trusted.privateKey,
    trustedKid: 'acceptance-trusted',
    attacker: attacker.privateKey,
    attackerKid: 'acceptance-attacker',
    jwks: { keys: [trustedJwk] },
  };
}

function startJwks(keys: Keys): Promise<http.Server> {
  const server = http.createServer((req, res) => {
    if (req.url === '/cdn-cgi/access/certs') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(keys.jwks));
      return;
    }
    res.writeHead(404).end();
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(JWKS_PORT, '127.0.0.1', () => resolve(server));
  });
}

interface TokenOptions {
  email?: string;
  key?: 'trusted' | 'attacker';
  audience?: string;
  issuer?: string;
  expiresIn?: string;
  claimEmail?: string;
}

async function token(keys: Keys, options: TokenOptions = {}): Promise<string> {
  const email = options.email ?? ALEX;
  const signingKey = options.key === 'attacker' ? keys.attacker : keys.trusted;
  const kid = options.key === 'attacker' ? keys.attackerKid : keys.trustedKid;
  return new SignJWT({
    email,
    'cf-access-authenticated-user-email': options.claimEmail ?? email,
  })
    .setProtectedHeader({ alg: 'RS256', kid })
    .setIssuer(options.issuer ?? ISSUER)
    .setAudience(options.audience ?? AUDIENCE)
    .setSubject(`sub-${email}`)
    .setIssuedAt()
    .setExpirationTime(options.expiresIn ?? '10m')
    .sign(signingKey);
}

// ---------------------------------------------------------------------------
// The app under test
// ---------------------------------------------------------------------------

function runStartupScript(script: string): void {
  const result = spawnSync('node', [path.join('scripts', script)], {
    cwd: REPO,
    env: { ...process.env, DATA_DIR },
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    throw new Error(`${script} failed: ${result.stdout}${result.stderr}`);
  }
}

function startApp(): ChildProcess {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    NODE_ENV: 'production',
    NEXT_TELEMETRY_DISABLED: '1',
    DATA_DIR,
    PORT: String(APP_PORT),
    AUTH_ISSUER: ISSUER,
    AUTH_AUDIENCE: AUDIENCE,
    AUTH_CERTS_URL: CERTS_URL,
    AUTH_ALLOWED_EMAILS: ALLOWED.join(','),
  };
  delete env.AUTH_DEV_BYPASS;
  delete env.AUTH_DEV_IDENTITY_EMAIL;
  return spawn(
    path.join(REPO, 'node_modules', '.bin', 'next'),
    ['start', '-H', '127.0.0.1', '-p', String(APP_PORT)],
    { cwd: REPO, env, stdio: ['ignore', 'pipe', 'pipe'] },
  );
}

async function waitForApp(timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${BASE}/api/health`);
      if (res.status === 200) return;
    } catch {
      // not listening yet
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error('acceptance: the app did not start within the time limit');
}

interface Reply {
  status: number;
  text: string;
  bytes: Buffer;
  location: string | null;
}

async function call(
  method: string,
  pathname: string,
  options: { token?: string; headers?: Record<string, string>; body?: BodyInit } = {},
): Promise<Reply> {
  const headers: Record<string, string> = { ...(options.headers ?? {}) };
  if (options.token !== undefined) headers['cf-access-jwt-assertion'] = options.token;
  const res = await fetch(`${BASE}${pathname}`, {
    method,
    headers,
    body: options.body,
    redirect: 'manual',
  });
  const bytes = Buffer.from(await res.arrayBuffer());
  return {
    status: res.status,
    text: bytes.toString('utf8'),
    bytes,
    location: res.headers.get('location'),
  };
}

function containsAny(text: string, labels: string[]): string[] {
  return labels.filter((label) => text.includes(label));
}

function sha256(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}

// ---------------------------------------------------------------------------
// Acceptance checks
// ---------------------------------------------------------------------------

async function runChecks(
  keys: Keys,
  ids: { a: string; b: string; c: string; fileKey: string; sha256: string },
): Promise<void> {
  const allMarks = Object.values(MARK);
  const pages = ['/pots', '/purchases'];

  section('Sign-in and denial');
  {
    const r = await call('GET', '/api/health');
    record('health endpoint answers without sign-in', r.status === 200, `HTTP ${r.status}`);
  }
  for (const page of pages) {
    const r = await call('GET', page);
    const leaked = containsAny(r.text, allMarks);
    record(
      `no sign-in: ${page} shows no household data`,
      leaked.length === 0 && r.status !== 200,
      `HTTP ${r.status}${r.location ? ` → ${r.location}` : ''}`,
    );
  }
  {
    const r = await call('GET', '/api/attention', {});
    record(
      'no sign-in: attention API refuses',
      r.status === 401 || r.status === 403 || r.status === 503,
      `HTTP ${r.status}`,
    );
  }

  const denialCases: { name: string; options: TokenOptions }[] = [
    {
      name: 'stranger (Cloudflare-allowed, not assigned in the registry)',
      options: { email: STRANGER },
    },
    { name: 'retired household member (household deactivated)', options: { email: RETIRED } },
    {
      name: 'forged signature (signed by another key, claims Alex)',
      options: { email: ALEX, key: 'attacker' },
    },
    { name: 'wrong audience', options: { email: ALEX, audience: 'some-other-app' } },
    { name: 'wrong issuer', options: { email: ALEX, issuer: 'https://evil.example.invalid' } },
    { name: 'expired token', options: { email: ALEX, expiresIn: '-5m' } },
    {
      name: 'identity not on the Cloudflare allowlist',
      options: { email: 'intruder@example.com' },
    },
  ];
  for (const denial of denialCases) {
    const tok = await token(keys, denial.options);
    let leaked: string[] = [];
    let worst = 0;
    for (const page of pages) {
      const r = await call('GET', page, { token: tok });
      leaked = [...leaked, ...containsAny(r.text, allMarks)];
      if (r.status === 200) worst = 200;
    }
    const api = await call('GET', '/api/attention', { token: tok });
    record(
      `denied: ${denial.name}`,
      leaked.length === 0 && worst !== 200 && api.status !== 200,
      `pages leaked: ${leaked.length}; attention HTTP ${api.status}`,
    );
  }

  section('Household isolation');
  const alexTok = await token(keys, { email: ALEX });
  const samTok = await token(keys, { email: SAM });
  const otherTok = await token(keys, { email: OTHER });

  {
    // Validly signed token whose two identity claims disagree: the Cloudflare
    // claim is what the app uses, so the response must show that one household
    // only, never a mix of both.
    const conflicted = await token(keys, { email: ALEX, claimEmail: OTHER });
    const r = await call('GET', '/pots', { token: conflicted });
    const sawA = r.text.includes(MARK.A);
    const sawB = r.text.includes(MARK.B);
    record(
      'conflicting identity claims resolve to one household only',
      r.status === 200 && sawB !== sawA,
      `HTTP ${r.status}; shows ${sawA ? 'Alex household' : sawB ? 'Other household' : 'no household'}`,
    );
  }

  for (const [who, tok, own] of [
    ['Alex (administrator)', alexTok, MARK.A],
    ['Sam (member of Alex & Sam)', samTok, MARK.A],
    ['Other household', otherTok, MARK.B],
  ] as const) {
    for (const page of pages) {
      const r = await call('GET', page, { token: tok });
      const others = allMarks.filter((m) => m !== own);
      const leaked = containsAny(r.text, others);
      record(
        `${who} sees own data on ${page}`,
        r.status === 200 && r.text.includes(own) && leaked.length === 0,
        leaked.length ? `saw other household: ${leaked.join(', ')}` : `HTTP ${r.status}`,
      );
    }
  }

  {
    const r = await call('GET', `/api/attachments/${ids.fileKey}`, { token: alexTok });
    record(
      'Alex can open own attachment and bytes match the record',
      r.status === 200 && sha256(r.bytes) === ids.sha256,
      `HTTP ${r.status}`,
    );
  }
  {
    const r = await call('GET', `/api/attachments/${ids.fileKey}`, { token: otherTok });
    record(
      'Other household cannot open Alex household attachment',
      r.status === 404 && sha256(r.bytes) !== ids.sha256,
      `HTTP ${r.status}`,
    );
  }
  {
    const r = await call('GET', `/api/attachments/${ids.fileKey}`, {
      token: await token(keys, { email: STRANGER }),
    });
    record('stranger cannot open any attachment', r.status !== 200, `HTTP ${r.status}`);
  }

  section('Concurrency');
  {
    const jobs: Promise<{ ok: boolean; who: string }>[] = [];
    for (let i = 0; i < 40; i += 1) {
      const isAlex = i % 2 === 0;
      const tok = isAlex ? alexTok : otherTok;
      const own = isAlex ? MARK.A : MARK.B;
      const other = isAlex ? MARK.B : MARK.A;
      jobs.push(
        call('GET', pages[i % pages.length], { token: tok }).then((r) => ({
          ok: r.status === 200 && r.text.includes(own) && !r.text.includes(other),
          who: isAlex ? 'Alex' : 'Other',
        })),
      );
    }
    const settled = await Promise.all(jobs);
    const bad = settled.filter((s) => !s.ok).length;
    record(
      '40 interleaved requests from two households, all isolated',
      bad === 0,
      `${settled.length - bad} of ${settled.length} correct`,
    );
  }

  section('Household backup and restore over HTTP');
  let archive: Buffer | null = null;
  {
    const r = await call('POST', '/api/backup', {
      token: alexTok,
      headers: { origin: BASE, 'content-type': 'application/json' },
      body: JSON.stringify({ password: PASSPHRASE }),
    });
    archive = r.status === 200 ? r.bytes : null;
    record(
      'Alex can back up own household',
      r.status === 200 && archive !== null,
      `HTTP ${r.status}, ${r.bytes.length} bytes`,
    );
  }
  {
    const r = await call('POST', '/api/backup', {
      token: alexTok,
      headers: { origin: 'https://evil.example.invalid', 'content-type': 'application/json' },
      body: JSON.stringify({ password: PASSPHRASE }),
    });
    record('cross-origin backup is refused', r.status === 403, `HTTP ${r.status}`);
  }
  {
    const r = await call('POST', '/api/backup', {
      token: await token(keys, { email: STRANGER }),
      headers: { origin: BASE, 'content-type': 'application/json' },
      body: JSON.stringify({ password: PASSPHRASE }),
    });
    record(
      'stranger cannot back up anything',
      r.status === 401 || r.status === 403 || r.status === 503,
      `HTTP ${r.status}`,
    );
  }
  if (archive !== null) {
    const form = new FormData();
    form.set('archive', new Blob([new Uint8Array(archive)]), 'alex.backup');
    form.set('password', PASSPHRASE);
    form.set('confirm', 'RESTORE');
    const r = await call('POST', '/api/restore', {
      token: otherTok,
      headers: { origin: BASE },
      body: form,
    });
    const otherStillOwn = await call('GET', '/pots', { token: otherTok });
    record(
      'Other household cannot restore Alex archive, and its data is unchanged',
      r.status === 400 &&
        otherStillOwn.text.includes(MARK.B) &&
        !otherStillOwn.text.includes(MARK.A),
      `HTTP ${r.status}: ${r.text.slice(0, 120)}`,
    );

    const form2 = new FormData();
    form2.set('archive', new Blob([new Uint8Array(archive)]), 'alex.backup');
    form2.set('password', PASSPHRASE);
    form2.set('confirm', 'RESTORE');
    const own = await call('POST', '/api/restore', {
      token: alexTok,
      headers: { origin: BASE },
      body: form2,
    });
    const alexAfter = await call('GET', '/pots', { token: alexTok });
    record(
      'Alex can restore own archive, and own data is still there',
      own.status === 200 && alexAfter.text.includes(MARK.A) && !alexAfter.text.includes(MARK.B),
      `HTTP ${own.status}`,
    );
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function writeReport(): void {
  const failed = results.filter((r) => !r.ok);
  const lines = [
    '# Acceptance run on fictional data (plan step 6)',
    '',
    `Run: ${new Date().toISOString()}. Production build, \`NODE_ENV=production\`, local JWKS stand-in for Cloudflare Access.`,
    '',
    `**${results.length - failed.length} of ${results.length} checks passed.**`,
    '',
    '| Area | Check | Result | Detail |',
    '| --- | --- | --- | --- |',
    ...results.map(
      (r) => `| ${r.area} | ${r.name} | ${r.ok ? 'pass' : '**FAIL**'} | ${r.detail} |`,
    ),
    '',
    'Not covered here (needs the owner or a live environment): real Cloudflare Access, the Docker image build, the Unraid template, container networking and the Cloudflare Tunnel route.',
    '',
  ];
  writeFileSync(REPORT, lines.join('\n'));
}

async function main(): Promise<void> {
  if (ROOT.startsWith('/mnt/')) throw new Error('refusing to run under /mnt/');
  console.log(`Acceptance — FICTIONAL DATA ONLY. Scratch: ${ROOT}`);
  rmSync(ROOT, { recursive: true, force: true });
  mkdirSync(DATA_DIR, { recursive: true });

  section('Setup');
  const keys = await makeKeys();
  const jwks = await startJwks(keys);
  record('stand-in Access key server started', true, CERTS_URL);
  const ids = await buildInstallation();
  record('fictional installation built (three households, one deactivated)', true, '');
  runStartupScript('registry-migrate.cjs');
  runStartupScript('migrate.cjs');
  record('production startup migrations run', true, '');

  const app = startApp();
  let appLog = '';
  app.stdout?.on('data', (chunk: Buffer) => (appLog += chunk.toString()));
  app.stderr?.on('data', (chunk: Buffer) => (appLog += chunk.toString()));
  try {
    await waitForApp(120_000);
    record('production app started', true, BASE);
    await runChecks(keys, ids);
  } catch (err) {
    record('acceptance run completed', false, err instanceof Error ? err.message : String(err));
  } finally {
    app.kill('SIGTERM');
    jwks.close();
    if (appLog.length > 0) writeFileSync(path.join(ROOT, 'app.log'), appLog);
    writeReport();
  }

  const failed = results.filter((r) => !r.ok);
  console.log(
    `\n${results.length - failed.length} of ${results.length} checks passed. ` +
      (failed.length === 0 ? 'Acceptance passed (fictional data).' : `${failed.length} failed.`),
  );
  console.log(`Report: ${REPORT}`);
  if (failed.length > 0) process.exitCode = 1;
}

void main();
