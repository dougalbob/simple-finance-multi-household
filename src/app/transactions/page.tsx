import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ACTIVITY_TABLE_ID, ActivityOpenRowProvider } from '@/components/activity-open-row';
import { ActivityFilters } from '@/components/activity-filters';
import { PurchaseActivityRow, type PinnedPurchaseView } from '@/components/purchase-activity-row';
import { TransferActivityRow, type PinnedTransferView } from '@/components/transfer-activity-row';
import { householdContextFromRequest } from '@/lib/auth/next';
import { formatPence } from '@/lib/money';
import {
  defaultActivityPot,
  listPotActivity,
  purchaseActivityOrder,
  purchaseActivityRow,
  transferActivityOrder,
  transferActivityRow,
  type ActivityRow,
} from '@/lib/records/activity';
import { DATE_RANGE_ALL_FROM } from '@/lib/records/date-range-presets';
import {
  ACTIVITY_SEARCH_MAX_LENGTH,
  activityRowMatchesSearch,
} from '@/lib/records/activity-search';
import { leafCategoryOptions } from '@/lib/records/entry-view';
import { energyRowDetails, getEnergyRowContext } from '@/lib/records/energy';
import { ensureScheduleState } from '@/lib/records/money-view';
import { listPeople } from '@/lib/records/people';
import { listPots, listPotsIncludingArchived } from '@/lib/records/pots';
import { findPurchaseWithLines } from '@/lib/records/purchases';
import {
  parseOpenPurchaseId,
  pinnedPurchaseLinks,
  pinnedPurchaseReason,
  withPinnedPurchase,
  type PinnedPurchaseEntry,
} from '@/lib/records/purchase-activity';
import { getDefaultTransactionsPotId } from '@/lib/records/settings';
import { addDaysLocal } from '@/lib/records/dates';
import {
  parseOpenTransferId,
  pinnedTransferLinks,
  pinnedTransferReason,
  withPinnedTransfer,
  type PinnedTransferEntry,
} from '@/lib/records/transfer-activity';
import { findTransfer } from '@/lib/records/transfers';
import { listVehicles } from '@/lib/records/vehicles';
import { isValidLocalDate, toLocalDateString } from '@/lib/time';

export const dynamic = 'force-dynamic';

interface SearchParams {
  potId?: string;
  from?: string;
  to?: string;
  /** The Supplier / Notes search (GitHub issue #98), as typed. */
  q?: string;
  /** The transfer open in place beneath its row (decision 225). */
  transfer?: string | string[];
  /** The purchase open in place beneath its row (decision 226). */
  purchase?: string | string[];
  /** A document id to land on, from the Documents search (v1.41.0). */
  attachment?: string;
}

/**
 * All Transactions (SPEC §15.3, plan decisions 101–108): a one-pot activity
 * view. A pure projection of existing records, with every row linking to the
 * canonical page that owns its add/edit/void behaviour — with two exceptions
 * that open **in place**, their correction and void forms in a panel directly
 * beneath the row: a transfer between the household's own pots (decision 225,
 * GitHub issue #55), because the pots page's separate transfer list only
 * repeated what this table already shows; and a purchase (decision 226, GitHub
 * issue #57) — one recorded by hand (`PUR`) or converted from a schedule
 * (`DD` / `SO`) — because the record a household most often needs to put right
 * is the one they can see in front of them. A refund keeps its link to
 * Purchases, beside the original it was refunded against. Without a valid
 * potId in the URL, the household's saved default is used before the existing
 * fallback.
 *
 * Running balance (v0.33.0): far-right column shows balance after each
 * movement, anchored on checkpoints. Green = credit, red = debit. Drift is
 * resolved by checkpoints: balances before a checkpoint stay as computed,
 * after checkpoint use the most recent checkpoint.
 */
