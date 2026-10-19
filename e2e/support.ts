import { expect, type Locator, type Page } from '@playwright/test';
import { toLocalDateString } from '../src/lib/time';

/**
 * Wait until the Quick Entry till is listening (SPEC §15.1).
 *
 * The till is a client island. Before React hydrates it, a tap switches
 * nothing and a keystroke into a controlled input is wiped by the hydration
 * render — and the form is `inert` until it can hear, so it cannot pretend
 * otherwise. Clicking and typing faster than the page can hydrate is not a
 * household behaviour worth asserting, but it is exactly what a test does:
 * locator *actions* do not auto-wait for hydration the way assertions do, so
 * every spec that drives the till waits for the form's own ready signal first.
 *
 * `data-till-ready` is the till's, not the page's: the rest of the page may
 * still be catching up.
 */
export async function waitForTill(page: Page): Promise<void> {
  await expect(page.locator('[data-till-ready="true"]')).toBeAttached();
}

/**
 * Wait until the /purchases filter form is listening (SPEC §15.1 — the
 * decision 131 rule applied to the filter island). The form's dependent
 * selects (Target type → Target) are controlled React state: a `selectOption`
 * landing before hydration is silently swallowed and the picker never
 * populates, which is exactly what a fast test does on a cold runner. The form
 * is `inert` until then and publishes `data-filters-ready`.
 */
export async function waitForFilters(page: Page): Promise<void> {
  await expect(page.locator('[data-filters-ready="true"]')).toBeAttached();
}

/**
 * Wait until the Appearance gallery is listening (SPEC §15.4). Same rule as
 * the till: the radios only turn the page over once React has hydrated them,
 * and the form is `inert` until it can hear, so a click that lands earlier
 * would change nothing. It publishes `data-theme-gallery-ready`.
 */
export async function waitForThemeGallery(page: Page): Promise<void> {
  await expect(page.locator('[data-theme-gallery-ready="true"]')).toBeAttached();
}

/**
 * Today's date as the app sees it — the household's calendar in
 * Europe/London, not the test runner's. CI runs in UTC, so for an hour every
 * summer night (23:00–00:00 UTC is already tomorrow in London) a spec that
 * took its "today" from UTC disagreed with the server by a day. Every date a
 * spec computes starts here (decision 134).
 */
export function londonToday(now: Date = new Date()): string {
  return toLocalDateString(now);
}

/** An ISO local date `days` after (or, negative, before) another, calendar-exact. */
export function addDaysIso(isoDate: string, days: number): string {
  const [year, month, day] = isoDate.split('-').map(Number);
  return new Date(Date.UTC(year ?? 0, (month ?? 1) - 1, (day ?? 1) + days))
    .toISOString()
    .slice(0, 10);
}

/**
 * Wait until the Recurring schedule filter is listening (SPEC §15.1 — the
 * decision 131 rule the till, the Purchases filters, the theme gallery and the
 * category editor already follow). The schedules panel is a client island: a
 * keystroke into the filter before React hydrates it is wiped by the hydration
 * render, so a fast test on a cold dev server would type into a box that never
 * filters. The filter row is `inert` until it can hear and publishes
 * `data-schedules-ready`.
 */
export async function waitForScheduleFilter(page: Page): Promise<void> {
  await expect(page.locator('[data-schedules-ready="true"]')).toBeAttached();
}

/**
 * Wait until a transfer row's in-place toggle is listening (decision 225 —
 * the decision 131 rule applied to All Transactions). Each transfer row is a
 * client island: a click on its pot name before React hydrates it would open
 * nothing, so the toggle is `inert` until then and publishes
 * `data-transfer-ready`.
 */
export async function waitForTransferToggle(row: Locator): Promise<void> {
  await expect(row.locator('[data-transfer-ready="true"]')).toBeAttached();
}

/**
 * Wait until a purchase row's in-place toggle is listening (decision 226 — the
 * same rule, applied to the supplier name). Each purchase row is a client
 * island: a click on its supplier before React hydrates it would open nothing,
 * so the toggle is `inert` until then and publishes `data-purchase-ready`.
 */
export async function waitForPurchaseToggle(row: Locator): Promise<void> {
  await expect(row.locator('[data-purchase-ready="true"]')).toBeAttached();
}

/**
 * Wait until the category tree editor is listening (decision 167). The
 * rename/retire picker is controlled React state with `parent:` / `child:`
 * option values; a `selectOption` before hydration would leave the visible
 * selection and the hidden `categoryId` out of sync (the bug this session
 * fixed). The form is `inert` until ready and publishes `data-category-ready`.
 */
export async function waitForCategoryEditor(page: Page): Promise<void> {
  await expect(page.locator('[data-category-ready="true"]')).toBeAttached();
}

/**
 * Choose a Quick Entry category through its searchable picker (GitHub issue
 * #76). The category field is a combobox now, not a native `<select>`:
 * clicking it opens the inline list, typing filters parent or child, and the
 * matching row is tapped like a household would tap it.
 */
export async function pickEntryCategory(entry: Locator, category: string, line = 1): Promise<void> {
  const field = entry.getByLabel(/^Category/).nth(line - 1);
  await field.click();
  await field.fill(category);
  await entry
    .getByRole('listbox', { name: `Matching categories for line ${line}` })
    .getByRole('option', { name: category, exact: true })
    .click();
}

/**
 * Choose a supplier through the Recurring form's searchable picker (GitHub
 * issue #78). `Add a new supplier…` is a pinned row, so it survives whatever
 * was typed before it.
 */
export async function pickScheduleSupplier(form: Locator, supplier: string): Promise<void> {
  const field = form.getByLabel('Supplier', { exact: true });
  await field.click();
  await field.fill(supplier);
  await form
    .getByRole('listbox', { name: 'Matching suppliers' })
    .getByRole('option', { name: supplier, exact: true })
    .click();
}

/**
 * Wait until the pot cards' default-use ticks are listening (GitHub issue
 * #79). Same rule as the till and the category editor (decision 131): the
 * three boxes are controlled state, so a tick that lands before hydration is
 * undone by the hydration render. The form is `inert` until it can hear and
 * publishes `data-pot-defaults-ready`.
 */
export async function waitForPotDefaults(page: Page): Promise<void> {
  await expect(page.locator('[data-pot-defaults-ready="true"]').first()).toBeAttached();
}
