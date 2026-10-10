import { expect, test, type Locator, type Page } from '@playwright/test';

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
  test('shows the roster and refuses to overfill a household', async ({ page }) => {
    await page.goto('/admin');
    await expect(
      page.getByRole('heading', { name: 'Households & sign-in', level: 1 }),
    ).toBeVisible();

    // The seeded household is full: two identities, no assign form, and the
    // one-or-two person limit explained instead.
    const seeded = householdCard(page, 'Alex & Sam');
    await expect(seeded.getByText('alex@example.com', { exact: true })).toBeVisible();
    await expect(seeded.getByText('sam@example.com', { exact: true })).toBeVisible();
    await expect(seeded.getByText('2 of 2 sign-in identities assigned')).toBeVisible();
    await expect(seeded.getByText(/Two identities assigned/)).toBeVisible();
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
});