export default async function TransactionsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const user = await householdContextFromRequest();
  if (user === null) redirect('/unauthorized');

  const db = user.db;
  const now = new Date();
  ensureScheduleState(db, now);

  const params = await searchParams;
  // The Documents search links a receipt back to its in-place purchase panel
  // with `?attachment=<id>`; the panel scrolls to and rings that document.
  const focusAttachmentId = (() => {
    const raw = params.attachment;
    if (raw === undefined || raw === '') return null;
    const n = Number(raw);
    return Number.isInteger(n) && n > 0 ? n : null;
  })();
  const today = toLocalDateString(now);
  const pots = listPots(db);
  const defaultPotId = getDefaultTransactionsPotId(db);
  const pot =
    pots.find((candidate) => candidate.id === Number(params.potId)) ??
    defaultActivityPot(pots, defaultPotId);

  if (pot === null) {
    return (
      <main className="mx-auto max-w-7xl px-4 py-6 sm:py-8">
        <h1 className="text-3xl font-semibold tracking-tight">All Transactions</h1>
        <p className="mt-3 rounded-xl border border-dashed border-border-strong bg-surface p-6 text-sm text-ink-soft">
          No pots yet. Add an account or cash pot on{' '}
          <Link href="/pots" className="sf-link">
            Accounts, Pots &amp; Checkpoints
          </Link>{' '}
          first.
        </p>
      </main>
    );
  }

  const defaultFrom = addDaysLocal(today, -29);
  const requestedFrom = params.from ?? '';
  const requestedTo = params.to ?? '';
  const rawTo = isValidLocalDate(requestedTo) && requestedTo <= today ? requestedTo : today;
  const rawFrom = isValidLocalDate(requestedFrom) ? requestedFrom : defaultFrom;
  const rangeIsBroken = rawFrom > rawTo;
  const dateFrom = rangeIsBroken ? defaultFrom : rawFrom;
  const dateTo = rangeIsBroken ? today : rawTo;
  // The search matches the Supplier / transfer / loan column and Notes
  // together (GitHub issue #98). A blank box is not a filter.
  const search = (params.q ?? '').trim().slice(0, ACTIVITY_SEARCH_MAX_LENGTH);

  const activity = listPotActivity(db, { potId: pot.id, dateFrom, dateTo, search });
  /** The same two-column rule the projection applies, for a row built after it ran. */
  const matchesSearch = (row: ActivityRow) =>
    search === '' || activityRowMatchesSearch(row, search);
  const net = activity.totals.inPence - activity.totals.outPence;
  // Alternating rows (issue #23, the Purchases treatment of decision 205).
  // Only movements count towards the stripe: a checkpoint is already its own
  // tinted divider, so the movements either side of it keep alternating.
  const stripeIndex = new Map<string, number>();
  for (const entry of activity.entries) {
    if (entry.kind !== 'checkpoint') stripeIndex.set(entry.row.key, stripeIndex.size);
  }

  // The transfer open in place (decision 225). Usually it is one of the rows
  // above and its panel simply opens beneath it. After a save it may not be:
  // a void always takes it out of the list, and a correction can (other
  // pots, or a date outside the window). It is then pinned at its date —
  // outside the totals, the stripe and the balance — saying why, until the
  // household closes it. An id that names no transfer is ignored.
  const activityWindow = { dateFrom, dateTo };
  const potOptions = pots.map((candidate) => ({ id: candidate.id, label: candidate.label }));
  const openTransferId = parseOpenTransferId(params.transfer);
  const openTransfer = openTransferId === null ? null : findTransfer(db, openTransferId);
  const pinReason =
    openTransfer === null
      ? null
      : pinnedTransferReason(openTransfer, {
          potId: pot.id,
          ...activityWindow,
          entries: activity.entries,
        });
  let pinnedEntry: PinnedTransferEntry | null = null;
  let pinnedView: PinnedTransferView | null = null;
  if (openTransfer !== null && pinReason !== null) {
    const potLabels = new Map(
      listPotsIncludingArchived(db).map((candidate) => [candidate.id, candidate.label]),
    );
    const pinnedRow = transferActivityRow(openTransfer, pot.id, potLabels, activityWindow);
    // A search filters the open record like any other row (issue #98): if the
    // household has typed something this record does not match, it is simply
    // not on the list — no pin claiming it fell past a row cap it never
    // reached. A record that does match still pins, so voiding it while a
    // search is active keeps its panel in place.
    if (matchesSearch(pinnedRow)) {
      pinnedEntry = {
        kind: 'pinned-transfer',
        row: pinnedRow,
        order: transferActivityOrder(openTransfer),
        reason: pinReason,
      };
      pinnedView = {
        reason: pinReason,
        links: pinnedTransferLinks(openTransfer, pinReason, {
          potId: pot.id,
          livePots: potOptions,
          today,
        }),
      };
    }
  }
  // The purchase open in place (decision 226) works the same way: usually one
  // of the rows above, and after a void or a re-date outside the window it is
  // pinned at the position it held while live. The two parameters are
  // alternatives (the provider clears the other), so at most one is used.
  const openPurchaseId = parseOpenPurchaseId(params.purchase);
  const openPurchase = openPurchaseId === null ? null : findPurchaseWithLines(db, openPurchaseId);
  const purchasePinReason =
    openPurchase === null
      ? null
      : pinnedPurchaseReason(openPurchase.purchase, {
          ...activityWindow,
          entries: activity.entries,
        });
  // The correction and void forms are the Purchases page's own, so the options
  // they offer are the Purchases page's own — declared categories, people and
  // vehicles (SPEC §12, §15.2).
  const purchaseEditor = {
    categories: leafCategoryOptions(db),
    people: listPeople(db).map(({ id, label }) => ({ id, label })),
    vehicles: listVehicles(db).map(({ id, label }) => ({ id, label })),
  };
  // Energy details for the open purchase, if it is an energy one (issue 118):
  // the panel carries the same block the Purchases row does, beside the
  // attachment block it already had.
  const openPurchaseEnergy =
    openPurchase === null
      ? null
      : energyRowDetails(getEnergyRowContext(db), openPurchase.purchase, openPurchase.allocations);
  let pinnedPurchase: PinnedPurchaseEntry | null = null;
  let pinnedPurchaseView: PinnedPurchaseView | null = null;
  if (openPurchase !== null && purchasePinReason !== null) {
    const pinnedRow = purchaseActivityRow(db, openPurchase.purchase, pot.id, activityWindow);
    if (matchesSearch(pinnedRow)) {
      pinnedPurchase = {
        kind: 'pinned-purchase',
        row: pinnedRow,
        order: purchaseActivityOrder(openPurchase.purchase),
        reason: purchasePinReason,
      };
      pinnedPurchaseView = {
        reason: purchasePinReason,
        links: pinnedPurchaseLinks(openPurchase.purchase, purchasePinReason, {
          potId: pot.id,
          livePots: potOptions,
          today,
        }),
      };
    }
  }
  // One record is open at a time, so one pin at most is ever placed.
  const displayEntries: Array<
    (typeof activity.entries)[number] | PinnedTransferEntry | PinnedPurchaseEntry
  > =
    pinnedEntry !== null
      ? withPinnedTransfer(activity.entries, pinnedEntry)
      : withPinnedPurchase(activity.entries, pinnedPurchase);

  return (
    <main className="mx-auto max-w-7xl px-4 py-6 sm:py-8">
      <header className="mb-6">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">
          All Transactions
        </p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">Activity in one pot</h1>
        <p className="mt-1 text-sm text-ink-soft">
          Everything that touched <span className="font-medium">{pot.label}</span> between two
          dates, newest first. Each row opens its record in the page that can edit or void it —
          except a purchase and a transfer between your own pots, which open right here: select the
          supplier or the other pot&apos;s name to correct it or void it beneath its row, without
          leaving the list. A refund stays a link to Purchases, beside the record it was refunded
          against. The search box narrows the list to the supplier / transfer / loan column and
          Notes together, as you type. Green is money into this pot, red is money out. The far-right
          balance is the running balance after each movement, anchored on checkpoints — green in
          credit, red overdrawn.
        </p>
      </header>

      <ActivityFilters
        pots={pots.map((candidate) => ({ id: candidate.id, label: candidate.label }))}
        potId={pot.id}
        today={today}
        dateFrom={dateFrom}
        dateTo={dateTo}
        query={search}
      />

      {rangeIsBroken ? (
        <p className="mt-3 rounded-lg border border-warning-300 bg-warning-50 px-3 py-2 text-sm text-warning-900">
          That start date was after the end date, so the last 30 days are shown instead.
        </p>
      ) : null}

      <section aria-labelledby="activity-heading" className="mt-6">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-3">
          <h2 id="activity-heading" className="text-xl font-semibold">
            {dateFrom === DATE_RANGE_ALL_FROM
              ? `All time to ${dateTo}`
              : `${dateFrom} to ${dateTo}`}
          </h2>
          <span className="text-xs text-ink-muted">
            {activity.totals.rowCount} {activity.totals.rowCount === 1 ? 'movement' : 'movements'}
            {search !== '' ? ` matching “${search}”` : ''}
            {activity.totals.expectedRowCount > 0
              ? ` · ${activity.totals.expectedRowCount} expected support ${
                  activity.totals.expectedRowCount === 1 ? 'row' : 'rows'
                }`
              : ''}
            {activity.totals.hiddenRowCount > 0
              ? ` · showing the newest ${activity.totals.rowCount}, ${activity.totals.hiddenRowCount} older ones hidden — narrow the range or the search`
              : ''}
          </span>
        </div>

        {activity.totals.rowCount === 0 &&
        activity.totals.expectedRowCount === 0 &&
        activity.entries.every((entry) => entry.kind !== 'checkpoint') &&
        // Voiding the window's only movement must not take its open panel away.
        pinnedEntry === null &&
        pinnedPurchase === null ? (
          <div className="rounded-xl border border-dashed border-border-strong bg-surface p-6 text-sm text-ink-soft">
            {search === '' ? (
              <p>Nothing touched {pot.label} in this window.</p>
            ) : (
              <p>
                Nothing in this window matches <span className="font-medium">“{search}”</span> in
                the supplier / transfer / loan column or the notes.{' '}
                <Link
                  href={`/transactions?potId=${pot.id}&from=${dateFrom}&to=${dateTo}`}
                  className="sf-link"
                >
                  Clear the search
                </Link>
                .
              </p>
            )}
          </div>
        ) : (
          <ActivityOpenRowProvider>
            <div
              id={ACTIVITY_TABLE_ID}
              tabIndex={-1}
              className="overflow-x-auto rounded-xl border border-border bg-surface shadow-sm focus:outline-none"
            >
              <table className="w-full min-w-[900px] text-sm">
                <thead className="bg-surface-muted text-left text-xs uppercase tracking-wide text-ink-muted">
                  <tr>
                    <th scope="col" className="px-3 py-2">
                      Date
                    </th>
                    <th scope="col" className="px-3 py-2">
                      Type
                    </th>
                    <th scope="col" className="px-3 py-2">
                      Supplier / transfer / loan
                    </th>
                    <th scope="col" className="px-3 py-2">
                      Category
                    </th>
                    <th scope="col" className="px-3 py-2 text-right">
                      Amount
                    </th>
                    <th scope="col" className="px-3 py-2">
                      Notes
                    </th>
                    <th scope="col" className="px-3 py-2 text-right">
                      Balance
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {displayEntries.map((entry) =>
                    entry.kind === 'pinned-transfer' ? (
                      <TransferActivityRow
                        key={entry.row.key}
                        row={entry.row}
                        potId={pot.id}
                        potLabel={pot.label}
                        dates={activityWindow}
                        pots={potOptions}
                        today={today}
                        striped={false}
                        pinned={pinnedView}
                      />
                    ) : entry.kind === 'checkpoint' ? (
                      <tr
                        key={entry.checkpoint.key}
                        className="border-y-2 border-border-strong bg-canvas text-ink-soft"
                      >
                        <td className="whitespace-nowrap px-3 py-2 tabular-nums">
                          {entry.checkpoint.date}
                        </td>
                        <td className="px-3 py-2" colSpan={3}>
                          <span className="font-medium text-ink-body">
                            Checkpoint · reported {formatPence(entry.checkpoint.amountPence)}
                          </span>
                          {entry.checkpoint.note !== '' ? (
                            <span className="ml-2 text-xs text-ink-muted">
                              {entry.checkpoint.note}
                            </span>
                          ) : null}
                        </td>
                        <td className="px-3 py-2 text-right text-xs text-ink-muted">reported</td>
                        <td className="px-3 py-2 text-xs text-ink-muted">not a movement</td>
                        <td
                          className={`whitespace-nowrap px-3 py-2 text-right font-semibold tabular-nums ${
                            entry.checkpoint.amountPence < 0 ? 'text-danger' : 'text-positive'
                          }`}
                        >
                          {formatPence(entry.checkpoint.amountPence)}
                        </td>
                      </tr>
                    ) : entry.kind === 'pinned-purchase' ? (
                      <PurchaseActivityRow
                        key={entry.row.key}
                        row={entry.row}
                        potLabel={pot.label}
                        dates={activityWindow}
                        today={today}
                        categories={purchaseEditor.categories}
                        people={purchaseEditor.people}
                        vehicles={purchaseEditor.vehicles}
                        energy={openPurchaseEnergy}
                        striped={false}
                        focusAttachmentId={focusAttachmentId}
                        pinned={pinnedPurchaseView}
                      />
                    ) : entry.row.family === 'transfer' ? (
                      <TransferActivityRow
                        key={entry.row.key}
                        row={entry.row}
                        potId={pot.id}
                        potLabel={pot.label}
                        dates={activityWindow}
                        pots={potOptions}
                        today={today}
                        striped={(stripeIndex.get(entry.row.key) ?? 0) % 2 === 1}
                        pinned={null}
                      />
                    ) : entry.row.purchase !== null ? (
                      <PurchaseActivityRow
                        key={entry.row.key}
                        row={entry.row}
                        potLabel={pot.label}
                        dates={activityWindow}
                        today={today}
                        categories={purchaseEditor.categories}
                        people={purchaseEditor.people}
                        vehicles={purchaseEditor.vehicles}
                        energy={openPurchaseEnergy}
                        striped={(stripeIndex.get(entry.row.key) ?? 0) % 2 === 1}
                        focusAttachmentId={focusAttachmentId}
                        pinned={null}
                      />
                    ) : (
                      <ActivityTableRow
                        key={entry.row.key}
                        row={entry.row}
                        rowIndex={stripeIndex.get(entry.row.key) ?? 0}
                      />
                    ),
                  )}
                </tbody>
                <tfoot className="border-t-2 border-border-strong bg-canvas text-sm">
                  <tr>
                    <td className="px-3 py-2 font-medium text-ink-body" colSpan={4}>
                      Movements shown
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      <span className="text-positive">+{formatPence(activity.totals.inPence)}</span>
                      <span className="mx-1 text-ink-faint">/</span>
                      <span className="text-danger">−{formatPence(activity.totals.outPence)}</span>
                    </td>
                    <td className="px-3 py-2 text-right font-semibold tabular-nums">
                      net {net < 0 ? '−' : '+'}
                      {formatPence(Math.abs(net))}
                    </td>
                    <td className="px-3 py-2 text-right text-xs text-ink-muted">—</td>
                  </tr>
                  {activity.totals.expectedRowCount > 0 ? (
                    <tr className="border-t border-border text-ink-muted">
                      <td className="px-3 py-2 font-medium" colSpan={4}>
                        Expected support ({activity.totals.expectedRowCount}{' '}
                        {activity.totals.expectedRowCount === 1 ? 'expectation' : 'expectations'},
                        not counted)
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        ≈{formatPence(activity.totals.expectedInPence)}
                      </td>
                      <td className="px-3 py-2 text-right text-xs">not a movement</td>
                      <td className="px-3 py-2 text-right text-xs">—</td>
                    </tr>
                  ) : null}
                </tfoot>
              </table>
            </div>
          </ActivityOpenRowProvider>
        )}

        <p className="mt-3 text-xs text-ink-muted">
          &ldquo;Movements shown&rdquo; is the sum of the recorded rows above — expected support
          rows are expectations, never movements, so they are listed but not counted, and they give
          way when the borrowing is recorded. The balance column shows the pot&apos;s running
          balance after each movement, anchored on the most recent checkpoint: any drift before a
          checkpoint stays as it was, and after the checkpoint the new balances use that
          checkpoint&apos;s reported figure. A credit written down before the checkpoint on that
          same day is already inside the reported figure (SPEC §7.1). A credit written down after
          the checkpoint is added. Green is in credit, red is overdrawn.
        </p>
      </section>
    </main>
  );
}

