import { expect, test, type Locator, type Page } from '@playwright/test';
import { formatPence } from '../src/lib/money';
import {
  addDaysIso,
  londonToday,
  pickEntryCategory,
  pickScheduleSupplier,
  waitForFilters,
  waitForTill,
} from './support';

function rolling12Start(today: string): string {
  const [year, month] = today.split('-').map(Number);
  return new Date(Date.UTC(year ?? 0, (month ?? 1) - 12, 1)).toISOString().slice(0, 10);
}

/** The schedule list scrolls inside the calendar-height panel (decision 164). */
async function scheduleRow(page: Page, name: string): Promise<Locator> {
  const row = page
    .locator('section[aria-labelledby="schedules-heading"] li', { hasText: name })
    .first();
  await row.scrollIntoViewIfNeeded();
  return row;
}

/**
 * Desktop review paths (blueprint §12): the dense overview, the purchases table
 * with its inline editor, the month calendar staying consistent with the
 * schedule list after a real due-day edit, suppliers and contracts.
 */

test.describe('desktop review', () => {
  for (const width of [393, 1400]) {
    test(`links stay blue and underlined before hover at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 950 });
      await page.mouse.move(0, 0);

      // Decision 203: the three places the household named must look clickable
      // without a pointer ever crossing them, including the larger arrow links.
      async function expectLinkStyle(control: Locator): Promise<void> {
        await control.scrollIntoViewIfNeeded();
        await expect(control).toBeVisible();
        await expect(control).toHaveCSS('text-decoration-line', 'underline');
        const linkBlue = await page.evaluate(() => {
          const probe = document.createElement('span');
          probe.style.color = 'var(--color-link)';
          document.body.append(probe);
          const colour = getComputedStyle(probe).color;
          probe.remove();
          return colour;
        });
        await expect(control).toHaveCSS('color', linkBlue);
      }

      await page.goto('/recurring');
      await expectLinkStyle(page.getByRole('link', { name: 'Supplier card', exact: true }).first());
      await page.goto('/overview');
      await expectLinkStyle(page.getByRole('link', { name: 'All purchases →', exact: true }));
      await page.goto(`/horizon?through=${addDaysIso(londonToday(), 35)}`);
      await expectLinkStyle(
        page.getByRole('button', { name: /^Projected shops and fills on / }).first(),
      );
    });
  }

  test('overview carries money, projection, due dates and key dates', async ({ page }) => {
    await page.goto('/overview');
    await expect(
      page.getByRole('heading', { name: 'Everything in one place', level: 1 }),
    ).toBeVisible();
    // Estimates and projections, never a bank balance.
    await expect(page.getByText(/never a bank balance/i).first()).toBeVisible();
    const projection = page.locator('section[aria-labelledby="projection-heading"]');
    await expect(projection.getByText('Projected day-to-day', { exact: false })).toBeVisible();
    await expect(projection.getByText('Upcoming commitments')).toBeVisible();
    await expect(projection.getByText('Expected receipts')).toBeVisible();
    await expect(projection.locator('details')).toHaveCount(0);
    await expect(projection.locator('table')).toHaveCount(0);
    await expect(projection.getByRole('link', { name: 'Horizon →' })).toHaveAttribute(
      'href',
      /^\/horizon\?through=\d{4}-\d{2}-\d{2}$/,
    );
    await expect(page.getByRole('heading', { name: /Due this week/i })).toBeVisible();
    await expect(page.getByRole('heading', { name: /Key dates/i })).toBeVisible();
    // The seeded renewal is inside its warning window (SPEC §22).
    await expect(page.getByText(/Vehicle A insurance renews in \d+ days/i)).toBeVisible();
    // ...and the seeded contract end is inside its own window.
    await expect(page.getByText(/time to shop around/i).first()).toBeVisible();
    // Purchase review, transfers, pots and checkpoints live on their own pages.
    await expect(page.getByRole('heading', { name: 'Recent entries' })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Transfers between pots' })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Add a pot' })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Balance checkpoint' })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Recent checkpoints' })).toHaveCount(0);

    // Overview's parent categories and vehicles are honest links to the money
    // behind their figures, with the same date windows as each panel.
    const today = londonToday();
    const monthFrom = `${today.slice(0, 7)}-01`;
    const groceries = page.getByRole('link', { name: 'Groceries', exact: true });
    await expect(groceries).toBeVisible();
    const groceriesUrl = new URL((await groceries.getAttribute('href')) ?? '', 'http://test');
    expect(groceriesUrl.pathname).toBe('/purchases');
    expect(groceriesUrl.searchParams.get('categoryId')).toMatch(/^\d+$/);
    expect(groceriesUrl.searchParams.get('from')).toBe(monthFrom);
    expect(groceriesUrl.searchParams.get('to')).toBe(today);

    for (const label of ['Vehicle A', 'Vehicle B']) {
      const vehicleLink = page.getByRole('link', { name: label, exact: true });
      await expect(vehicleLink).toBeVisible();
      const vehicleUrl = new URL((await vehicleLink.getAttribute('href')) ?? '', 'http://test');
      expect(vehicleUrl.pathname).toBe('/purchases');
      expect(vehicleUrl.searchParams.get('targetKind')).toBe('vehicle');
      expect(vehicleUrl.searchParams.get('targetId')).toMatch(/^\d+$/);
      expect(vehicleUrl.searchParams.get('from')).toBe(rolling12Start(today));
      expect(vehicleUrl.searchParams.get('to')).toBe(today);
    }

    await groceries.click();
    await expect(page.getByRole('heading', { name: 'Every recorded purchase' })).toBeVisible();
    // The Category drop-down is gone (the search replaces it, issue #98
    // follow-up), so the link's category is stated as a chip above the
    // results instead of appearing as a control the page no longer has.
    await expect(
      page.getByLabel('Remove the category filter: Groceries / all children'),
    ).toBeVisible();
    await expect(page.getByLabel('From date')).toHaveValue(monthFrom);
    await expect(page.getByLabel('To date')).toHaveValue(today);
  });

  test('the desktop bar still lists every page', async ({ page }) => {
    await page.goto('/overview');
    const nav = page.getByRole('navigation', { name: 'Desktop navigation' });
    for (const label of [
      'Overview',
      'Purchases',
      'All Transactions',
      'Recurring',
      'Horizon',
      'Long-term forecast',
      'Income',
      'Accounts, Pots & Checkpoints',
      'Insights',
      'Charts',
      'Settings',
      'Suppliers',
      'Contracts & Renewals',
      'Tasks',
      'Projects',
      'Getting started',
    ]) {
      await expect(nav.getByRole('link', { name: label, exact: true })).toBeVisible();
    }
  });

  test('purchases can be filtered and edited inline', async ({ page }) => {
    await page.goto('/purchases');
    await waitForFilters(page);
    await expect(
      page.getByRole('heading', { name: 'Every recorded purchase', level: 1 }),
    ).toBeVisible();

    const results = page.locator('section[aria-labelledby="results-heading"]');
    await expect(results.getByText('Corner Foods').first()).toBeVisible();

    // All four show toggles start on (decision 205), and the supplier name
    // links to that supplier's expanded card.
    for (const label of ['Purchases', 'From schedule', 'Refunds', 'Voided']) {
      await expect(page.getByLabel(label, { exact: true })).toBeChecked();
    }
    const supplierLink = results.getByRole('link', { name: 'Corner Foods' }).first();
    await expect(supplierLink).toHaveAttribute('href', /\/suppliers\?supplierId=\d+/);
    // Alternating rows: the second row carries the tinted background.
    const rowBackgrounds = await results
      .locator('tbody tr')
      .evaluateAll((rows) => rows.slice(0, 2).map((row) => getComputedStyle(row).backgroundColor));
    expect(rowBackgrounds[0]).not.toBe(rowBackgrounds[1]);

    // Desktop keeps the filter form open; the phone-only toggle stays hidden.
    await expect(page.getByRole('button', { name: 'Show filters' })).toBeHidden();
    // The Supplier and Category drop-downs are gone; one search box reads the
    // supplier column, every category and the notes (issue #98 follow-up).
    // Scoped to the filter form: each row's editor keeps its own Category
    // select, and that is not a filter.
    const filterForm = page.getByRole('form', { name: 'Purchase filters' });
    await expect(filterForm.getByLabel('Supplier', { exact: true })).toHaveCount(0);
    await expect(filterForm.getByLabel('Category', { exact: true })).toHaveCount(0);
    await expect(filterForm.getByLabel('Pot', { exact: true })).toHaveCount(0);
    await expect(filterForm.getByLabel('Paid by', { exact: true })).toHaveCount(0);
    await expect(filterForm.getByLabel('Search supplier, category or notes')).toBeVisible();

    // Search by supplier and confirm the table follows — as you type, with no
    // Apply press (a keystroke debounces into a soft navigation).
    await page.getByLabel('Search supplier, category or notes').fill('Corner Foods');
    await expect(page).toHaveURL(/[?&]q=Corner\+Foods/);
    await expect(results.getByRole('heading')).toContainText('matching “Corner Foods”');
    await expect(results.getByText('Corner Foods').first()).toBeVisible();
    await expect(results.getByText('The Corner Cafe')).toHaveCount(0);

    // Inline edit: open the row editor, change the note, save, see it.
    const row = results.locator('tbody tr', { hasText: 'Corner Foods' }).first();
    await row.locator('summary', { hasText: 'Edit' }).click();
    await row.getByRole('button', { name: 'Edit' }).click();
    await row.getByLabel('Note (blank keeps the current note)').fill('Edited in a browser test');
    await row.getByRole('button', { name: 'Save purchase' }).click();
    await expect(results.getByText('Edited in a browser test').first()).toBeVisible({
      timeout: 30_000,
    });
  });

  test('the Purchases result total follows the filtered, displayed rows (issue #38)', async ({
    page,
  }) => {
    await page.goto('/purchases');
    await waitForFilters(page);
    const results = page.locator('section[aria-labelledby="results-heading"]');

    const checkHeadingAgainstRows = async (matching = '') => {
      const rows = await results.locator('tbody tr').evaluateAll((elements) =>
        elements.map((row) => ({
          amount: row.querySelector('td:nth-child(6)')?.textContent?.trim() ?? '',
          status: row.querySelector('td:nth-child(7)')?.textContent?.trim() ?? '',
        })),
      );
      const netPence = rows.reduce((sum, row) => {
        if (row.status.startsWith('Voided')) return sum;
        const match = /^(-?)£([\d,]+)\.(\d{2})$/.exec(row.amount);
        if (match === null) throw new Error(`Unexpected purchase total: ${row.amount}`);
        return (
          sum +
          (Number(match[2]?.replaceAll(',', '')) * 100 + Number(match[3])) *
            (match[1] === '-' ? -1 : 1)
        );
      }, 0);
      const count = rows.length;
      await expect(results.getByRole('heading', { level: 2 })).toHaveText(
        `${count} ${count === 1 ? 'entry' : 'entries'}${matching}: Total ${formatPence(netPence)}`,
      );
    };

    await checkHeadingAgainstRows();
    // The search names itself in the heading, and the total follows the rows
    // it leaves (issue #98 follow-up to the same honest-total rule).
    await page.getByLabel('Search supplier, category or notes').fill('Corner Foods');
    await expect(page).toHaveURL(/[?&]q=Corner\+Foods/);
    await expect(results.getByText('Corner Foods').first()).toBeVisible();
    await checkHeadingAgainstRows(' matching “Corner Foods”');

    await page.goto('/purchases?from=1900-01-01&to=1900-01-02');
    await expect(results.getByRole('heading', { level: 2 })).toHaveText('0 entries: Total £0.00');
    await expect(results.locator('tbody tr')).toHaveCount(0);
  });

  test('a purchase can be voided, and the void control stays legible', async ({ page }) => {
    // Regression for two field reports on v0.1.1. The void form posts
    // `expectedVersion` while both void actions read `version`, so every void
    // failed with "Invalid input: expected number, received null"; and the
    // submit button layered a danger-coloured label over `submitClass`'s
    // till-ink one, which Tailwind resolves to ink-on-ink because
    // `.text-till-ink` is emitted later in the stylesheet than `.text-danger`
    // (the classes were palette names until the token pass, decision 159).
    // Nothing covered either path.
    //
    // Three sequential mutations against a dev server, so allow more than the
    // default budget. Its own purchase, so the seeded rows the other specs
    // assert on are untouched and a CI retry starts from a clean state.
    test.slow();
    await page.goto('/');
    await waitForTill(page);
    const entry = page.getByRole('region', { name: /Record it while it is fresh/i });
    await entry.locator('input[name="supplierName"]').fill('Playwright Duplicate');
    await entry.locator('input[name="amount"]').fill('4.50');
    await entry.getByLabel('Line 1 amount').fill('4.50');
    await pickEntryCategory(entry, 'Groceries / Weekly Shop');
    await entry.getByRole('button', { name: 'Save purchase' }).click();
    await expect(entry.getByRole('status')).toContainText(/saved/i, { timeout: 30_000 });

    await page.goto('/purchases');
    const results = page.locator('section[aria-labelledby="results-heading"]');
    const rows = results.locator('tbody tr', { hasText: 'Playwright Duplicate' });
    await expect(rows).toHaveCount(1);
    await rows.first().locator('summary', { hasText: 'Edit' }).click();
    await rows.first().getByRole('button', { name: 'Void', exact: true }).click();

    // Legibility, as the product owner specified it: a coloured label at rest,
    // and a white label only on a saturated (non-white) background when hovered.
    const submit = rows.first().getByRole('button', { name: 'Void purchase' });
    await expect(submit).not.toHaveCSS('color', 'rgb(255, 255, 255)');
    await submit.hover();
    await expect(submit).toHaveCSS('color', 'rgb(255, 255, 255)');
    await expect(submit).not.toHaveCSS('background-color', 'rgb(255, 255, 255)');

    await rows
      .first()
      .getByLabel(/Why are you voiding this/)
      .fill('Entered twice at the till');
    await submit.click();

    // The void lands and the table revalidates. All four show toggles are on
    // by default (decision 205), so the voided row stays in view with its
    // reason — and unchecking Voided is what takes it out of the list.
    const voidedRow = results.locator('tbody tr', { hasText: 'Playwright Duplicate' }).first();
    await expect(voidedRow).toContainText(/Voided .* Entered twice at the till/, {
      timeout: 30_000,
    });
    await expect(voidedRow).toContainText('history kept');

    // Voids never delete (decision 6): hiding Voided removes the row, and
    // showing it again brings the retained history back.
    await page.getByLabel('Voided', { exact: true }).uncheck();
    await page.getByRole('button', { name: 'Apply filters' }).click();
    await expect(rows).toHaveCount(0, { timeout: 30_000 });
    await page.getByLabel('Voided', { exact: true }).check();
    await page.getByRole('button', { name: 'Apply filters' }).click();
    await expect(voidedRow).toContainText('history kept', { timeout: 30_000 });
  });

  test('the month calendar follows a real due-day edit', async ({ page }) => {
    await page.goto('/recurring');
    await expect(
      page.getByRole('heading', { name: /Recurring payments & the month at a glance/i, level: 1 }),
    ).toBeVisible();

    // The read-only boundary is stated in plain language (SPEC §11.2).
    await expect(page.getByText(/bank instruction/i).first()).toBeVisible();

    // Open the "Phone plan" schedule editor and move it to the 21st.
    const schedules = page.locator('section[aria-labelledby="schedules-heading"]');
    const scheduleItem = schedules.locator('li', { hasText: 'Phone plan' }).first();
    const originalDueLine = scheduleItem.getByText(/Next due: \d{4}-\d{2}-\d{2}/);
    const originalDueText = await originalDueLine.innerText();
    await scheduleItem.getByText('Edit schedule').click();
    await scheduleItem.getByLabel('Day of month').fill('21');
    await scheduleItem.getByRole('button', { name: 'Save changes' }).click();

    // The edit itself sticks...
    await expect(scheduleItem.getByLabel('Day of month')).toHaveValue('21');

    // ...and the schedule reports a next-due date that the calendar agrees with.
    const dueLine = scheduleItem.getByText(/Next due: \d{4}-\d{2}-\d{2}/);
    await expect(dueLine).not.toHaveText(originalDueText, { timeout: 30_000 });
    const dueDate = /(\d{4}-\d{2}-\d{2})/.exec(await dueLine.innerText())?.[1] ?? '';

    // ...and the calendar agrees: the cell for that exact date has a compact
    // summary which expands to a full-width list with an edit link for this
    // schedule. The grid and the lists render from one instance list, so they
    // cannot drift; this observes it in a browser.
    await page.goto(`/recurring?month=${dueDate.slice(0, 7)}`);
    const calendar = page.locator('section[aria-labelledby="calendar-heading"]');
    const cell = calendar.locator(`[data-date="${dueDate}"]`);
    await expect(cell).toHaveCount(1);
    const daySummary = cell.getByRole('button');
    await expect(daySummary).toBeVisible();
    await daySummary.click();
    const dayDetails = calendar.getByRole('region', { name: /Scheduled items for/ });
    await expect(dayDetails.getByText('Phone plan')).toBeVisible();
    const scheduleEditLink = dayDetails.getByRole('link', { name: 'Edit schedule: Phone plan' });
    await expect(scheduleEditLink).toHaveAttribute('href', /scheduleId=\d+#schedule-edit-\d+$/);

    // Month navigation keeps working.
    const heading = await calendar.getByRole('heading', { level: 2 }).innerText();
    await page.getByRole('link', { name: /Next/ }).first().click();
    await expect(calendar.getByRole('heading', { level: 2 })).not.toHaveText(heading);
  });

  test('a backdated schedule start turns a missed direct debit into a DD record', async ({
    page,
  }) => {
    test.slow();
    // The case decision 162 was made for: a household starts recording a few
    // days late, and the direct debits inside that gap belong to no instance.
    // The fix is the schedule's own start date — move it earlier and the app
    // materialises the missed due date, which converts into a real DD record
    // instead of being typed in as a Purchase.
    const suffix = Date.now();
    const scheduleName = `Playwright backfilled DD ${suffix}`;
    const supplierName = `Playwright Backfill Co ${suffix}`;
    const today = londonToday();
    const missedDate = addDaysIso(today, -10); // already gone by, inside the default window
    const dueDayOfMonth = Number(missedDate.slice(8));

    await page.goto('/recurring');
    const schedules = page.locator('section[aria-labelledby="schedules-heading"]');
    await schedules.getByText('Add a schedule').click();
    const addForm = schedules
      .locator('form')
      .filter({ has: page.getByRole('button', { name: 'Add schedule' }) });
    await addForm.locator('input[name="name"]').fill(scheduleName);
    await addForm.locator('input[name="amount"]').fill('44.40');
    await addForm.locator('input[name="dueDayOfMonth"]').fill(String(dueDayOfMonth));
    // Named pot, not the select's default: the row is looked up on Main account.
    await addForm.locator('select[name="potId"]').selectOption({ label: 'Main account' });
    await addForm
      .locator('select[name="categoryId"]')
      .selectOption({ label: 'Utilities / Energy' });
    await pickScheduleSupplier(addForm, 'Add a new supplier…');
    await addForm.locator('input[name="supplierName"]').fill(supplierName);
    // 'Active from' is left at today — which is exactly the mistake this edit
    // exists to correct: the schedule starts after the money already left.
    await addForm.getByRole('button', { name: 'Add schedule' }).click();
    await expect(addForm.getByRole('status')).toContainText(/added/i, { timeout: 30_000 });

    const scheduleItem = await scheduleRow(page, scheduleName);
    await expect(scheduleItem).toContainText(supplierName, { timeout: 30_000 });
    // The card shows the start date it holds, and the next expectation is still
    // a month away: nothing in the app covers the date that has passed.
    await expect(scheduleItem).toContainText(`active from ${today}`);
    const nextDue = /Next due: (\d{4}-\d{2}-\d{2})/.exec(await scheduleItem.innerText())?.[1] ?? '';
    expect(nextDue).not.toBe('');
    expect(nextDue > today).toBe(true);

    // Edit it: the start date is now a field on the card, and moving it earlier
    // is a normal edit — not a support ticket or a re-created schedule.
    await scheduleItem.locator('summary', { hasText: 'Edit schedule' }).click();
    await expect(scheduleItem.getByLabel(/Active from/)).toHaveValue(today);
    await scheduleItem.getByLabel(/Active from/).fill(addDaysIso(today, -12));
    await scheduleItem.getByRole('button', { name: 'Save changes' }).click();
    await expect(scheduleItem.getByRole('status')).toContainText(
      /one payment the app had not been told about is now expected/,
      { timeout: 30_000 },
    );
    await expect(scheduleItem.getByLabel(/Active from/)).toHaveValue(addDaysIso(today, -12), {
      timeout: 30_000,
    });

    // The month that held the missed collection now carries the instance, and
    // the card's own line reflects the start it was given.
    await page.goto(`/recurring?month=${missedDate.slice(0, 7)}`);
    const calendar = page.locator('section[aria-labelledby="calendar-heading"]');
    const cell = calendar.locator(`[data-date="${missedDate}"]`);
    await expect(cell).toHaveCount(1);
    const daySummary = cell.getByRole('button');
    await expect(daySummary).toContainText('1 item');
    await expect(daySummary).toContainText('£44.40');
    await daySummary.click();
    const dayDetails = calendar.getByRole('region', { name: /Scheduled items for/ });
    await expect(dayDetails.getByText(scheduleName, { exact: true })).toBeVisible();
    await expect(dayDetails).toContainText('£44.40');
    await expect(
      dayDetails.getByRole('link', { name: `Edit schedule: ${scheduleName}`, exact: true }),
    ).toBeVisible();

    // The money pass runs on All Transactions (§11.2), and the row it makes is
    // a direct debit — code DD, linked back to its schedule — not a PUR.
    await page.goto(`/transactions?from=${addDaysIso(today, -12)}&to=${today}`);
    const table = page.locator('section[aria-labelledby="activity-heading"] table');
    const row = table.locator('tr', { hasText: '−£44.40' }).filter({ hasText: missedDate }).first();
    await expect(row.getByRole('cell', { name: /^DD/ })).toBeVisible({ timeout: 30_000 });
    await expect(row.getByRole('link', { name: 'Open the schedule' })).toHaveAttribute(
      'href',
      /^\/recurring#schedule-\d+$/,
    );

    // And the start date on the card stayed where the household put it.
    await page.goto('/recurring');
    await expect(await scheduleRow(page, scheduleName)).toContainText(
      `active from ${addDaysIso(today, -12)}`,
      { timeout: 30_000 },
    );
  });

  test('suppliers carry contact cards, references and the interaction log', async ({ page }) => {
    await page.goto('/suppliers');
    await expect(page.getByRole('heading', { name: 'Suppliers', level: 1 })).toBeVisible();

    const card = page
      .locator('article', { has: page.getByRole('heading', { name: 'Corner Foods', exact: true }) })
      .first();
    await card.getByRole('button', { name: /Corner Foods/i }).click();
    await expect(card.getByRole('link', { name: '01632 960111' })).toBeVisible();

    // "Recent purchases" says who each payment was for, not just date · amount
    // (decision 161). One supplier can hold a contract per person, so a row
    // that reads only an amount is the one place the household could not tell
    // three contracts apart. The seeded shop is split across two targets, so
    // it names the first line and counts the rest, exactly as All
    // Transactions does.
    const shop = card.locator('li', { hasText: '£63.47' }).first();
    await expect(shop).toContainText('Weekly Shop (household)');
    await expect(shop).toContainText('+1 more');

    // Same category, different target: the target is what tells them apart,
    // and it is words — never colour alone (SPEC §16.7).
    const cafe = page
      .locator('article', {
        has: page.getByRole('heading', { name: 'The Corner Cafe', exact: true }),
      })
      .first();
    await cafe.getByRole('button', { name: /The Corner Cafe/i }).click();
    const cafeRow = cafe.locator('li', { hasText: '£3.49' }).first();
    await expect(cafeRow).toContainText('Weekly Shop (Sam)');
    await expect(cafeRow).not.toContainText('more');

    // Add a reference pair and see it listed on the same card.
    await card.getByPlaceholder('Label (e.g. Policy number)').fill('Account number');
    await card.getByPlaceholder('Value').fill('ACCT-42');
    await card.getByRole('button', { name: 'Add reference' }).click();
    await expect(card.getByText('ACCT-42').first()).toBeVisible({ timeout: 30_000 });

    // Log an interaction and see it in the same card's log.
    await card.getByPlaceholder('What happened?').fill('Rang about the renewal');
    await card.getByPlaceholder('Outcome (optional)').fill('Quote to follow');
    await card.getByRole('button', { name: 'Log interaction' }).click();
    await expect(card.getByText('Quote to follow').first()).toBeVisible({ timeout: 30_000 });
  });

  test('contracts group insurance and service dates and stay editable', async ({ page }) => {
    await page.goto('/contracts');
    await expect(
      page.getByRole('heading', { name: 'Contracts & Renewals', level: 1 }),
    ).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Insurance policies' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Service contracts' })).toBeVisible();
    await expect(page.getByRole('heading', { name: /Follow-ups you promised/i })).toBeVisible();
    await expect(page.getByRole('heading', { name: /Credit-card payment reviews/i })).toBeVisible();

    // Both policies share the same explicit insurance group even though one
    // auto-renews and the other requires the household to arrange cover.
    const insurance = page.locator('section[aria-label="Insurance policies"]');
    const autoRenewing = insurance.locator('article').filter({ hasText: 'Vehicle A insurance' });
    const notAutoRenewing = insurance.locator('article').filter({ hasText: 'Vehicle B insurance' });
    await expect(autoRenewing).toContainText('Auto-renews: yes');
    await expect(notAutoRenewing).toContainText('Auto-renews: no');
    await expect(autoRenewing).toContainText('Renewal / cover-end date');
    await expect(autoRenewing).toContainText('Can switch without an exit fee from');

    // The provider's service agreement shows its fee-free switch date and its
    // separately linked recurring payment.
    const services = page.locator('section[aria-label="Service contracts"]');
    const broadband = services.locator('article').filter({ hasText: 'BroadbandCo fibre' });
    await expect(broadband).toContainText(
      /switch date in \d+ days|Switch today|Fee-free switch available now/,
    );
    await expect(broadband.getByRole('link', { name: 'Edit payment schedule' })).toHaveAttribute(
      'href',
      /\/recurring#schedule-edit-\d+/,
    );

    // Supplier detail still opens the known supplier's expanded card.
    await broadband.getByRole('link', { name: 'Supplier details' }).click();
    await expect(page).toHaveURL(/\/suppliers\?supplierId=\d+/);
    await expect(page.getByLabel('Filter suppliers')).toHaveValue('BroadbandCo');
    await expect(
      page
        .locator('article', {
          has: page.getByRole('heading', { name: 'BroadbandCo', exact: true }),
        })
        .getByRole('button', { name: 'BroadbandCo' }),
    ).toHaveAttribute('aria-expanded', 'true');
    await page.goBack();

    // The policy's distinct provider status and annual app reminder setting
    // remain editable in place.
    const policy = page
      .locator('section[aria-label="Insurance policies"] article')
      .filter({ hasText: 'Vehicle A insurance' });
    await policy.getByText('Edit contract or policy details').click();
    await expect(policy.getByLabel('Does the provider auto-renew this policy?')).toHaveValue('yes');
    await expect(policy.getByLabel('The policy date repeats annually')).toBeChecked();
    await expect(policy.getByText('Remind me before the renewal date')).toBeVisible();
  });

  test('insights show the four panels with honest labels', async ({ page }) => {
    await page.goto('/insights');
    await expect(
      page.getByRole('heading', { name: 'Where the money actually went', level: 1 }),
    ).toBeVisible();
    // The current calendar month is flagged as in progress, never quoted as a
    // finished figure.
    await expect(page.getByText(/in progress/i).first()).toBeVisible();
    // The honesty loop compares configured figures with recent complete periods.
    await expect(page.getByRole('heading', { name: /configured figures honest/i })).toBeVisible();
    await expect(page.getByRole('heading', { name: /Vehicle running costs/i })).toBeVisible();
  });

  test('a recurring payment links to a service agreement and shares its supplier', async ({
    page,
  }) => {
    // Configuration + identity only: no receipts, purchases or real financial
    // data. Fictional supplier name throughout.
    test.slow();
    const supplierName = 'Willow Energy Co';
    const scheduleName = 'Electricity bill';
    const agreementName = 'Electricity contract';

    await page.goto('/recurring');
    const schedules = page.locator('section[aria-labelledby="schedules-heading"]');
    await schedules.getByText('Add a schedule').click();
    // Scope to the add form only — edit forms also label a "Schedule name" field.
    const form = schedules
      .locator('form')
      .filter({ has: page.getByRole('button', { name: 'Add schedule' }) });
    await form.locator('input[name="name"]').fill(scheduleName);
    await form.locator('input[name="amount"]').fill('55.00');
    await form.locator('select[name="kind"]').selectOption('dd');
    await form.locator('select[name="categoryId"]').selectOption({ label: 'Utilities / Energy' });
    await pickScheduleSupplier(form, 'Add a new supplier…');
    await form.locator('input[name="supplierName"]').fill(supplierName);
    await form.getByRole('button', { name: 'Add schedule' }).click();
    await expect(form.getByRole('status')).toContainText(/added/i, { timeout: 30_000 });

    // The new schedule lists the canonical supplier name in its summary line
    // (the edit-form <option> list also contains it, so avoid getByText alone).
    const scheduleItem = await scheduleRow(page, scheduleName);
    await expect(scheduleItem).toContainText(supplierName, { timeout: 30_000 });
    const supplierLink = scheduleItem.locator('a', { hasText: 'Supplier card' });
    await expect(supplierLink).toBeVisible();

    // The link lands on that supplier — filtered to it, card already open, in
    // view — instead of the collapsed full list (decision 149).
    await supplierLink.click();
    await expect(page).toHaveURL(/\/suppliers\?supplierId=\d+/);
    await expect(page.getByLabel('Filter suppliers')).toHaveValue(supplierName);
    await expect(page.locator('article')).toHaveCount(1);
    const card = page
      .locator('article', { has: page.getByRole('heading', { name: supplierName, exact: true }) })
      .first();
    await expect(card).toBeVisible({ timeout: 30_000 });
    await expect(card.getByRole('button', { name: supplierName })).toHaveAttribute(
      'aria-expanded',
      'true',
    );

    // Contact details can be edited straight away.
    await card.getByText('Edit contact card').click();
    await card.getByLabel('Phone').fill('01632 960333');
    await card.getByRole('button', { name: 'Save contact card' }).click();
    await expect(card.getByRole('link', { name: '01632 960333' })).toBeVisible({
      timeout: 30_000,
    });

    // Create a service agreement on Contracts & Renewals and link the payment
    // schedule. Provider terms stay here; the payment amount stays on Recurring.
    await page.goto('/contracts');
    const register = page.locator('section[aria-labelledby="agreement-register-heading"]');
    await register.getByText('Add a contract or policy').click();
    const agreementForm = register
      .locator('form')
      .filter({ has: page.getByRole('button', { name: 'Add to the register' }) });
    await agreementForm.locator('input[name="name"]').fill(agreementName);
    await agreementForm.locator('select[name="type"]').selectOption('service');
    await agreementForm.locator('select[name="supplierId"]').selectOption({ label: supplierName });
    await agreementForm.locator('select[name="scheduleId"]').selectOption({
      label: `${scheduleName} · monthly · ${supplierName}`,
    });
    const nextDate = addDaysIso(londonToday(), 40);
    await agreementForm.locator('input[name="renewalDate"]').fill(nextDate);
    await agreementForm.locator('input[name="renewalReminderEnabled"]').check();
    await agreementForm.getByRole('button', { name: 'Add to the register' }).click();
    await expect(agreementForm.getByRole('status')).toContainText(/added/i, { timeout: 30_000 });

    const service = page.locator('section[aria-label="Service contracts"]');
    const agreement = service.locator('article').filter({ hasText: agreementName });
    await expect(agreement).toContainText(supplierName);
    await expect(agreement).toContainText(scheduleName);
    await expect(agreement.getByText(nextDate)).toBeVisible();

    await page.goto('/recurring');
    const linkedSchedule = await scheduleRow(page, scheduleName);
    await expect(
      linkedSchedule.getByRole('link', { name: `Agreement: ${agreementName}` }),
    ).toHaveAttribute('href', /\/contracts#agreement-\d+/);
  });

  test('a vehicle added in Settings reaches every vehicle picker', async ({ page }) => {
    // This changes only household configuration. It deliberately does not add
    // a receipt or any financial data.
    test.slow();
    // Unique per retry: the database survives a retry, so a hard-coded name
    // turns every retry into "There is already a vehicle called …".
    const newVehicle =
      test.info().retry === 0 ? 'Vehicle C' : `Vehicle C (retry ${test.info().retry})`;
    await page.goto('/settings');
    const addVehicle = page.getByRole('form', { name: 'Add vehicle' });
    await addVehicle.getByLabel('Name').fill(newVehicle);
    await addVehicle.getByLabel('Owner (optional)').selectOption({ label: 'Sam' });
    await addVehicle.getByRole('button', { name: 'Add vehicle' }).click();
    await expect(addVehicle.getByRole('status')).toContainText(/vehicle added/i, {
      timeout: 30_000,
    });

    await page.goto('/');
    await waitForTill(page);
    const quickEntry = page.getByRole('region', { name: /Record it while it is fresh/i });
    await quickEntry.getByRole('tab', { name: 'Fuel' }).click();
    // The vehicle is a row of chips now (decision 146), one per vehicle.
    await expect(
      quickEntry.getByRole('radiogroup', { name: 'Vehicle' }).getByRole('radio', {
        name: newVehicle,
      }),
    ).toHaveCount(1);

    await page.goto('/purchases');
    await waitForFilters(page);
    await page.getByLabel('Target type', { exact: true }).selectOption('vehicle');
    await expect(
      page.getByLabel('Target', { exact: true }).locator('option', { hasText: newVehicle }),
    ).toHaveCount(1);

    await page.goto('/recurring');
    // Recurring now has one vehicle target picker: the renewal picker moved to
    // Contracts & Renewals with the agreement register.
    await expect(page.locator('select[name="target"] option', { hasText: newVehicle })).toHaveCount(
      1,
    );

    await page.goto('/contracts');
    const register = page.locator('section[aria-labelledby="agreement-register-heading"]');
    await register.getByText('Add a contract or policy').click();
    const agreementForm = register
      .locator('form')
      .filter({ has: page.getByRole('button', { name: 'Add to the register' }) });
    // The "For" picker is a `<select>` inside its own `<label>`, and Playwright
    // reads a wrapping label's whole text — options included — so
    // `getByLabel('For', { exact: true })` can never match (the accessible name
    // Chromium computes is still "For"). Address the control by role and name.
    await expect(
      agreementForm
        .getByRole('combobox', { name: 'For', exact: true })
        .locator('option', { hasText: newVehicle }),
    ).toHaveCount(1);

    await page.goto('/insights');
    await expect(page.getByText(newVehicle, { exact: true }).first()).toBeVisible();
  });
});

test('monthly no-payment months use a compact native disclosure and survive save/reload', async ({
  page,
}) => {
  test.slow();
  await page.goto('/recurring');
  const schedules = page.locator('section[aria-labelledby="schedules-heading"]');
  await schedules.getByText('Add a schedule').click();
  const form = schedules
    .locator('form')
    .filter({ has: page.getByRole('button', { name: 'Add schedule' }) });
  const summary = form.locator('summary', { hasText: 'Select any months with no payment:' });
  await expect(summary).toHaveText('Select any months with no payment: none');
  await expect(summary).toHaveCSS('display', 'list-item');
  await expect(summary.locator('..')).not.toHaveAttribute('open');
  await expect(form.getByLabel('February', { exact: true })).toBeHidden();
  await summary.focus();
  await page.keyboard.press('Enter');
  await expect(form.getByRole('checkbox')).toHaveCount(12);
  await form.getByLabel('February', { exact: true }).check();
  await form.getByLabel('March', { exact: true }).focus();
  await page.keyboard.press('Space');
  await summary.click();
  await expect(summary).toHaveText('Select any months with no payment: February, March');
  await expect(form.getByLabel('March', { exact: true })).toBeHidden();
  await form.locator('select[name="frequency"]').selectOption('annual');
  await expect(summary).toHaveCount(0);
  await form.locator('select[name="frequency"]').selectOption('monthly');
  await summary.click();
  await form.getByLabel('February', { exact: true }).check();
  await form.getByLabel('March', { exact: true }).check();
  await form.locator('input[name="name"]').fill('Playwright ten-month payment');
  await form.locator('input[name="amount"]').fill('150.00');
  await form.locator('select[name="kind"]').selectOption('so');
  await form.locator('select[name="categoryId"]').selectOption({ label: 'Utilities / Energy' });
  await form.getByRole('button', { name: 'Add schedule' }).click();
  await expect(form.getByRole('status')).toContainText(/added/i);
  await page.reload();
  const card = await scheduleRow(page, 'Playwright ten-month payment');
  await card.locator('summary', { hasText: 'Edit schedule' }).click();
  const editSummary = card.locator('summary', { hasText: 'Select any months with no payment:' });
  await expect(editSummary).toHaveText('Select any months with no payment: February, March');
  await expect(editSummary.locator('..')).not.toHaveAttribute('open');
  await expect(card.getByLabel('February', { exact: true })).toBeHidden();
  await page.setViewportSize({ width: 390, height: 844 });
  await editSummary.click();
  await expect(card.getByRole('checkbox')).toHaveCount(12);
  await expect(card.getByLabel('February', { exact: true })).toBeChecked();
  await expect(card.getByLabel('December', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await card.getByLabel('February', { exact: true }).uncheck();
  await card.getByLabel('March', { exact: true }).uncheck();
  await card.getByRole('button', { name: 'Save changes' }).click();
  await expect(card.getByRole('status')).toContainText(/saved|updated/i);
  await page.reload();
  await card.locator('summary', { hasText: 'Edit schedule' }).click();
  await expect(editSummary).toHaveText('Select any months with no payment: none');
  await expect(editSummary.locator('..')).not.toHaveAttribute('open');
});

/**
 * Supplier selection when a new schedule is created (GitHub issue #78). The
 * household's supplier list outgrew a native `<select>`: the picker is A–Z
 * over every supplier in the directory (not just the most recently used 40),
 * and typing filters any part of a name. `Add a new supplier…` is a pinned
 * row, so it is still reachable after a search that matches nothing.
 */
test.describe('new schedule supplier picker', () => {
  test('lists suppliers A–Z and searches as you type', async ({ page }) => {
    await page.goto('/recurring');
    const schedules = page.locator('section[aria-labelledby="schedules-heading"]');
    await schedules.getByText('Add a schedule').click();
    const form = schedules
      .locator('form')
      .filter({ has: page.getByRole('button', { name: 'Add schedule' }) });
    const field = form.getByLabel('Supplier', { exact: true });
    const list = form.getByRole('listbox', { name: 'Matching suppliers' });

    // Nothing typed: every supplier, in A–Z order.
    await field.click();
    const names = (await list.getByRole('option').allInnerTexts())
      .map((text) => text.trim())
      .filter((text) => !text.includes('Add a new supplier'));
    expect(names.length).toBeGreaterThan(1);
    expect(names).toEqual([...names].sort((left, right) => left.localeCompare(right)));

    // A typed fragment matches anywhere in the name, case-insensitively, and
    // the pinned "Add a new supplier…" row survives the filter.
    await field.fill('BROAD');
    await expect(list.getByRole('option', { name: 'BroadbandCo', exact: true })).toBeVisible();
    await expect(list.getByRole('option', { name: 'Corner Foods', exact: true })).toHaveCount(0);
    await expect(
      list.getByRole('option', { name: 'Add a new supplier…', exact: true }),
    ).toBeVisible();

    // Choosing a row leaves the picker closed on that supplier.
    await list.getByRole('option', { name: 'BroadbandCo', exact: true }).click();
    await expect(field).toHaveValue('BroadbandCo');
    await expect(list).toHaveCount(0);

    // A search with no matches says so instead of going blank, and Enter in
    // the search never submits the whole schedule form.
    await field.click();
    await field.fill('zzz no such supplier');
    await expect(
      list.getByRole('option', { name: 'No suppliers match that search.' }),
    ).toBeVisible();
    await field.press('Enter');
    await expect(form.getByRole('status')).toHaveCount(0);
    await expect(field).toHaveValue('zzz no such supplier');
    // Escape closes the search and leaves the chosen supplier in place.
    await field.press('Escape');
    await expect(list).toHaveCount(0);
    await expect(field).toHaveValue('BroadbandCo');
  });
});
