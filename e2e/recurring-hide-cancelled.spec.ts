import { expect, test, type Locator, type Page } from '@playwright/test';
import { waitForScheduleFilter } from './support';

/**
 * Issues #28, #34, #35:
 * - Recurring schedules list can hide cancelled schedules, with a badge counting hidden.
 * - Persistent hidden preference across full-page navigation via cookie (issue #35).
 * - In-place filter search box with clear button (issue #34).
 * - Matching cancelled schedules show when filtered even if hidden (issue #34).
 * - Supplier card displays "Linked to schedule" link to recurring schedule, or
 *   "No scheduled payments relate to this supplier currently" (issue #34).
 * - A linked schedule lands *below* the sticky site header (re-opened issue #34).
 */

/**
 * The row a deep link names must land below the sticky site header, not
 * underneath it. The header's height is not a constant — the desktop nav wraps
 * onto a second row between 1024px and 1199px, measuring 85px at 1400×950 and
 * 121px at 1100×950 — so the landing offset has to be measured rather than
 * baked into a `scroll-mt-*` class: the old 24px margin put the row's top at
 * 24px, and even the app's usual 96px would not clear a 121px bar.
 */
async function expectRowClearsStickyHeader(page: Page, row: Locator): Promise<void> {
  const header = page.locator('header.sticky').first();
  await expect
    .poll(async () => {
      const rowBox = await row.boundingBox();
      const headerBox = await header.boundingBox();
      if (rowBox === null || headerBox === null) return false;
      return rowBox.y >= headerBox.y + headerBox.height;
    })
    .toBe(true);
}

const scheduleName = `Hide-cancel probe ${Date.now()}`;
const supplierScheduleName = `Supplier linked probe ${Date.now()}`;

async function cancelSchedule(page: Page, name: string): Promise<void> {
  const row = page
    .locator('section[aria-labelledby="schedules-heading"] li', { hasText: name })
    .first();
  await row.scrollIntoViewIfNeeded();
  await row.locator('summary', { hasText: 'Edit schedule' }).click();
  // First click reveals the confirmation step; the form then asks twice more.
  await row.getByRole('button', { name: 'Cancel schedule', exact: true }).click();
  await row.getByRole('button', { name: 'Cancel schedule', exact: true }).click();
  await row.getByRole('button', { name: 'Yes, cancel it' }).click();
  await expect(row).toContainText('Cancelled', { timeout: 30_000 });
}

