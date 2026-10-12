import { expect, type Locator, type Page, test } from '@playwright/test';
import { countChromaticPixels, decodePng } from './pixels';

/**
 * Charts (v0.14.0 — plan decisions 152–157, SPEC §16.7).
 *
 * The four charts are server-rendered SVG with no client JavaScript, so this
 * spec asks the questions that only a real browser can answer: does the
 * phone variant appear on a 320px screen and the laptop variant on a wide
 * one, does the page ever pan sideways (it must not, at 320px or at 360px
 * with 130% text), does the table twin under each chart say exactly what the
 * chart draws, and does clicking through actually land on the purchases the
 * bar was made of.
 *
 * It runs in its own project after `fuel`: it ticks a commitment category in
 * Settings, keeping all changes inside the isolated E2E seed.
 */

const CHARTS = ['forecast', 'groceries', 'personal', 'commitments', 'months'] as const;

/** The figure CSS is actually showing at this width. */
function figure(page: Page, chart: string, variant: 'phone' | 'laptop'): Locator {
  return page.locator(`figure[data-chart="${chart}"][data-variant="${variant}"]`);
}

async function noOverflow(page: Page, where: string): Promise<void> {
  const sizes = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    client: document.documentElement.clientWidth,
  }));
  expect(sizes.scroll, `${where}: page ${sizes.scroll}px on a ${sizes.client}px screen`).toBe(
    sizes.client,
  );
}

/** Every `href` a chart's bars point at, in drawing order. */
async function barLinks(figureLocator: Locator): Promise<string[]> {
  return figureLocator
    .locator('svg a[href]')
    .evaluateAll((nodes) => nodes.map((node) => node.getAttribute('href') ?? ''));
}

/** Every `href` the table twin repeats, in row order. */
async function tableLinks(figureLocator: Locator): Promise<string[]> {
  return figureLocator
    .locator('table a[href]')
    .evaluateAll((nodes) => nodes.map((node) => node.getAttribute('href') ?? ''));
}

/** The table twin's total row, opening the details if they are still shut. */
async function trackedTotal(figureLocator: Locator): Promise<number> {
  const summary = figureLocator.getByText(/^Show the numbers/);
  const foot = figureLocator.locator('tfoot tr');
  if (!(await foot.isVisible())) await summary.click();
  await expect(foot).toBeVisible();
  return poundsIn(await foot.innerText())[0] ?? 0;
}

function poundsIn(text: string): number[] {
  return [...text.matchAll(/(-?)£([\d,]+\.\d{2})/g)].map(
    (match) => Number(match[2]?.replace(/,/g, '') ?? '0') * (match[1] === '-' ? -1 : 1),
  );
}

