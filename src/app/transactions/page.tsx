import Link from 'next/link';
import { redirect } from 'next/navigation';
import {
  ACTIVITY_TABLE_ID,
  OpenTransferProvider,
  TransferActivityRow,
  type PinnedTransferView,
} from '@/components/transfer-activity-row';
import { householdContextFromRequest } from '@/lib/auth/next';
import { formatPence } from '@/lib/money';
import {
  defaultActivityPot,
  listPotActivity,
  transferActivityOrder,
  transferActivityRow,
  type ActivityRow,
} from '@/lib/records/activity';
import { ensureScheduleState } from '@/lib/records/money-view';
import { latestCheckpointPerPot, listPots, listPotsIncludingArchived } from '@/lib/records/pots';
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
import { isValidLocalDate, toLocalDateString } from '@/lib/time';

export const dynamic = 'force-dynamic';

interface SearchParams {
  potId?: string;
  from?: string;
  to?: string;
  /** The transfer open in place beneath its row (decision 225). */
  transfer?: string | string[];
}

/**
 * All Transactions (SPEC §15.3, plan decisions 101–108): a one-pot activity
 * view. A pure projection of existing records, with every row linking to the
 * canonical page that owns its add/edit/void behaviour — with one exception
 * (decision 225, GitHub issue #55): a transfer between the household's own
 * pots opens **in place**, its correction and void forms in a panel directly
 * beneath its row, because the pots page's separate transfer list only
 * repeated what this table already shows. Without a valid potId in the URL,
 * the household's saved default is used before the existing fallback.
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
  const latest = latestCheckpointPerPot(db).get(pot.id) ?? null;
  const checkpointDate = latest === null ? null : toLocalDateString(latest.effectiveAt);
  const requestedFrom = params.from ?? '';
  const requestedTo = params.to ?? '';
  const rawTo = isValidLocalDate(requestedTo) && requestedTo <= today ? requestedTo : today;
  const rawFrom = isValidLocalDate(requestedFrom) ? requestedFrom : defaultFrom;
  const rangeIsBroken = rawFrom > rawTo;
  const dateFrom = rangeIsBroken ? defaultFrom : rawFrom;
  const dateTo = rangeIsBroken ? today : rawTo;

  const activity = listPotActivity(db, { potId: pot.id, dateFrom, dateTo });
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
    pinnedEntry = {
      kind: 'pinned-transfer',
      row: transferActivityRow(openTransfer, pot.id, potLabels, activityWindow),
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
  const displayEntries = withPinnedTransfer(activity.entries, pinnedEntry);

  const monthStart = `${today.slice(0, 7)}-01`;
  const quickPicks = [
    { label: 'Last 30 days', from: defaultFrom, to: today },
    {
      label: 'Since last checkpoint',
      from: checkpointDate ?? defaultFrom,
      to: today,
    },
    { label: 'This month', from: monthStart > today ? today : monthStart, to: today },
  ];

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
          except a transfer between your own pots, which opens right here: select its pot name to
          correct it or void it beneath its row. Green is money into this pot, red is money out. The
          far-right balance is the running balance after each movement, anchored on checkpoints —
          green in credit, red overdrawn.
        </p>
      </header>

      <form
        method="GET"
        aria-label="Activity filters"
        className="rounded-xl border border-border bg-surface p-4 shadow-sm"
      >
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[1.2fr_1fr_1fr_auto] lg:items-end">
          <div className="flex min-w-0 flex-col gap-1">
            <label htmlFor="activity-pot" className="text-xs font-medium text-ink-soft">
              Target
            </label>
            <select
              id="activity-pot"
              name="potId"
              defaultValue={String(pot.id)}
              className="w-full min-w-0 rounded border border-border-strong bg-surface px-2.5 py-1.5 text-sm focus:border-border-emphasis focus:outline-none"
            >
              {pots.map((candidate) => (
                <option key={candidate.id} value={candidate.id}>
                  {candidate.label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex min-w-0 flex-col gap-1">
            <label htmlFor="activity-from" className="text-xs font-medium text-ink-soft">
              Start date
            </label>
            <input
              id="activity-from"
              name="from"
              type="date"
              defaultValue={dateFrom}
              max={today}
              className="w-full min-w-0 rounded border border-border-strong bg-surface px-2.5 py-1.5 text-sm focus:border-border-emphasis focus:outline-none"
            />
          </div>
          <div className="flex min-w-0 flex-col gap-1">
            <label htmlFor="activity-to" className="text-xs font-medium text-ink-soft">
              End date
            </label>
            <input
              id="activity-to"
              name="to"
              type="date"
              defaultValue={dateTo}
              max={today}
              className="w-full min-w-0 rounded border border-border-strong bg-surface px-2.5 py-1.5 text-sm focus:border-border-emphasis focus:outline-none"
            />
          </div>
          <button
            type="submit"
            className="rounded-lg bg-till px-4 py-2 text-sm font-semibold text-till-ink hover:bg-till-hover"
          >
            Show activity
          </button>
        </div>
        <p className="mt-3 flex flex-wrap items-center gap-2 text-xs text-ink-soft">
          <span className="font-medium">Quick picks:</span>
          {quickPicks.map((pick) => (
            <Link
              key={pick.label}
              href={`/transactions?potId=${pot.id}&from=${pick.from}&to=${pick.to}`}
              className={`rounded-full border px-2.5 py-1 ${
                pick.from === dateFrom && pick.to === dateTo
                  ? 'border-till bg-till text-till-ink'
                  : 'border-border-strong bg-surface text-ink-body hover:border-border-emphasis'
              }`}
            >
              {pick.label}
            </Link>
          ))}
          {checkpointDate === null ? (
            <span className="text-ink-muted">
              (this pot has never been reported, so &ldquo;since last checkpoint&rdquo; falls back
              to 30 days)
            </span>
          ) : null}
        </p>
      </form>

      {rangeIsBroken ? (
        <p className="mt-3 rounded-lg border border-warning-300 bg-warning-50 px-3 py-2 text-sm text-warning-900">
          That start date was after the end date, so the last 30 days are shown instead.
        </p>
      ) : null}

      <section aria-labelledby="activity-heading" className="mt-6">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-3">
          <h2 id="activity-heading" className="text-xl font-semibold">
            {dateFrom} to {dateTo}
          </h2>
          <span className="text-xs text-ink-muted">
            {activity.totals.rowCount} {activity.totals.rowCount === 1 ? 'movement' : 'movements'}
            {activity.totals.expectedRowCount > 0
              ? ` · ${activity.totals.expectedRowCount} expected support ${
                  activity.totals.expectedRowCount === 1 ? 'row' : 'rows'
                }`
              : ''}
            {activity.totals.hiddenRowCount > 0
              ? ` · showing the newest ${activity.totals.rowCount}, ${activity.totals.hiddenRowCount} older ones hidden — narrow the range`
              : ''}
          </span>
        </div>

        {activity.totals.rowCount === 0 &&
        activity.totals.expectedRowCount === 0 &&
        activity.entries.every((entry) => entry.kind !== 'checkpoint') &&
        // Voiding the window's only movement must not take its open panel away.
        pinnedEntry === null ? (
          <p className="rounded-xl border border-dashed border-border-strong bg-surface p-6 text-sm text-ink-soft">
            Nothing touched {pot.label} in this window.
          </p>
        ) : (
          <OpenTransferProvider>
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
          </OpenTransferProvider>
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