function ActivityTableRow({ row, rowIndex }: { row: ActivityRow; rowIndex: number }) {
  const incoming = row.direction === 'in';
  const balance = row.runningBalancePence;
  const balanceInCredit = balance !== null && balance >= 0;
  return (
    <tr
      className={`border-t border-border-hairline align-top ${rowIndex % 2 === 1 ? 'bg-canvas' : ''}`}
    >
      <td className="whitespace-nowrap px-3 py-2.5 tabular-nums text-ink-body">{row.date}</td>
      <td className="whitespace-nowrap px-3 py-2.5">
        <span className="rounded-full bg-surface-muted px-2 py-0.5 text-xs font-semibold tracking-wide text-ink-body">
          {row.code}
        </span>
        {row.secondaryLink !== null ? (
          <Link href={row.secondaryLink.href} className="ml-2 text-xs sf-link">
            {row.secondaryLink.label}
          </Link>
        ) : null}
        {row.badge !== null ? (
          <span className="mt-1 block text-xs text-ink-muted">{row.badge}</span>
        ) : null}
      </td>
      <td className="px-3 py-2.5">
        <Link href={row.link.href} className="sf-link">
          {row.source}
          <span className="sr-only"> — {row.link.label}</span>
        </Link>
      </td>
      <td className="px-3 py-2.5 text-ink-soft">
        {row.category === '' ? <span className="text-ink-faint">—</span> : row.category}
        {row.extraLines > 0 ? (
          <span className="ml-1 text-xs text-ink-muted">+{row.extraLines} more</span>
        ) : null}
      </td>
      <td
        className={`whitespace-nowrap px-3 py-2.5 text-right font-semibold tabular-nums ${
          incoming ? 'text-positive' : 'text-danger'
        }`}
      >
        {incoming ? '+' : '−'}
        {formatPence(row.amountPence)}
      </td>
      <td className="px-3 py-2.5 text-ink-soft">
        {row.note === '' ? <span className="text-ink-faint">—</span> : row.note}
      </td>
      <td
        className={`whitespace-nowrap px-3 py-2.5 text-right font-semibold tabular-nums ${
          balance === null ? 'text-ink-faint' : balanceInCredit ? 'text-positive' : 'text-danger'
        }`}
      >
        {balance === null ? <span className="text-ink-faint">—</span> : formatPence(balance)}
      </td>
    </tr>
  );
}
