import { expect, type Locator, type Page, test } from '@playwright/test';
import { previousPaydayOccurrences } from '../src/lib/records/dates';
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

const CHARTS = ['forecast', 'groceries', 'personal', 'commitments', 'months', 'pace'] as const;

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

/** A calendar month relative to the household's current one (Europe/London). */
function londonMonth(offset: number): { key: string; label: string } {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London',
    year: 'numeric',
    month: 'numeric',
  }).formatToParts(new Date());
  const year = Number(parts.find((part) => part.type === 'year')?.value);
  const month = Number(parts.find((part) => part.type === 'month')?.value);
  const date = new Date(Date.UTC(year, month - 1 + offset, 1));
  const y = date.getUTCFullYear();
  const m = date.getUTCMonth() + 1;
  return {
    key: `${y}-${String(m).padStart(2, '0')}`,
    label: new Intl.DateTimeFormat('en-GB', {
      timeZone: 'UTC',
      month: 'long',
      year: 'numeric',
    }).format(date),
  };
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

  test('a grocery week opens its line items in place, then the purchases list (issue #94)', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1400, height: 950 });
    await page.goto('/charts');
    const card = page.locator('#groceries');
    const groceries = figure(page, 'groceries', 'laptop');
    await groceries.getByText(/^Show the numbers/).click();

    // The most recent complete week with money in it.
    const rows = groceries.locator('tbody tr').filter({ hasNotText: '(so far)' });
    const withSpend = rows.filter({ hasText: /£(?!0\.00)/ });
    const row = withSpend.last();
    const weekStart = (await row.locator('td').first().innerText()).trim();
    const spent = poundsIn(await row.innerText()).pop() ?? 0;
    await row.getByRole('link').click();

    // In line: still /charts, a panel under the chart, no purchases page yet.
    await expect(page).toHaveURL(new RegExp(`show=b%3A${weekStart}`));
    const panel = card.locator('#groceries-lines');
    await expect(panel).toBeVisible();
    await expect(panel.getByRole('heading')).toHaveText(/^Line items: week of /);
    await expect(page.getByRole('heading', { name: 'Every recorded purchase' })).toHaveCount(0);

    // The panel's own lines add up to the bar that was tapped — exactly, not
    // approximately: the chart and the panel read the same allocation lines.
    const lineTotals = await panel.locator('tbody tr td:nth-child(5)').allInnerTexts();
    const panelTotal = lineTotals.reduce((sum, cell) => sum + (poundsIn(cell)[0] ?? 0), 0);
    expect(
      Math.round(panelTotal * 100),
      `week of ${weekStart}: the chart says £${spent}, its line items add to £${panelTotal}`,
    ).toBe(Math.round(spent * 100));

    // "Open these purchases" is the document link to the filtered list.
    await panel.getByRole('link', { name: /Open these purchases/ }).click();
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

  test('Charts B, C and F open their line items in place, without a reload or a scroll jump (issue #94)', async ({
    page,
  }) => {
    test.slow();
    // A soft navigation keeps `window`; a full document load runs this again.
    await page.addInitScript(() => {
      const key = 'sf-e2e-document-loads';
      sessionStorage.setItem(key, String(Number(sessionStorage.getItem(key) ?? '0') + 1));
    });

    /** Click the first drawn bar of a chart and demand a panel in place. */
    const tapDrawnBar = async (
      chart: string,
      width: number,
      hrefPart: string,
    ): Promise<{ loads: string | null; scroll: number }> => {
      const drawing = figure(page, chart, width < 1024 ? 'phone' : 'laptop');
      const rects = drawing.locator(`svg a[href*="${hrefPart}"] rect`);
      await expect(rects.first()).toBeAttached();
      const drawn = await rects.evaluateAll((nodes) =>
        nodes.findIndex((node) => node.getBoundingClientRect().height > 4),
      );
      expect(drawn, `${chart}: a drawn bar`).toBeGreaterThanOrEqual(0);
      const bar = rects.nth(drawn);
      await bar.scrollIntoViewIfNeeded();
      await page.waitForTimeout(120);
      const before = await page.evaluate(() => window.scrollY);
      const loads = await page.evaluate(() => sessionStorage.getItem('sf-e2e-document-loads'));
      await bar.click();
      await page.waitForTimeout(450);
      return { loads, scroll: before };
    };

    for (const width of [390, 1400]) {
      await page.setViewportSize({ width, height: 950 });
      await page.goto('/charts');
      // Inert anchors until the router has hydrated; a click before then is a
      // full document load, which is exactly what this test rules out.
      await page.waitForFunction(() =>
        Boolean(document.documentElement.style.getPropertyValue('--sf-anchor-offset')),
      );

      // B — groceries.
      const groceries = await tapDrawnBar('groceries', width, 'show=b%3A');
      let panel = page.locator('#groceries-lines');
      await expect(panel).toBeVisible();
      expect(page.url()).toContain('show=b%3A');
      expect(
        await page.evaluate(() => sessionStorage.getItem('sf-e2e-document-loads')),
        'Chart B: a full document load',
      ).toBe(groceries.loads);
      expect(Math.abs((await page.evaluate(() => window.scrollY)) - groceries.scroll)).toBeLessThan(
        8,
      );
      await panel.getByRole('link', { name: 'Close line items' }).click();
      await expect(page.locator('#groceries-lines')).toHaveCount(0);
      await expect(page).not.toHaveURL(/show=/);

      // C — personal spending. A segment opens its month's line items, and the
      // person chips (the chart's own series filter) keep them open.
      const personal = await tapDrawnBar('personal', width, 'show=c%3A');
      panel = page.locator('#personal-lines');
      await expect(panel).toBeVisible();
      await expect(panel.getByRole('heading')).toHaveText(/^Line items: /);
      expect(page.url()).toContain('show=c%3A');
      expect(
        await page.evaluate(() => sessionStorage.getItem('sf-e2e-document-loads')),
        'Chart C: a full document load',
      ).toBe(personal.loads);
      expect(Math.abs((await page.evaluate(() => window.scrollY)) - personal.scroll)).toBeLessThan(
        8,
      );
      const panelHeading = (await panel.getByRole('heading').innerText()).trim();
      // Switching that series off closes its panel with it.
      const who = panelHeading.replace(/^Line items: /, '').split(' — ')[0] ?? '';
      const chips = page
        .locator('#personal')
        .getByRole('group', { name: 'Whose spending to show' });
      // No `exact`: a switched-on chip reads "✓ Alex", as the older chips
      // spec already relies on.
      await chips.getByRole('link', { name: who }).click();
      await expect(page.locator('#personal-lines')).toHaveCount(0);
      await expect(page).not.toHaveURL(/show=/);
      await chips.getByRole('link', { name: who }).click();
      await expect(chips.getByRole('link', { name: who })).toHaveAttribute('aria-current', 'true');

      // F — three months by category.
      const months = await tapDrawnBar('months', width, 'show=f%3A');
      panel = page.locator('#months-lines');
      await expect(panel).toBeVisible();
      await expect(panel.getByRole('heading')).toHaveText(/^Line items: .+ — /);
      expect(page.url()).toContain('show=f%3A');
      expect(
        await page.evaluate(() => sessionStorage.getItem('sf-e2e-document-loads')),
        'Chart F: a full document load',
      ).toBe(months.loads);
      expect(Math.abs((await page.evaluate(() => window.scrollY)) - months.scroll)).toBeLessThan(8);

      // The Exclude Housing toggle is a soft navigation too: it redraws the
      // chart (the issue's "changing the data series") without a page load,
      // and leaves the open panel for a category it still draws.
      const loadsBeforeToggle = await page.evaluate(() =>
        sessionStorage.getItem('sf-e2e-document-loads'),
      );
      await page
        .locator('#months')
        .getByRole('link', { name: /Exclude Housing/ })
        .click();
      await page.waitForTimeout(450);
      expect(
        await page.evaluate(() => sessionStorage.getItem('sf-e2e-document-loads')),
        'the Exclude Housing toggle: a full document load',
      ).toBe(loadsBeforeToggle);
      await expect(page).toHaveURL(/noHousing=1/);
      await page
        .locator('#months')
        .getByRole('link', { name: /Close line items/ })
        .click();
      await expect(page.locator('#months-lines')).toHaveCount(0);

      await noOverflow(page, `${width}px: an open line-items panel`);
    }
  });

  test('the chips narrow the personal chart, and the URL carries the choice', async ({ page }) => {
    await page.setViewportSize({ width: 1400, height: 950 });
    await page.goto('/charts');
    // The nav publishes this once hydrated; a chip click that lands before
    // then can be swallowed between the press and its navigation, as the
    // issue #39 spec below already guards against.
    const hydrated = () =>
      page.waitForFunction(() =>
        Boolean(document.documentElement.style.getPropertyValue('--sf-anchor-offset')),
      );
    await hydrated();
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
    await hydrated();
    await expect(headline).not.toContainText('Alex');

    // Turning Alex back on restores everybody.
    await chips.getByRole('link', { name: 'Alex' }).click();
    await expect(headline).toContainText('Alex');
    await expect(headline).toContainText('Sam');
  });

  test('Chart C person filters keep the current scroll position (issue #39)', async ({ page }) => {
    // The chips are real URL links, but changing a series is an in-place
    // choice, not a request to jump to the start of the card (or the page).
    for (const width of [390, 1400]) {
      await page.setViewportSize({ width, height: 950 });
      await page.goto('/charts');
      const card = page.locator('#personal');
      const chips = card.getByRole('group', { name: 'Whose spending to show' });
      await expect(chips.getByRole('link', { name: 'Alex' })).toBeVisible();
      // The nav publishes this once hydrated; before then a link click can
      // fall back to a full navigation, which cannot preserve scroll.
      await page.waitForFunction(() =>
        Boolean(document.documentElement.style.getPropertyValue('--sf-anchor-offset')),
      );
      await card.evaluate((element) => {
        window.scrollTo(0, element.getBoundingClientRect().top + window.scrollY - 160);
      });
      const before = await page.evaluate(() => window.scrollY);
      expect(before).toBeGreaterThan(100);

      await chips.getByRole('link', { name: 'Alex' }).click();
      await expect(page).toHaveURL(/who=/);
      await expect(chips.getByRole('link', { name: 'Alex' })).not.toHaveAttribute(
        'aria-current',
        'true',
      );
      // Allow the hash scroll helper's delayed checks to settle too. They
      // must not undo this choice or steal the viewport after the click.
      await page.waitForTimeout(450);
      expect(Math.abs((await page.evaluate(() => window.scrollY)) - before)).toBeLessThan(8);

      await chips.getByRole('link', { name: 'Alex' }).click();
      await expect(page).not.toHaveURL(/who=/);
      await expect(chips.getByRole('link', { name: 'Alex' })).toHaveAttribute(
        'aria-current',
        'true',
      );
      await page.waitForTimeout(450);
      expect(Math.abs((await page.evaluate(() => window.scrollY)) - before)).toBeLessThan(8);
    }
  });

  test('Spending trends presets can be created, renamed and deleted; switching preserves scroll and drill-downs', async ({
    page,
  }) => {
    test.slow();
    await page.setViewportSize({ width: 1400, height: 950 });
    await page.goto('/settings#commitment-categories');
    const section = page.locator('#commitment-categories');
    await expect(section.locator('[data-presets-ready="true"]')).toBeAttached();
    await section.getByLabel('Create/Edit preset').selectOption('');
    await section.getByLabel('Preset name').fill('Test bills');
    await section.getByRole('button', { name: /^Utilities/ }).click();
    await section.getByRole('checkbox', { name: 'Select all Utilities', exact: true }).check();
    await expect(section.getByRole('checkbox', { name: /^Energy/ })).toBeChecked();
    await section.getByRole('button', { name: 'Clear selection', exact: true }).click();
    await section.getByRole('checkbox', { name: /^Energy/ }).check();
    await section.getByRole('checkbox', { name: /^Broadband/ }).check();
    await expect(
      section.getByRole('checkbox', { name: 'Select all Utilities', exact: true }),
    ).toHaveJSProperty('indeterminate', true);
    await section.getByRole('button', { name: 'Save preset', exact: true }).click();
    await expect(section.getByRole('status')).toHaveText('Category preset saved.');
    const billsId = await section.getByLabel('Create/Edit preset').inputValue();
    expect(billsId).not.toBe('');
    await section.getByLabel('Preset name').fill('Test essential bills');
    await section.getByRole('button', { name: 'Save preset', exact: true }).click();
    await expect(section.getByLabel('Create/Edit preset').locator('option:checked')).toHaveText(
      'Test essential bills',
    );
    await section.getByLabel('Create/Edit preset').selectOption('');
    await section.getByLabel('Preset name').fill('Test all spending');
    await section.getByRole('button', { name: 'Select all categories', exact: true }).click();
    await section.getByRole('button', { name: 'Save preset', exact: true }).click();
    await expect(section.getByLabel('Create/Edit preset').locator('option:checked')).toHaveText(
      'Test all spending',
    );
    const allId = await section.getByLabel('Create/Edit preset').inputValue();

    for (const width of [390, 1400]) {
      await page.setViewportSize({ width, height: 950 });
      await page.goto('/settings');
      await page.goto(`/charts?preset=${billsId}&noHousing=1#commitments`);
      const card = page.locator('#commitments');
      const selector = card.getByLabel('Category preset');
      await expect(selector).toBeEnabled();
      await expect(card).toContainText('D · Spending trends');
      await expect(card.getByRole('link', { name: /Schedule-converted/ })).toHaveCount(0);
      await expect(card).not.toContainText('Tracked categories');
      const drawing = figure(page, 'commitments', width < 1024 ? 'phone' : 'laptop');
      const links = await barLinks(drawing);
      expect(links.length).toBeGreaterThan(0);
      expect(
        new URL(links[0]!, 'http://example.test').searchParams.getAll('categoryId'),
      ).toHaveLength(2);
      expect(links[0]).not.toContain('scheduleOnly');
      const bills = await trackedTotal(drawing);
      await selector.scrollIntoViewIfNeeded();
      // Let the cold-load anchor settle, then measure the user's chosen position.
      await page.waitForTimeout(1200);
      const before = await page.evaluate(() => window.scrollY);
      await selector.selectOption(allId);
      await expect(page).toHaveURL(new RegExp(`preset=${allId}`));
      await expect(selector).toBeEnabled();
      await page.waitForTimeout(500);
      expect(Math.abs((await page.evaluate(() => window.scrollY)) - before)).toBeLessThanOrEqual(8);
      expect(new URL(page.url()).searchParams.get('noHousing')).toBe('1');
      expect(await trackedTotal(drawing)).toBeGreaterThanOrEqual(bills);
      await selector.scrollIntoViewIfNeeded();
      const backBefore = await page.evaluate(() => window.scrollY);
      await selector.selectOption(billsId);
      await expect(selector).toBeEnabled();
      await expect(page).toHaveURL(new RegExp(`preset=${billsId}`));
      await page.waitForTimeout(500);
      expect(
        Math.abs((await page.evaluate(() => window.scrollY)) - backBefore),
      ).toBeLessThanOrEqual(8);
      await page.goBack();
      await expect(selector).toHaveValue(allId);
      await noOverflow(page, `preset dropdown at ${width}`);
    }

    await page.goto('/settings#commitment-categories');
    await expect(section.locator('[data-presets-ready="true"]')).toBeAttached();
    await section.getByLabel('Create/Edit preset').selectOption(billsId);
    await expect(section.getByLabel('Preset name')).toHaveValue('Test essential bills');
    await section.getByRole('button', { name: 'Delete preset', exact: true }).click();
    await section.getByRole('button', { name: 'Confirm delete', exact: true }).click();
    await expect(section.getByRole('status')).toHaveText('Preset deleted.');
    await expect(
      section.getByLabel('Create/Edit preset').locator(`option[value="${billsId}"]`),
    ).toHaveCount(0);
    await page.goto(`/charts?preset=${billsId}#commitments`);
    await expect(page.getByLabel('Category preset')).toHaveValue('fixed-commitments');
    await page.goto('/settings#commitment-categories');
    await expect(section.locator('[data-presets-ready="true"]')).toBeAttached();
    await section.getByLabel('Create/Edit preset').selectOption(allId);
    await section.getByRole('button', { name: 'Delete preset', exact: true }).click();
    await section.getByRole('button', { name: 'Confirm delete', exact: true }).click();
    await expect(section.getByRole('status')).toHaveText('Preset deleted.');
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

  test('the spending mix is where the money went: scopes expand in place, quick windows wait for Show, and info opens on i (issues #24, #61)', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1400, height: 950 });
    await page.goto('/settings');
    const paydayDay = Number(
      await page
        .locator('form[aria-label="Household payday"]')
        .getByLabel('Payday day of month')
        .inputValue(),
    );
    expect(paydayDay).toBe(27);
    await page.goto('/charts#mix');
    const card = page.locator('#mix');
    await expect(card.getByRole('heading', { name: 'Where the money went' })).toBeVisible();
    await expect(page.getByText('Where the money goes')).toHaveCount(0);

    // Removed selector headings/blurb text are gone.
    await expect(card.getByText('Choose what to count')).toHaveCount(0);
    await expect(card.getByText('Time window')).toHaveCount(0);

    // The long Reported caption is hidden behind the "i" summary icon by default.
    const laptopMix = figure(page, 'mix', 'laptop');
    const captionText = laptopMix.getByText(/Net spending by parent category/);
    await expect(captionText).toBeHidden();
    await laptopMix.locator('figcaption summary[aria-label="Chart information"]').click();
    await expect(captionText).toBeVisible();
    await expect(laptopMix.locator('figcaption')).toContainText('Reported');

    // The scopes panel lives inside Chart E and starts collapsed.
    const controls = card.locator('#mix-controls');
    const scopesButton = card.getByRole('button', { name: 'Change chart scopes' });
    await expect(scopesButton).toHaveAttribute('aria-expanded', 'false');
    await expect(controls).toBeHidden();

    await scopesButton.click();
    await expect(scopesButton).toHaveAttribute('aria-expanded', 'true');
    await expect(controls).toBeVisible();

    const from = controls.getByLabel('From', { exact: true });
    const to = controls.getByLabel('To', { exact: true });
    const showButton = controls.getByRole('button', { name: 'Show', exact: true });
    // Both pickers stop at today: the chart counts money already spent.
    const today = await to.getAttribute('max');
    expect(today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    await expect(from).toHaveAttribute('max', today as string);
    const mostRecentPayday = previousPaydayOccurrences(paydayDay, today as string, 1)[0];
    expect(mostRecentPayday).not.toBeUndefined();
    await expect(from).toHaveValue(mostRecentPayday as string);

    const quick = controls.getByRole('group', { name: 'Quick windows' });
    const sinceLastPayday = quick.getByRole('button', { name: /Since last payday$/ });
    const lastFullCycle = quick.getByRole('button', { name: /Last full payday cycle$/ });
    const monthToDate = quick.getByRole('button', { name: /Month to date$/ });
    await expect(sinceLastPayday).toBeVisible();
    await expect(lastFullCycle).toBeVisible();
    await expect(monthToDate).toBeVisible();
    await expect(quick.getByRole('button')).toHaveCount(3);

    // The default window is since last payday, ending today.
    await expect(sinceLastPayday).toHaveAttribute('aria-current', 'true');
    await expect(to).toHaveValue(today as string);

    // Clicking a quick-window pill updates the From/To pickers in place without
    // refreshing the chart or discarding category changes; the chart only
    // updates when the user explicitly presses Show, and the scopes panel stays
    // open after Show.
    const firstParentCheckbox = controls
      .locator('fieldset ul > li > div input[type="checkbox"]')
      .first();
    await expect(firstParentCheckbox).toBeChecked();
    await firstParentCheckbox.uncheck();
    await expect(firstParentCheckbox).not.toBeChecked();

    for (const button of [monthToDate, lastFullCycle, sinceLastPayday]) {
      await from.fill('2020-01-01');
      await to.fill('2020-01-02');
      await button.click();
      await expect(button).toHaveAttribute('aria-current', 'true');
      const windowFrom = await from.inputValue();
      const windowTo = await to.inputValue();
      expect(windowFrom).not.toBe('2020-01-01');
      expect(windowTo <= (today as string), `ends ${windowTo}`).toBe(true);
      // Category change is still intact before pressing Show.
      await expect(firstParentCheckbox).not.toBeChecked();

      await showButton.click();
      await expect(page).toHaveURL(new RegExp(`from=${windowFrom}&to=${windowTo}.*catset=1`));
      // Panel remains open after pressing Show.
      await expect(controls).toBeVisible();
      await expect(scopesButton).toHaveAttribute('aria-expanded', 'true');
      await expect(from).toHaveValue(windowFrom);
      await expect(to).toHaveValue(windowTo);
      await expect(firstParentCheckbox).not.toBeChecked();
    }

    // Navigating to another page and returning starts with the scopes panel collapsed again.
    await page.getByRole('link', { name: 'Insights', exact: true }).first().click();
    await expect(page).toHaveURL(/\/insights$/);
    await page.getByRole('link', { name: 'Charts', exact: true }).first().click();
    await expect(page).toHaveURL(/\/charts$/);
    await expect(card.locator('#mix-controls')).toBeHidden();

    // An end date after today typed into the URL is brought back to today.
    await page.goto(`/charts?from=${(today as string).slice(0, 7)}-01&to=2999-12-31#mix`);
    await card.getByRole('button', { name: 'Change chart scopes' }).click();
    await expect(to).toHaveValue(today as string);
    await expect(card.getByText(/window stops at today/)).toBeVisible();
  });

  test('chart D syncs a month into the spending mix, and back again (issue #81)', async ({
    page,
  }) => {
    // A full document load runs this again; a soft navigation does not (issue
    // #87 — the table twin must update Chart E in place, like the bars).
    await page.addInitScript(() => {
      const key = 'sf-e2e-document-loads';
      sessionStorage.setItem(key, String(Number(sessionStorage.getItem(key) ?? '0') + 1));
    });
    await page.setViewportSize({ width: 1400, height: 950 });
    await page.goto('/charts#commitments');
    const card = page.locator('#commitments');
    const chip = card.getByRole('link', { name: /Sync to Spending mix/ });
    const drawing = figure(page, 'commitments', 'laptop');

    // Off by default, and the bars are purchases drill-downs.
    await expect(chip).toHaveAttribute('aria-pressed', 'false');
    const drilldowns = await barLinks(drawing);
    expect(drilldowns.length).toBeGreaterThan(0);
    for (const href of drilldowns) {
      expect(new URL(href, 'http://example.test').pathname).toBe('/purchases');
    }
    // The table twin mirrors the bars — the keyboard path does what the
    // drawing does, synced or not.
    expect(await tableLinks(drawing)).toEqual(drilldowns);

    // Engaging is inert: the URL gains the toggle, Chart E keeps its payday
    // default, and the chip says it is on in more ways than colour.
    await chip.click();
    await expect(page).toHaveURL(/mixsync=1/);
    await expect(page).not.toHaveURL(/from=/);
    await expect(chip).toHaveAttribute('aria-pressed', 'true');
    await expect(chip).toContainText('✓ Sync to Spending mix');

    // The bars now hand Chart E the whole month plus the preset's categories.
    const synced = await barLinks(drawing);
    expect(synced.length).toBe(drilldowns.length);
    expect(await tableLinks(drawing)).toEqual(synced);
    const last = new URL(synced[synced.length - 1]!, 'http://example.test');
    expect(last.pathname).toBe('/charts');
    expect(last.hash).toBe('#mix');
    expect(last.searchParams.get('mixsync')).toBe('1');
    expect(last.searchParams.get('mixvia')).toBe('1');
    expect(last.searchParams.get('catset')).toBe('1');
    expect(last.searchParams.getAll('cat').length).toBeGreaterThan(0);
    expect(last.searchParams.get('preset')).toMatch(/\S/);
    // The month being lived ends today, which is Chart E's own "Month to date".
    const to = last.searchParams.get('to') as string;
    expect(last.searchParams.get('from')).toBe(`${to.slice(0, 7)}-01`);
    // A completed month runs from its first day to its last.
    const complete = new URL(synced[synced.length - 2]!, 'http://example.test');
    const completeTo = complete.searchParams.get('to') as string;
    expect(complete.searchParams.get('from')).toBe(`${completeTo.slice(0, 7)}-01`);
    const dayAfter = new Date(`${completeTo}T00:00:00Z`);
    dayAfter.setUTCDate(dayAfter.getUTCDate() + 1);
    expect(dayAfter.getUTCDate()).toBe(1);

    // Tap a completed month (the table twin is the same link): the page
    // stays on /charts and lands on Chart E, signposted.
    if (!(await drawing.locator('table').first().isVisible())) {
      await drawing.getByText(/^Show the numbers/).click();
    }
    const tableLink = drawing.locator('table a[href]').nth(synced.length - 2);
    await tableLink.scrollIntoViewIfNeeded();
    await page.waitForTimeout(100);
    const loadsBefore = await page.evaluate(() => sessionStorage.getItem('sf-e2e-document-loads'));
    const scrollBefore = await page.evaluate(() => window.scrollY);
    await tableLink.click();
    await expect(page).toHaveURL(/#mix$/);
    const mix = page.locator('#mix');
    await expect(mix.getByText(/set from Spending trends/)).toBeVisible();
    await expect(mix.getByText(/^Showing \w+ \d{4} with /)).toBeVisible();
    // Issue #87: the keyboard path keeps the document and the reader's place.
    await page.waitForTimeout(450);
    expect(
      await page.evaluate(() => sessionStorage.getItem('sf-e2e-document-loads')),
      'a full document load',
    ).toBe(loadsBefore);
    expect(Math.abs((await page.evaluate(() => window.scrollY)) - scrollBefore)).toBeLessThan(8);
    // E's pickers show the month the bar stood for.
    await mix.getByRole('button', { name: 'Change chart scopes' }).click();
    await expect(mix.getByLabel('From', { exact: true })).toHaveValue(
      complete.searchParams.get('from') as string,
    );
    await expect(mix.getByLabel('To', { exact: true })).toHaveValue(completeTo);

    // Re-submitting exactly what the sync set keeps the signpost (decision
    // 241: Show takes control only when something changes) — and since #81,
    // E's own controls keep Chart D's preset instead of dropping it.
    const preset = last.searchParams.get('preset') as string;
    await mix.getByRole('button', { name: 'Show', exact: true }).click();
    await expect(page).toHaveURL(/mixvia=1/);
    expect(new URL(page.url()).searchParams.get('preset')).toBe(preset);
    await expect(mix.getByText(/set from Spending trends/)).toBeVisible();

    // Return to since last payday: the full reset, and the chip disengages.
    await mix.getByRole('link', { name: 'Return to since last payday' }).click();
    await expect(page).not.toHaveURL(/from=|catset=|mixvia=|mixsync=/);
    await expect(chip).toHaveAttribute('aria-pressed', 'false');
    await expect(mix.getByText(/set from Spending trends/)).toHaveCount(0);
    // Chart E is back on its payday default window.
    const scopesButton = mix.getByRole('button', { name: 'Change chart scopes' });
    if ((await scopesButton.getAttribute('aria-expanded')) !== 'true') {
      await scopesButton.click();
    }
    const quick = mix.getByRole('group', { name: 'Quick windows' });
    await expect(quick.getByRole('button', { name: /Since last payday$/ })).toHaveAttribute(
      'aria-current',
      'true',
    );
    // The purchases drill-down is back on Chart D.
    const after = await barLinks(drawing);
    expect(after.length).toBe(drilldowns.length);
    expect(new URL(after[0]!, 'http://example.test').pathname).toBe('/purchases');
  });

  test('a synced month updates the mix in place, without a page load or a scroll jump (issue #87)', async ({
    page,
  }) => {
    test.slow();
    // A soft navigation keeps `window`; a full document load runs this script
    // again. Session storage survives either, so the count only rises when the
    // page really reloaded.
    await page.addInitScript(() => {
      const key = 'sf-e2e-document-loads';
      sessionStorage.setItem(key, String(Number(sessionStorage.getItem(key) ?? '0') + 1));
    });

    for (const width of [390, 1400]) {
      await page.setViewportSize({ width, height: 950 });
      await page.goto('/charts?mixsync=1#commitments');
      const drawing = figure(page, 'commitments', width < 1024 ? 'phone' : 'laptop');
      await expect(drawing).toBeVisible();
      // The bar links are inert anchors until the router has hydrated; a
      // click before then falls back to a full document load (decision #39).
      await page.waitForFunction(() =>
        Boolean(document.documentElement.style.getPropertyValue('--sf-anchor-offset')),
      );
      // Let the cold-load #commitments landing settle before measuring.
      await page.waitForTimeout(500);

      // The SVG <a> itself has no client rect of its own in Chromium, and a
      // month with no spending is a zero-height bar — pick the first drawn
      // <rect>, which is the pointer target that carries the click up to it.
      const rects = drawing.locator('svg a[href] rect');
      const drawn = await rects.evaluateAll((nodes) =>
        nodes.findIndex((node) => node.getBoundingClientRect().height > 4),
      );
      expect(drawn, 'a drawn month bar').toBeGreaterThanOrEqual(0);
      const bar = rects.nth(drawn);
      await bar.scrollIntoViewIfNeeded();
      await page.waitForTimeout(100);
      const before = await page.evaluate(() => window.scrollY);
      const loadsBefore = await page.evaluate(() =>
        sessionStorage.getItem('sf-e2e-document-loads'),
      );
      expect(before).toBeGreaterThan(100);

      await bar.click();
      await expect(page).toHaveURL(/mixvia=1/);
      await expect(page.getByText(/set from Spending trends/)).toBeVisible();
      await page.waitForTimeout(450);

      // The same document, still where the reader was standing: no reload to
      // paint the top of the page, and no fragment scroll after the redraw.
      expect(
        await page.evaluate(() => sessionStorage.getItem('sf-e2e-document-loads')),
        'a full document load',
      ).toBe(loadsBefore);
      expect(Math.abs((await page.evaluate(() => window.scrollY)) - before)).toBeLessThan(8);
    }
  });

  test('spending pace compares two qualifying months day by day (issue #89)', async ({ page }) => {
    test.slow();
    await page.setViewportSize({ width: 1400, height: 950 });
    await page.goto('/charts#pace');
    const pace = page.locator('#pace');
    await expect(
      pace.getByRole('heading', { name: 'How spending builds through two months' }),
    ).toBeVisible();

    const current = londonMonth(0);
    const previous = londonMonth(-1);
    const twoBack = londonMonth(-2);

    // Defaults: the month being lived against the latest completed month.
    const compareSelect = pace.getByLabel('Compare month');
    const withSelect = pace.getByLabel('With month');
    await expect(compareSelect).toHaveValue(current.key);
    await expect(withSelect).toHaveValue(previous.key);
    // Months from before recording began are not offered at all.
    await expect(compareSelect.locator('option[value="2020-01"]')).toHaveCount(0);

    const laptop = figure(page, 'pace', 'laptop');
    await expect(laptop.locator('[data-chart-headline]')).toContainText(
      new RegExp(`By day \\d+, ${current.label} has spent £`),
    );
    await expect(laptop.locator('svg[role="img"]')).toHaveAttribute(
      'aria-label',
      new RegExp(`${previous.label}`),
    );

    // The table twin carries every drawn day; a day's spend opens that
    // day's purchases. The #pace landing leaves this summary at the very
    // bottom edge of the viewport, where a click can be lost between the
    // press and the release while the hash-scroll helper settles — so wait
    // for hydration and centre it first, as the chip specs above do.
    await page.waitForFunction(() =>
      Boolean(document.documentElement.style.getPropertyValue('--sf-anchor-offset')),
    );
    const numbers = laptop.getByText(/^Show the numbers/);
    await numbers.evaluate((element) => element.scrollIntoView({ block: 'center' }));
    await numbers.click();
    const table = laptop.locator('table[data-chart-table="pace"]');
    await expect(table).toBeVisible();
    await expect(table.locator('tbody tr').first().locator('td').first()).toHaveText('1');
    const firstDayLink = table.locator('tbody tr').first().locator('a[href]').first();
    await expect(firstDayLink).toHaveAttribute(
      'href',
      new RegExp(`/purchases\\?from=${current.key}-01&to=${current.key}-01`),
    );

    // Choosing another comparison month redraws against it, in the URL.
    await withSelect.selectOption(twoBack.key);
    await pace.getByRole('button', { name: 'Show' }).click();
    await page.waitForURL(new RegExp(`cmpB=${twoBack.key}`));
    await expect(page.locator('#pace [data-chart-headline]').first()).toContainText(twoBack.label);

    // The category scope is this chart's own: choosing a saved preset
    // sets cmpPreset and leaves Chart D's `preset` parameter alone.
    const paceAfter = page.locator('#pace');
    const categories = paceAfter.getByLabel('Categories to count');
    const presetOption = categories.locator('option').nth(1);
    const presetValue = await presetOption.getAttribute('value');
    const presetLabel = (await presetOption.innerText()).trim();
    expect(presetValue).not.toBeNull();
    await categories.selectOption(presetValue ?? '');
    await paceAfter.getByRole('button', { name: 'Show' }).click();
    await page.waitForURL(/cmpPreset=/);
    const url = new URL(page.url());
    expect(url.searchParams.get('cmpPreset')).toBe(presetValue);
    expect(url.searchParams.get('preset')).toBeNull();
    await expect(page.locator('#pace')).toContainText(`${presetLabel}: recorded net spending`);

    // A part-recorded month asked for by URL is refused in plain words,
    // and naming the same month twice draws nothing.
    await page.goto('/charts?cmpB=2020-01#pace');
    await expect(page.locator('#pace')).toContainText(
      'January 2020 cannot be used here — recording did not cover it from the 1st',
    );
    await page.goto(`/charts?cmpA=${previous.key}&cmpB=${previous.key}#pace`);
    await expect(page.locator('#pace')).toContainText(
      `Both month selectors are set to ${previous.label}.`,
    );
    await noOverflow(page, '1400px: spending pace states');
  });

  test('Charts is reachable from the navigation and from the home page', async ({ page }) => {
    await page.setViewportSize({ width: 1400, height: 950 });
    await page.goto('/');
    await page.getByRole('link', { name: 'Charts', exact: true }).first().click();
    await expect(page).toHaveURL(/\/charts$/);
    await expect(page.getByRole('heading', { name: 'The money, drawn' })).toBeVisible();
  });
});
