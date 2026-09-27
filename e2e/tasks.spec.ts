import { expect, test, type Page } from '@playwright/test';
import { addDaysIso, londonToday } from './support';

/**
 * Tasks (v0.25.0, SPEC §25, decision 175). The defect this release fixes: a
 * follow-up dated on a supplier call did nothing — it dropped off every list
 * the day after its date, and nothing could close or move it. These tests
 * drive the real pages: a task is written, ticked, and still closed after a
 * reload; a follow-up promised on a call turns into a task on the card; a
 * purchase can carry "Chase the refund".
 *
 * Own project, before `backup`: it adds tasks to the shared seed.
 */

test.use({ viewport: { width: 1400, height: 950 } });

function yourTasks(page: Page) {
  return page.locator('section[aria-labelledby="your-tasks-heading"]');
}

test.describe('tasks', () => {
  test('a task is created, ticked done, and stays done after a reload', async ({ page }) => {
    const today = londonToday();
    await page.goto('/tasks');
    await expect(page.getByRole('heading', { name: 'Tasks', level: 1 })).toBeVisible();

    // The seeded BroadbandCo call promised a follow-up: it is already a task,
    // with its state in words.
    const seeded = yourTasks(page).locator('li', { hasText: 'Follow up with BroadbandCo' });
    await expect(seeded).toContainText('In 6 days');
    await expect(seeded.getByRole('link', { name: 'BroadbandCo' })).toHaveAttribute(
      'href',
      /\/suppliers\?supplierId=\d+/,
    );

    // "The app has noticed" is separate and has nothing to tick: the seeded
    // renewal is a link to its row on Contracts & Renewals.
    const noticed = page.locator('section[aria-labelledby="noticed-heading"]');
    const renewal = noticed.locator('li', { hasText: /Vehicle A insurance renews in \d+ days/ });
    await expect(renewal.getByRole('link', { name: /Open the renewal/ })).toHaveAttribute(
      'href',
      /\/contracts#renewal-\d+/,
    );
    await expect(noticed.getByRole('checkbox')).toHaveCount(0);

    // Write one that was due yesterday, about a supplier.
    const title = `Research cheaper tariffs ${Date.now()}`;
    await page.getByPlaceholder('What needs doing?').fill(title);
    await page.getByLabel('Due by', { exact: true }).fill(addDaysIso(today, -1));
    await page.getByLabel('About', { exact: true }).selectOption({ label: 'BroadbandCo' });
    await page.getByRole('button', { name: 'Add task' }).click();
    await expect(page.getByText(`Added “${title}”`)).toBeVisible({ timeout: 30_000 });

    // Overdue leads, and says so in words — colour is never the only signal.
    const overdue = page.locator('section[aria-labelledby="tasks-overdue-heading"]');
    const row = overdue.locator('li', { hasText: title });
    await expect(row).toContainText('Overdue by 1 day');
    await expect(row).toContainText('About: BroadbandCo');

    // Tick it: it leaves the open list...
    await row.getByRole('checkbox', { name: `Mark done: ${title}` }).click();
    await expect(page.getByRole('checkbox', { name: `Mark done: ${title}` })).toHaveCount(0, {
      timeout: 30_000,
    });

    // ...and it is still closed after a reload, under "Done", with who did it.
    await page.reload();
    await expect(page.getByRole('checkbox', { name: `Mark done: ${title}` })).toHaveCount(0);
    const done = page.locator('details', { hasText: /Done in the last 30 days/ });
    await done.locator('summary').click();
    const doneRow = done.locator('li', { hasText: title });
    await expect(doneRow).toContainText('Done by');

    // A mis-tick is undone with Reopen, and the task is back where it was.
    await doneRow.getByRole('button', { name: `Reopen: ${title}` }).click();
    await expect(
      page
        .locator('section[aria-labelledby="tasks-overdue-heading"]')
        .getByRole('checkbox', { name: `Mark done: ${title}` }),
    ).toBeVisible({ timeout: 30_000 });

    // Close it for good with a note, through the row's own controls.
    const reopened = page
      .locator('section[aria-labelledby="tasks-overdue-heading"] li')
      .filter({ hasText: title });
    await reopened.getByText('Reschedule, edit or close with a note').click();
    await reopened.getByLabel('Close with a note (optional)').fill('Fixed deal found');
    await reopened.getByRole('button', { name: 'Mark done' }).click();
    await expect(page.getByRole('checkbox', { name: `Mark done: ${title}` })).toHaveCount(0, {
      timeout: 30_000,
    });
  });

  test('a follow-up promised on a call becomes a task on the card', async ({ page }) => {
    const today = londonToday();
    // Unique per attempt, so a CI retry never meets the first attempt's task.
    const promise = `Ring back for the quote ${Date.now()}`;
    await page.goto('/suppliers');
    const card = page
      .locator('article', { has: page.getByRole('heading', { name: 'InsurerCo', exact: true }) })
      .first();
    await card.getByRole('button', { name: /InsurerCo/i }).click();

    await card.getByPlaceholder('What happened?').fill('Asked for the renewal quote');
    await card.getByLabel('Follow up by', { exact: true }).fill(addDaysIso(today, 12));
    await card.getByLabel('Follow-up task (optional)').fill(promise);
    await card.getByRole('button', { name: 'Log interaction' }).click();
    await expect(card.getByText(`task “${promise}” added`)).toBeVisible({ timeout: 30_000 });

    // The log line is labelled — no bare date under a call any more. (The
    // task carries the call's summary as its detail, so pick the log entry
    // by its label.)
    const logEntry = card
      .locator('li', { hasText: 'Interaction:' })
      .filter({ hasText: 'Asked for the renewal quote' })
      .first();
    await expect(logEntry).toContainText('Interaction:');
    await expect(logEntry).toContainText('Logged by:');
    await expect(logEntry).toContainText('Follow up by:');
    await expect(logEntry).toContainText('In 12 days');

    // The card's Tasks section has it with a box to tick, and the header counts it.
    const task = card
      .locator('li', { hasText: promise })
      .filter({ has: page.getByRole('checkbox') });
    await expect(task).toContainText('In 12 days');
    await expect(task).toContainText('from a logged interaction');
    await expect(card.getByText(/\d+ open tasks?/)).toBeVisible();

    // Ticking it on the card closes it everywhere.
    await task.getByRole('checkbox', { name: `Mark done: ${promise}` }).click();
    await expect(card.getByRole('checkbox', { name: `Mark done: ${promise}` })).toHaveCount(0, {
      timeout: 30_000,
    });
    await expect(logEntry).toContainText(/Follow up by:.*Done/);
    await page.goto('/tasks');
    await expect(page.getByRole('checkbox', { name: `Mark done: ${promise}` })).toHaveCount(0);
  });

  test('a purchase can carry a task, and the Tasks page links back to it', async ({ page }) => {
    const chase = `Chase the refund ${Date.now()}`;
    await page.goto('/purchases');
    const firstRow = page.locator('tbody tr').first();
    const rowId = await firstRow.getAttribute('id');
    expect(rowId).toMatch(/^purchase-\d+$/);
    await firstRow.getByText('Add a task', { exact: true }).click();
    await firstRow.getByPlaceholder('e.g. Chase the refund').fill(chase);
    await firstRow.getByRole('button', { name: 'Add task' }).click();
    await expect(firstRow.getByRole('checkbox', { name: `Mark done: ${chase}` })).toBeVisible({
      timeout: 30_000,
    });

    await page.goto('/tasks');
    const row = yourTasks(page).locator('li', { hasText: chase });
    const link = row.getByRole('link').first();
    await expect(link).toHaveAttribute('href', new RegExp(`#${rowId}$`));
    await link.click();
    await expect(page).toHaveURL(new RegExp(`/purchases\\?from=.*#${rowId}$`));
    await expect(
      page.locator(`#${rowId}`).getByRole('checkbox', { name: `Mark done: ${chase}` }),
    ).toBeVisible();
  });
});