test.describe('recurring schedules: hide cancelled & navigation persistence', () => {
  test('hiding cancelled schedules keeps month, persists across navigation, and can be undone', async ({
    page,
  }) => {
    test.slow();
    await page.goto('/recurring');
    const schedules = page.locator('section[aria-labelledby="schedules-heading"]');
    await schedules.getByText('Add a schedule').click();
    const addForm = schedules
      .locator('form')
      .filter({ has: page.getByRole('button', { name: 'Add schedule' }) });
    await addForm.locator('input[name="name"]').fill(scheduleName);
    await addForm.locator('input[name="amount"]').fill('3.33');
    await addForm.locator('select[name="kind"]').selectOption('so');
    await addForm.locator('select[name="potId"]').selectOption({ label: 'Main account' });
    await addForm
      .locator('select[name="categoryId"]')
      .selectOption({ label: 'Utilities / Energy' });
    await addForm.getByRole('button', { name: 'Add schedule' }).click();
    await expect(addForm.getByRole('status')).toContainText(/added/i, { timeout: 30_000 });

    await cancelSchedule(page, scheduleName);

    // Shown by default: deep links to a cancelled schedule still land.
    await page.goto('/recurring');
    const list = page.locator('section[aria-labelledby="schedules-heading"] ul');
    await expect(list.locator('li', { hasText: scheduleName })).toHaveCount(1);
    await expect(page.getByTestId('hidden-cancelled-count')).toHaveCount(0);

    // Hide: the row goes, the badge counts it, and the calendar month is kept.
    await page.getByRole('link', { name: 'Hide cancelled' }).click();
    await expect(page).toHaveURL(/hideCancelled=1/);
    await expect(list.locator('li', { hasText: scheduleName })).toHaveCount(0);
    await expect(page.getByTestId('hidden-cancelled-count')).toContainText(/\d+ hidden/);

    // Paging the calendar keeps the choice.
    await page.getByRole('link', { name: 'Next →' }).click();
    await expect(page).toHaveURL(/hideCancelled=1/);
    await expect(page).toHaveURL(/month=\d{4}-\d{2}/);

    // Issue #35: Navigating away and back to /recurring (without query param) remembers the hidden choice.
    await page.goto('/purchases');
    await expect(page.getByRole('heading', { level: 1 })).toContainText(/purchase/i);
    await page.goto('/recurring');
    await expect(list.locator('li', { hasText: scheduleName })).toHaveCount(0);
    await expect(page.getByTestId('hidden-cancelled-count')).toContainText(/\d+ hidden/);

    // Issue #34: In-place filter search box shows matching cancelled schedules even when hidden.
    const filterInput = page.getByPlaceholder('Filter schedules…');
    await waitForScheduleFilter(page);
    await filterInput.fill(scheduleName);
    await expect(list.locator('li', { hasText: scheduleName })).toHaveCount(1);
    await expect(list.locator('li', { hasText: scheduleName })).toContainText('Cancelled');

    // Clearing the filter restores the hidden state.
    await page.getByRole('button', { name: 'Clear filter' }).click();
    await expect(filterInput).toHaveValue('');
    await expect(list.locator('li', { hasText: scheduleName })).toHaveCount(0);

    // Show again: the row returns and the badge goes.
    await page.getByRole('link', { name: 'Show cancelled' }).click();
    await expect(page).not.toHaveURL(/hideCancelled/);
    await expect(list.locator('li', { hasText: scheduleName })).toHaveCount(1);
    await expect(page.getByTestId('hidden-cancelled-count')).toHaveCount(0);

    // Navigating away and back maintains the shown choice.
    await page.goto('/purchases');
    await page.goto('/recurring');
    await expect(list.locator('li', { hasText: scheduleName })).toHaveCount(1);
    await expect(page.getByTestId('hidden-cancelled-count')).toHaveCount(0);
  });

  test('calendar day summaries expand and open one filtered schedule editor (issue #53)', async ({
    page,
  }) => {
    test.slow();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/recurring');

    const dueDate = await page.evaluate((dueDay) => {
      const parts = new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Europe/London',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).formatToParts(new Date());
      const part = (type: Intl.DateTimeFormatPartTypes) =>
        Number(parts.find((entry) => entry.type === type)?.value ?? 0);
      let year = part('year');
      let month = part('month');
      const today = part('day');
      if (today > dueDay) {
        month += 1;
        if (month > 12) {
          month = 1;
          year += 1;
        }
      }
      return `${year}-${String(month).padStart(2, '0')}-${String(dueDay).padStart(2, '0')}`;
    }, 2);

    const suffix = Date.now();
    const firstScheduleName = `Calendar summary alpha ${suffix}`;
    // The second name contains the first, proving scheduleId keeps the deep link exact.
    const schedulesToAdd = [
      { name: firstScheduleName, amount: '950.00' },
      { name: `${firstScheduleName} backup`, amount: '178.50' },
      { name: `Energy ${suffix}`, amount: '124.60' },
      { name: `Broadband ${suffix}`, amount: '53.50' },
      { name: `Streaming ${suffix}`, amount: '34.00' },
      { name: `Car finance ${suffix}`, amount: '206.00' },
    ];
    const names = schedulesToAdd.map(({ name }) => name);
    const schedules = page.locator('section[aria-labelledby="schedules-heading"]');
    await schedules.getByText('Add a schedule').click();
    const addForm = schedules
      .locator('form')
      .filter({ has: page.getByRole('button', { name: 'Add schedule' }) });
    const scheduleList = schedules.locator('ul[data-schedule-scroller]');

    for (const schedule of schedulesToAdd) {
      await addForm.locator('input[name="name"]').fill(schedule.name);
      await addForm.locator('input[name="amount"]').fill(schedule.amount);
      await addForm.locator('select[name="kind"]').selectOption('so');
      await addForm.locator('input[name="dueDayOfMonth"]').fill('2');
      await addForm.locator('select[name="potId"]').selectOption({ label: 'Main account' });
      await addForm.locator('select[name="categoryId"]').selectOption({
        label: 'Utilities / Energy',
      });
      await addForm.getByRole('button', { name: 'Add schedule' }).click();
      await expect(addForm.getByRole('status')).toContainText(/added/i, { timeout: 30_000 });
      await expect(scheduleList.getByText(schedule.name, { exact: true })).toBeVisible();
    }

    await page.goto(`/recurring?month=${dueDate.slice(0, 7)}`);
    const calendar = page.locator('section[aria-labelledby="calendar-heading"]');
    const cell = calendar.locator(`[data-date="${dueDate}"]`);
    const summary = cell.getByRole('button');
    await expect(summary).toContainText('6 items');
    await expect(summary).toContainText('£1546.60');
    const amountLabel = summary.locator('span').nth(1);
    await expect(amountLabel).toHaveText('£1546.60');
    expect(
      await amountLabel.evaluate((element) => element.scrollWidth <= element.clientWidth),
    ).toBe(true);
    await page.setViewportSize({ width: 320, height: 844 });
    expect(
      await amountLabel.evaluate((element) => element.scrollWidth <= element.clientWidth),
    ).toBe(true);
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(summary).toHaveAttribute('aria-expanded', 'false');

    await summary.click();
    await expect(summary).toHaveAttribute('aria-expanded', 'true');
    const dayDetails = calendar.getByRole('region', { name: /Scheduled items for/ });
    for (const name of names) {
      await expect(dayDetails.getByText(name, { exact: true })).toBeVisible();
    }
    const editLink = dayDetails.getByRole('link', {
      name: `Edit schedule: ${firstScheduleName}`,
      exact: true,
    });
    await expect(editLink).toBeVisible();
    await editLink.click();

    await expect(page).toHaveURL(/scheduleId=\d+#schedule-edit-\d+$/);
    await waitForScheduleFilter(page);
    const url = new URL(page.url());
    const scheduleId = url.searchParams.get('scheduleId');
    expect(url.searchParams.get('q')).toBe(firstScheduleName);
    expect(scheduleId).not.toBeNull();
    expect(url.hash).toBe(`#schedule-edit-${scheduleId}`);

    const list = page.locator('section[aria-labelledby="schedules-heading"] ul');
    await expect(list.locator('li')).toHaveCount(1);
    const row = list.locator('li').first();
    await expect(row).toContainText(firstScheduleName);
    const editor = row.locator(`details#schedule-edit-${scheduleId}`);
    await expect(editor).toHaveJSProperty('open', true);
    await expect(editor.locator('form input[name="name"]')).toHaveValue(firstScheduleName);
    await expectRowClearsStickyHeader(page, editor);
  });

  test('supplier card links to schedule, filters recurring page, and shows empty state when unlinked', async ({
    page,
  }) => {
    test.slow();
    // 1. Check a supplier with no schedules shows the empty note.
    await page.goto('/suppliers');
    const cafeCard = page.locator('article', { hasText: 'The Corner Cafe' });
    await expect(cafeCard).toBeVisible();
    await cafeCard.getByRole('button', { name: /The Corner Cafe/ }).click();
    await expect(
      cafeCard.getByText('No scheduled payments relate to this supplier currently'),
    ).toBeVisible();

    // 2. Check an existing supplier with a schedule (BroadbandCo is seeded with BroadbandCo fibre).
    const broadbandCard = page.locator('article', { hasText: 'BroadbandCo' });
    await expect(broadbandCard).toBeVisible();
    await broadbandCard.getByRole('button', { name: /BroadbandCo/ }).click();
    const scheduleLink = broadbandCard.getByRole('link', {
      name: 'Linked to schedule "BroadbandCo fibre"',
    });
    await expect(scheduleLink).toBeVisible();

    // Clicking the link navigates to /recurring with filter and anchor.
    await scheduleLink.click();
    await expect(page).toHaveURL(/\/recurring\?q=BroadbandCo\+fibre#schedule-\d+/);
    const filterBox = page.getByPlaceholder('Filter schedules…');
    await waitForScheduleFilter(page);
    await expect(filterBox).toHaveValue('BroadbandCo fibre');
    const list = page.locator('section[aria-labelledby="schedules-heading"] ul');
    const row = list.locator('li', { hasText: 'BroadbandCo fibre' });
    await expect(row).toHaveCount(1);

    // Re-opened issue #34: the row is not behind the menu. The household's
    // report was exactly this landing — the row's top at 24px, under a 85px
    // bar — and the fix is the measured `sf-anchor` offset.
    await expectRowClearsStickyHeader(page, row);
    // The row arrives whole: its own "Edit schedule" disclosure is on screen,
    // so nothing about this schedule needs a scroll to reach.
    await expect(row.locator('summary', { hasText: 'Edit schedule' })).toBeInViewport();

    // The same link at 1100px, cold: the wrapped-nav header is *taller* than
    // the app's usual 96px offset, and at this point nothing has measured it,
    // so this is the case a constant cannot fix at all. (Go to another page
    // first: re-navigating to the URL the page already shows would not load a
    // document, and the fragment would never be tested.)
    const scheduleId = new URL(page.url()).hash.replace('#', '');
    await page.setViewportSize({ width: 1100, height: 950 });
    await page.goto('/purchases');
    await page.goto(`/recurring?q=BroadbandCo+fibre#${scheduleId}`);
    await expect(page).toHaveURL(new RegExp(`#${scheduleId}$`));
    await expect(filterBox).toHaveValue('BroadbandCo fibre');
    await expectRowClearsStickyHeader(page, list.locator(`li#${scheduleId}`));

    // Back to the laptop width for the rest of the journey.
    await page.setViewportSize({ width: 1400, height: 950 });

    // Clearing the filter restores other schedules.
    await page.getByRole('button', { name: 'Clear filter' }).click();
    await expect(filterBox).toHaveValue('');
    await expect(list.locator('li', { hasText: 'Phone plan' })).toHaveCount(1);
    await expect(list.locator('li', { hasText: 'BroadbandCo fibre' })).toHaveCount(1);
  });

  test('supplier schedule link lands below the sticky header on a phone (issue #43)', async ({
    page,
  }) => {
    test.slow();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/suppliers');
    const broadbandCard = page.locator('article', { hasText: 'BroadbandCo' });
    await expect(broadbandCard).toBeVisible();
    await broadbandCard.getByRole('button', { name: /BroadbandCo/ }).click();
    const scheduleLink = broadbandCard.getByRole('link', {
      name: 'Linked to schedule "BroadbandCo fibre"',
    });
    await expect(scheduleLink).toBeVisible();
    await scheduleLink.click();
    await expect(page).toHaveURL(/\/recurring\?q=BroadbandCo\+fibre#schedule-\d+/);
    await waitForScheduleFilter(page);
    const list = page.locator('section[aria-labelledby="schedules-heading"] ul');
    const row = list.locator('li', { hasText: 'BroadbandCo fibre' });
    await expect(row).toHaveCount(1);
    // Issue #43: on the phone the schedule section sits below the calendar,
    // so the page really has to scroll — and the row must not end the scroll
    // tucked behind the menu bar.
    await expectRowClearsStickyHeader(page, row);
    await expect(row.locator('summary', { hasText: 'Edit schedule' })).toBeInViewport();
  });

  test('schedule link still clears the header when the browser ignores scroll-margin (issue #43)', async ({
    page,
  }) => {
    test.slow();
    // Simulate a browser whose scrollIntoView / fragment scroll does not
    // honour the target's `scroll-margin-top` (older WebKit is the known
    // case: the household's production report, while Chromium — which does
    // honour it — passed every check in v1.13.1). The app cannot rely on
    // that honouring: with the margin stripped, only the app's own
    // header-clearance guard can keep the row out from behind the menu.
    await page.addInitScript(() => {
      const apply = () => {
        const root = document.head ?? document.documentElement;
        if (root === null) return;
        if (document.getElementById('probe-no-anchor-margin') !== null) return;
        const style = document.createElement('style');
        style.id = 'probe-no-anchor-margin';
        style.textContent = '.sf-anchor { scroll-margin-top: 0px !important; }';
        root.appendChild(style);
      };
      apply();
      // The init script can run before <head> exists; keep re-applying so
      // the sheet survives the parser and any soft navigation.
      new MutationObserver(apply).observe(document, { childList: true, subtree: true });
    });
    await page.goto('/suppliers');
    const broadbandCard = page.locator('article', { hasText: 'BroadbandCo' });
    await expect(broadbandCard).toBeVisible();
    await broadbandCard.getByRole('button', { name: /BroadbandCo/ }).click();
    const scheduleLink = broadbandCard.getByRole('link', {
      name: 'Linked to schedule "BroadbandCo fibre"',
    });
    await expect(scheduleLink).toBeVisible();
    await scheduleLink.click();
    await expect(page).toHaveURL(/\/recurring\?q=BroadbandCo\+fibre#schedule-\d+/);
    await waitForScheduleFilter(page);
    const list = page.locator('section[aria-labelledby="schedules-heading"] ul');
    const row = list.locator('li', { hasText: 'BroadbandCo fibre' });
    await expect(row).toHaveCount(1);
    await expectRowClearsStickyHeader(page, row);
    await expect(row.locator('summary', { hasText: 'Edit schedule' })).toBeInViewport();

    // And the same at phone width, where the row is a full page of calendar
    // below the top and the document itself has to travel.
    await page.setViewportSize({ width: 390, height: 844 });
    const scheduleId = new URL(page.url()).hash.replace('#', '');
    await page.goto('/suppliers');
    await page.goto(`/recurring?q=BroadbandCo+fibre#${scheduleId}`);
    await expect(page).toHaveURL(new RegExp(`#${scheduleId}$`));
    await waitForScheduleFilter(page);
    await expectRowClearsStickyHeader(page, list.locator(`li#${scheduleId}`));
  });
});
