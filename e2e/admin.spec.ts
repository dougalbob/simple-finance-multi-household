import { expect, test, type Locator, type Page } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/**
 * Platform administration (MULTI_HOUSEHOLD_PLAN §2, §4): the roster of
 * households and pre-assignment of sign-in identities. The e2e seed assigns
 * the fictional Alex and Sam exactly as an administrator would (the app
 * denies any unassigned identity — there is no self sign-up), and Alex carries
 * the platform-administrator role, so this spec runs as Alex.
 *
 * Everything here is fictional and operational: household names and sign-in
 * emails only. The spec never touches a household's financial pages, and it
 * operates only on households it creates itself (unique per run), so the
 * seeded "Alex & Sam" roster entry stays full for the other projects.
 *
 * Locator note: the identity email also appears in its Unassign button label
 * and in the action message, and "Deactivated" also appears inside the
 * confirmation sentence — the roster assertions therefore match the exact
 * cell text (`{ exact: true }`), never a bare substring.
 */
const HOUSEHOLD = `Admin e2e ${Date.now()}`;
const ASSIGNEE = `admin-e2e-${Date.now()}@example.com`;

const householdCard = (page: Page, name: string): Locator =>
  page.getByRole('article').filter({
    has: page.getByRole('heading', { name, level: 3 }),
  });

/** The rename/status disclosure — open before touching anything inside it. */
async function openStatusDisclosure(card: Locator): Promise<void> {
  const details = card.locator('details');
  const isOpen = await details.evaluate((node) => (node as HTMLDetailsElement).open);
  if (!isOpen) await details.locator('summary').click();
}