test.describe('charts', () => {
  test('a 320px phone gets the phone charts, and the page never pans sideways', async ({
    page,
  }) => {
    test.slow();
    for (const setup of [
      { width: 320, fontSize: null, label: '320px' },
      { width: 360, fontSize: '130%', label: '360px @130%' },
    ]) {
      await page.setViewportSize({ width: setup.width, height: 780 });
      await page.goto('/charts');
      if (setup.fontSize !== null) {
        await page.addStyleTag({ content: `html{font-size:${setup.fontSize}}` });
      }
      await expect(page.getByRole('heading', { name: 'The money, drawn' })).toBeVisible();

      for (const chart of CHARTS) {
        const phone = figure(page, chart, 'phone');
        const laptop = figure(page, chart, 'laptop');
        await expect(phone, `${setup.label}: ${chart} phone figure`).toBeVisible();
        await expect(laptop, `${setup.label}: ${chart} laptop figure`).toBeHidden();
        // The drawing is one image with the verdict as its label.
        const svg = phone.locator('svg[role="img"]').first();
        await expect(svg).toHaveAttribute('aria-label', /\S/);
        const headline = (await phone.locator('[data-chart-headline]').innerText()).trim();
        expect(await svg.getAttribute('aria-label')).toContain(headline);
        // …and it fits the width it was given. The months drawing may grow
        // wider than its column and scroll sideways (decision 201) — then it
        // is the scroll frame that must fit, and the drawing is clipped to it.
        const frame = phone.locator('[data-chart-scroll]');
        const fitting = chart === 'months' ? frame : svg;
        const box = await fitting.boundingBox();
        expect(box, `${setup.label}: ${chart} has no box`).not.toBeNull();
        expect(
          box?.width ?? 0,
          `${setup.label}: ${chart} ${chart === 'months' ? 'scroll frame' : 'svg'} ${box?.width}px wide`,
        ).toBeLessThanOrEqual(setup.width);
        await noOverflow(page, `${setup.label}: ${chart}`);
      }

      // Opening every table twin must not widen the page either.
      for (const summary of await page.getByText(/^Show the numbers/).all()) {
        if (await summary.isVisible()) await summary.click();
      }
      await noOverflow(page, `${setup.label}: tables open`);
    }
  });

  test('a laptop gets the wider charts, and each table twin says what its chart draws', async ({
    page,
  }) => {
    test.slow();
    await page.setViewportSize({ width: 1400, height: 950 });
    await page.goto('/charts');

    for (const chart of CHARTS) {
      const laptop = figure(page, chart, 'laptop');
      await expect(laptop, `${chart} laptop figure`).toBeVisible();
      await expect(figure(page, chart, 'phone'), `${chart} phone figure`).toBeHidden();

      await laptop.getByText(/^Show the numbers/).click();
      const table = laptop.locator(`table[data-chart-table="${chart}"]`);
      await expect(table).toBeVisible();
      const rows = await table.locator('tbody tr').count();
      expect(rows, `${chart}: the table twin is empty`).toBeGreaterThan(0);
      // "Show the numbers (N rows)" counts the rows it is about to show.
      await expect(laptop.getByText(/^Show the numbers/)).toContainText(`${rows} row`);

      // Each bar's drill-down is repeated as a real link in the table, in the
      // same order — that is the keyboard and screen-reader path.
      const bars = await barLinks(laptop);
      if (bars.length > 0) {
        expect(await tableLinks(laptop), `${chart}: bar links vs table links`).toEqual(bars);
      }
    }

    // The bucketed charts foot up: the total row is the sum of its rows.
    for (const chart of ['groceries', 'commitments'] as const) {
      const table = figure(page, chart, 'laptop').locator(`table[data-chart-table="${chart}"]`);
      const cells = await table.locator('tbody tr td:last-child').allInnerTexts();
      const sum = cells.reduce((total, cell) => total + (poundsIn(cell)[0] ?? 0), 0);
      const footer = poundsIn(await table.locator('tfoot tr').innerText())[0] ?? 0;
      expect(Math.round(sum * 100), `${chart}: rows vs total`).toBe(Math.round(footer * 100));
    }
  });

  test('the months chart scrolls sideways and hints its abbreviated names', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 780 });
    await page.goto('/charts');
    const months = figure(page, 'months', 'phone');
    const frame = months.locator('[data-chart-scroll]');
    await expect(frame).toBeVisible();

    // The categories outgrow the phone column: the drawing is wider than its
    // frame and scrolls inside it (the page itself never pans).
    expect(
      await frame.evaluate((el) => el.scrollWidth > el.clientWidth + 2),
      'the months drawing overflows its scroll frame',
    ).toBe(true);
    await noOverflow(page, '320px: months scroll frame');

    // An abbreviated axis label carries its full name as a hover hint.
    await expect(months.locator('svg text title', { hasText: 'Groceries' })).toHaveCount(1);
    await expect(months.locator('svg text', { hasText: "Grocer'" }).first()).toBeVisible();
    // …and the table twin always spells the names out.
    await months.getByText(/^Show the numbers/).click();
    await expect(months.locator('table[data-chart-table="months"]')).toContainText('Groceries');

    // The arrows nudge the drawing sideways; the left arrow only exists once
    // there is somewhere behind it to go.
    const right = page.getByRole('button', { name: 'Scroll the three months chart right' });
    const left = page.getByRole('button', { name: 'Scroll the three months chart left' });
    await expect(right).toBeVisible();
    await expect(left).toBeHidden();
    const before = await frame.evaluate((el) => el.scrollLeft);
    await right.click();
    await expect
      .poll(async () => frame.evaluate((el) => el.scrollLeft), { timeout: 5_000 })
      .toBeGreaterThan(before);
    await expect(left).toBeVisible();
    await noOverflow(page, '320px: months after the arrows');
  });

  test('the in-progress bars are painted, not merely present (decision 202)', async ({ page }) => {
    test.slow();
    // A laptop viewport is the case that failed from v0.14.0 to v1.4.0: at
    // 1024px and wider the phone figures are hidden, and the hatched bars
    // pointed at a `<pattern>` that lived inside one of them. A `url(#…)`
    // that resolves into a `display: none` subtree paints nothing at all, so
    // the bars were in the DOM, at the right size, and invisible. Nothing but
    // a pixel can tell that story.
    await page.setViewportSize({ width: 1400, height: 950 });
    await page.goto('/charts');
    await expect(page.getByRole('heading', { name: 'The money, drawn' })).toBeVisible();

    // First the shape of the mistake: an id is document-global, so two figures
    // that share one borrow each other's paint server — and the borrowed copy
    // is the one CSS hides at this width.
    const borrowed = await page.evaluate(() => {
      const problems: string[] = [];
      const users = new Map<string, Set<string>>();
      for (const figure of document.querySelectorAll('figure[data-chart]')) {
        const name = `${figure.getAttribute('data-chart') ?? '?'}/${figure.getAttribute('data-variant') ?? '?'}`;
        for (const rect of figure.querySelectorAll('svg rect')) {
          const fill = getComputedStyle(rect).fill;
          const id = /^url\(["']?#([^"')]+)/.exec(fill)?.[1];
          if (id === undefined) continue;
          const server = document.getElementById(id);
          if (server === null) problems.push(`${name}: url(#${id}) resolves to nothing`);
          else if (!figure.contains(server))
            problems.push(`${name}: url(#${id}) resolves to a pattern outside this figure`);
          const set = users.get(id) ?? new Set<string>();
          set.add(name);
          users.set(id, set);
        }
      }
      for (const [id, figures] of users) {
        if (figures.size > 1) problems.push(`url(#${id}) is shared by ${[...figures].join(', ')}`);
      }
      return problems;
    });
    expect(borrowed, 'paint servers borrowed across figures').toEqual([]);

    // Then the paint itself. The frame is the whole page rather than the
    // element: element screenshots come back unpainted in some headless
    // builds, so the drawing is measured in page coordinates and the bar's own
    // box is read out of a full-page shot (docs/SANDBOX.md).
    await page.evaluate(() => window.scrollTo(0, 0));
    // `innerWidth`, not the document's client width: a full-page screenshot is
    // the viewport wide, and the scrollbar is not part of it.
    const frame = await page.evaluate(() => ({
      width: window.innerWidth,
      height: window.innerHeight,
    }));
    const raster = decodePng(await page.screenshot({ fullPage: true }));
    const scale = raster.width / frame.width;
    let probed = 0;
    const unpainted: string[] = [];
    for (const chart of ['months', 'groceries'] as const) {
      const laptop = figure(page, chart, 'laptop');
      await expect(laptop, `${chart}: the laptop figure`).toBeVisible();
      const bars = await laptop.evaluate((element) =>
        Array.from(element.querySelectorAll('svg rect'))
          .filter((rect) => getComputedStyle(rect).fill.startsWith('url('))
          .map((rect) => {
            const box = rect.getBoundingClientRect();
            return {
              x: box.x + window.scrollX,
              y: box.y + window.scrollY,
              width: box.width,
              height: box.height,
            };
          }),
      );
      expect(bars.length, `${chart}: no hatched bar is drawn`).toBeGreaterThan(0);

      for (const bar of bars) {
        // A bar with no height is an honest zero — there is nothing to paint.
        if (bar.width < 1 || bar.height < 1) continue;
        probed += 1;
        // Probe inside the bar, so the series colour's own edge cannot answer
        // for the paint.
        const painted = countChromaticPixels(raster, {
          x: (bar.x + 1) * scale,
          y: (bar.y + 1) * scale,
          width: Math.max(1, (bar.width - 2) * scale),
          height: Math.max(1, (bar.height - 2) * scale),
        });
        if (painted < 2) {
          unpainted.push(
            `${chart}: the bar at ${Math.round(bar.x)},${Math.round(bar.y)} (${Math.round(
              bar.width,
            )}×${Math.round(bar.height)}) painted ${painted} coloured pixels`,
          );
        }
      }
    }
    expect(probed, 'no in-progress bar is drawn to check').toBeGreaterThan(0);
    expect(unpainted, 'in-progress bars with no pixels').toEqual([]);
  });

  test('a grocery week opens the purchases it was made of', async ({ page }) => {
    await page.setViewportSize({ width: 1400, height: 950 });
    await page.goto('/charts');
    const groceries = figure(page, 'groceries', 'laptop');
    await groceries.getByText(/^Show the numbers/).click();

    // The most recent complete week with money in it.
    const rows = groceries.locator('tbody tr').filter({ hasNotText: '(so far)' });
    const withSpend = rows.filter({ hasText: /£(?!0\.00)/ });
    const row = withSpend.last();
    const weekStart = (await row.locator('td').first().innerText()).trim();
    const spent = poundsIn(await row.innerText()).pop() ?? 0;
    await row.getByRole('link').click();

    await expect(page).toHaveURL(new RegExp(`from=${weekStart}`));
    await expect(page.getByRole('heading', { name: 'Every recorded purchase' })).toBeVisible();
    const results = page.locator('section[aria-labelledby="results-heading"]');
    await expect(results.getByRole('heading')).not.toContainText('0 entries');

    // The filtered list holds at least that week's grocery money. It may hold
    // more, and the page says why: a purchase-level filter matches the
    // purchase, so a split shop arrives whole, with its non-grocery lines.
    const totals = await results.locator('tbody tr td:nth-child(6)').allInnerTexts();
    const listed = totals.reduce((sum, cell) => sum + (poundsIn(cell)[0] ?? 0), 0);
    expect(
      Math.round(listed * 100),
      `week of ${weekStart}: the chart says £${spent}, the purchases behind it add to £${listed}`,
    ).toBeGreaterThanOrEqual(Math.round(spent * 100));
    await expect(page.getByText(/receipt-style/).first()).toBeVisible();
  });

  test('the chips narrow the personal chart, and the URL carries the choice', async ({ page }) => {
    await page.setViewportSize({ width: 1400, height: 950 });
    await page.goto('/charts');
    const chips = page.getByRole('group', { name: 'Whose spending to show' });
    const headline = figure(page, 'personal', 'laptop').locator('[data-chart-headline]');
    await expect(headline).toContainText('Alex');
    await expect(headline).toContainText('Sam');

    await chips.getByRole('link', { name: 'Alex' }).click();
    await expect(page).toHaveURL(/who=/);
    await expect(headline).not.toContainText('Alex');
    await expect(headline).toContainText('Sam');
    await expect(headline).toContainText('Household');

    // A reload keeps it: the choice lives in the URL, not in a component.
    await page.reload();
    await expect(headline).not.toContainText('Alex');

    // Turning Alex back on restores everybody.
    await chips.getByRole('link', { name: 'Alex' }).click();
    await expect(headline).toContainText('Alex');
    await expect(headline).toContainText('Sam');
  });

  test('the commitments chart is defined in Settings, and the schedule-only view is narrower', async ({
    page,
  }) => {
    test.slow();
    await page.setViewportSize({ width: 1400, height: 950 });

    // 1. Tick a category the household pays by hand as well as by direct debit.
    await page.goto('/settings#commitment-categories');
    const section = page.locator('#commitment-categories');
    await expect(section.getByRole('heading', { name: /Fixed commitments/ })).toBeVisible();
    const utilities = section.getByRole('group', { name: 'Utilities' });
    await utilities.getByRole('checkbox', { name: /^Energy/ }).check();
    await section.getByRole('button', { name: 'Save tracked commitments' }).click();
    await expect(section.getByRole('status')).toContainText(/commitment/i, { timeout: 30_000 });

    // 2. The chart now counts Energy, and lists what it counts.
    await page.goto('/charts#commitments');
    const commitments = figure(page, 'commitments', 'laptop');
    await expect(page.locator('#commitments')).toContainText('Utilities / Energy');
    const everything = await trackedTotal(commitments);

    // 3. "Schedule-converted only" is a link, and it never counts more: the
    //    hand-typed energy bills drop out, the converted direct debits stay.
    const toggle = page.getByRole('link', { name: /Schedule-converted only/ });
    await expect(toggle).not.toHaveAttribute('aria-current', 'true');
    await toggle.click();
    await expect(page).toHaveURL(/scheduleOnly=1/);
    await expect(commitments.locator('[data-chart-headline]')).toContainText(
      /schedule-converted only/i,
    );
    expect(
      await trackedTotal(commitments),
      'schedule-converted only counted MORE',
    ).toBeLessThanOrEqual(everything);

    // 4. The way back is the same link, and it says which state it is in.
    const pressed = page.getByRole('link', { name: /Schedule-converted only/ });
    await expect(pressed).toHaveAttribute('aria-current', 'true');
    await pressed.click();
    await expect(page).not.toHaveURL(/scheduleOnly=1/);
  });

  test('the charts agree with the tables on Insights', async ({ page }) => {
    await page.setViewportSize({ width: 1400, height: 950 });
    await page.goto('/charts');
    const groceries = figure(page, 'groceries', 'laptop');
    await groceries.getByText(/^Show the numbers/).click();
    // The trailing-8-week average is the honesty loop's own figure.
    const average = poundsIn(await groceries.locator('[data-chart-headline]').innerText())[0] ?? 0;

    await page.goto('/insights');
    const loop = page.getByRole('region', { name: /configured figures honest/i });
    await expect(loop).toBeVisible();
    const insightsAverage = poundsIn(await loop.innerText());
    expect(
      insightsAverage,
      `charts say £${average} a week; insights said ${insightsAverage.join(', ')}`,
    ).toContain(average);
  });

  test('Charts is reachable from the navigation and from the home page', async ({ page }) => {
    await page.setViewportSize({ width: 1400, height: 950 });
    await page.goto('/');
    await page.getByRole('link', { name: 'Charts', exact: true }).first().click();
    await expect(page).toHaveURL(/\/charts$/);
    await expect(page.getByRole('heading', { name: 'The money, drawn' })).toBeVisible();
  });
});