test.describe('platform administration', () => {
  test('registry backup, then a roster change, then restore puts the roster back', async ({
    page,
  }) => {
    await page.goto('/admin');
    const section = page.locator('section[aria-labelledby="admin-backup-heading"]');
    await expect(section.getByRole('heading', { name: 'Registry Database Backup' })).toBeVisible();

    // 1. Download the registry backup.
    const downloadPromise = page.waitForEvent('download');
    await section.getByRole('link', { name: 'Download Backup' }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/^simple-finance-registry-v.+\.sqlite$/);
    const backupPath = path.join(
      os.tmpdir(),
      `registry-backup-${Date.now()}-${Math.random().toString(36).slice(2)}.sqlite`,
    );
    await download.saveAs(backupPath);
    expect(fs.statSync(backupPath).size).toBeGreaterThan(0);

    // 2. Mutate the roster: a household the backup does not know about.
    const restoreProbe = `Restore probe ${Date.now()}`;
    const create = page.getByRole('region', { name: 'Create a household' });
    await create.getByLabel('Household name').fill(restoreProbe);
    await create.getByRole('button', { name: 'Create household' }).click();
    await expect(householdCard(page, restoreProbe)).toBeVisible();

    // 3. Restore the downloaded backup. The form confirms before submitting,
    // then POSTs the file; the response must send the browser back to /admin
    // over the SAME origin it is already on (the v1.0.1 bug redirected to
    // https://0.0.0.0:3000/admin and re-POSTed the upload with a 307).
    page.once('dialog', (dialog) => dialog.accept());
    await section.locator('input[type="file"]').setInputFiles(backupPath);
    await Promise.all([
      page.waitForResponse((response) => response.url().includes('/admin/restore')),
      section.getByRole('button', { name: 'Restore' }).click(),
    ]);

    // 4. We are back on the admin page itself — reloaded, not re-POSTed —
    // and the roster is exactly what the backup held: the probe household is
    // gone, the seeded household remains.
    await page.waitForURL(/\/admin$/);
    await expect(
      page.getByRole('heading', { name: 'Households & sign-in', level: 1 }),
    ).toBeVisible();
    await expect(householdCard(page, restoreProbe)).toHaveCount(0);
    await expect(householdCard(page, 'Alex & Sam')).toBeVisible();
    fs.rmSync(backupPath, { force: true });
  });

  test('shows the roster and refuses to overfill a household', async ({ page }) => {
    await page.goto('/admin');
    await expect(
      page.getByRole('heading', { name: 'Households & sign-in', level: 1 }),
    ).toBeVisible();

    // The seeded household is full: two sign-in identities, no assign form, and
    // the identity limit explained instead.
    const seeded = householdCard(page, 'Alex & Sam');
    await expect(seeded.getByText('alex@example.com', { exact: true })).toBeVisible();
    await expect(seeded.getByText('sam@example.com', { exact: true })).toBeVisible();
    await expect(seeded.getByText('2 of 2 sign-in identities assigned')).toBeVisible();
    await expect(seeded.getByText(/Two sign-in identities assigned/)).toBeVisible();
    await expect(seeded.getByLabel(/Sign-in email to assign/)).toHaveCount(0);

    // Administration is metadata only — the page says so where the household
    // looks at it.
    await expect(
      page.getByText('This page shows operational metadata only', { exact: false }),
    ).toBeVisible();
  });

  test('creates a household, then assigns and unassigns a sign-in email', async ({ page }) => {
    await page.goto('/admin');

    const create = page.getByRole('region', { name: 'Create a household' });
    await create.getByLabel('Household name').fill(HOUSEHOLD);
    await create.getByRole('button', { name: 'Create household' }).click();
    // The roster re-renders from the server action's revalidation — assert
    // without a reload (the settings.spec.ts stale-tree lesson).
    await expect(householdCard(page, HOUSEHOLD)).toBeVisible();

    const card = householdCard(page, HOUSEHOLD);
    await expect(card.getByText('0 of 2 sign-in identities assigned')).toBeVisible();
    await card.getByLabel(/Sign-in email to assign/).fill(ASSIGNEE);
    await card.getByRole('button', { name: 'Assign to this household' }).click();

    await expect(card.getByText(ASSIGNEE, { exact: true })).toBeVisible();
    await expect(card.getByText('1 of 2 sign-in identities assigned')).toBeVisible();

    // The registry audit tail records who did it.
    const audit = page.getByRole('region', { name: 'Recent registry activity' });
    await expect(audit.getByText('Identity assigned').first()).toBeVisible();
    await expect(audit.getByText('alex@example.com').first()).toBeVisible();

    await card.getByRole('button', { name: `Unassign ${ASSIGNEE}` }).click();
    await expect(card.getByText(ASSIGNEE, { exact: true })).toHaveCount(0);
    await expect(card.getByText('0 of 2 sign-in identities assigned')).toBeVisible();
  });

  test('deactivates and reactivates a household it created', async ({ page }) => {
    await page.goto('/admin');

    const create = page.getByRole('region', { name: 'Create a household' });
    const name = `${HOUSEHOLD} paused`;
    await create.getByLabel('Household name').fill(name);
    await create.getByRole('button', { name: 'Create household' }).click();
    const card = householdCard(page, name);
    await expect(card.getByText('Active', { exact: true })).toBeVisible();

    await openStatusDisclosure(card);
    await card.getByRole('button', { name: /Deactivate/ }).click();
    await expect(card.getByText('Deactivated', { exact: true })).toBeVisible();

    await openStatusDisclosure(card);
    await card.getByRole('button', { name: /Reactivate/ }).click();
    await expect(card.getByText('Active', { exact: true })).toBeVisible();
  });

  test('shows who is connected and keeps a connection log', async ({ page }) => {
    await page.goto('/admin');

    const presence = page.getByRole('region', { name: 'Who is connected' });
    await expect(presence).toBeVisible();

    // Rendering this very page is activity, so the signed-in administrator is
    // present the moment the card is drawn — no waiting for a heartbeat.
    await expect(presence.getByText('alex@example.com', { exact: true })).toBeVisible();
    await expect(presence.getByText('(you)')).toBeVisible();
    await expect(presence.getByTestId('presence-summary')).toContainText('active now');

    // The previous page view was filed under the identity's own household, and
    // the card never claims to know what anyone was doing.
    await expect(page.getByRole('region', { name: 'Connection history' })).toBeVisible();
  });
});
