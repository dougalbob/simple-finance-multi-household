import { redirect } from 'next/navigation';
import {
  ArchivePotForm,
  ExternalMovementEditForm,
  OtherMovementForm,
  SwapForm,
  VoidSwapPairForm,
} from '@/components/external-forms';
import { BorrowingMovedRedirect } from '@/components/borrowing-moved-redirect';
import { AddCheckpointForm, CreatePotForm } from '@/components/pot-forms';
import { VoidForm } from '@/components/record-forms';
import { PotEditForm } from '@/components/settings-forms';
import { householdContextFromRequest } from '@/lib/auth/next';
import type { Db } from '@/lib/db/client';
import { formatPence } from '@/lib/money';
import { debtsSummary } from '@/lib/records/debts';
import {
  describeExternalMovement,
  getExternalMovement,
  ExternalMovementNotFoundError,
  listExchanges,
  listExternalMovements,
  type ExternalMovement,
} from '@/lib/records/external-movements';
import { defaultActivityPot } from '@/lib/records/activity';
import { getMoneySnapshot } from '@/lib/records/money-view';
import { listPeople } from '@/lib/records/people';
import {
  checkpointsForPot,
  creditCardOwedPence,
  listPots,
  potEstimateLabel,
} from '@/lib/records/pots';
import { getDefaultTransactionsPotId } from '@/lib/records/settings';
import {
  parseOpenTransferId,
  transferActivityHref,
  transferViewPotId,
} from '@/lib/records/transfer-activity';
import { findTransfer } from '@/lib/records/transfers';
import { formatInstantLocal, formatRelativeAge, toLocalDateString } from '@/lib/time';

export const dynamic = 'force-dynamic';

/**
 * Accounts, pots & checkpoints (SPEC §15.2): every pot with its reported
 * figure, estimate, overdraft context, edit form and checkpoint history.
 * Checkpoints are immutable — correcting the balance records a new
 * checkpoint; the old one stays (blueprint §4). The checkpoint and add-pot
 * cards come first (decision 178): recording a figure is this page's most
 * frequent job, ahead of reviewing the pots the figures belong to. Cash pot
 * cards show no overdraft or warning threshold — those datapoints describe
 * a bank facility or a credit line, not counted notes.
 *
 * Also home to the household boundary (SPEC §10.2) that is **not**
 * borrowing: swap pairs and other money in & out, with their edit and void
 * controls. Informal debts — Owed & owing, borrowing, repayments and their
 * ledger — moved to their own **Borrowing** page (GitHub issue #60, decision
 * 228); a signpost card carries the running owed figures and a link. An old
 * `/pots?external={id}` deep link to a loan movement redirects there.
 *
 * Internal pot-to-pot transfers no longer have a list here (decision 225,
 * GitHub issue #55): they are recorded in Quick Entry → Move, and corrected
 * or voided in place on All Transactions, beneath their own row. An old
 * `/pots?transfer={id}` link redirects there, opening that transfer.
 */
export default async function PotsPage({
  searchParams,
}: {
  searchParams: Promise<{ external?: string; transfer?: string }>;
}) {
  const user = await householdContextFromRequest();
  if (user === null) redirect('/unauthorized');

  const db = user.db;
  const now = new Date();
  const today = toLocalDateString(now);
  const params = await searchParams;
  const pots = listPots(db);
  // A bookmarked transfer link from before decision 225: the transfer now
  // opens in place on All Transactions — on the pot the household usually
  // reviews there when the transfer touches it, else on the pot the money
  // left — over a window that contains its date. An id that names no
  // transfer is ignored.
  const linkedTransferId = parseOpenTransferId(params.transfer);
  const linkedTransfer = linkedTransferId === null ? null : findTransfer(db, linkedTransferId);
  if (linkedTransfer !== null) {
    const usualPot = defaultActivityPot(pots, getDefaultTransactionsPotId(db));
    redirect(
      transferActivityHref(
        linkedTransfer,
        transferViewPotId(linkedTransfer, usualPot?.id ?? null),
        today,
      ),
    );
  }
  const people = listPeople(db);
  const peopleById = new Map(people.map((person) => [person.id, person.label]));
  const money = getMoneySnapshot(db, now);
  const owed = debtsSummary(db);
  // Swaps and other money stay here (issue #60); borrowing history lives on
  // the Borrowing page. A deep link from All Transactions (SPEC §15.3) must
  // land on the record it names, even after it has fallen out of the recent
  // twenty — unless it names a loan, which redirects to Borrowing.
  const recentExternal = listExternalMovements(db, { includeVoided: true, limit: 20 }).filter(
    (movement) => movement.kind !== 'loan',
  );
  const linkedExternalId = Number(params.external);
  const linkedExternal =
    Number.isInteger(linkedExternalId) &&
    linkedExternalId > 0 &&
    recentExternal.every((movement) => movement.id !== linkedExternalId)
      ? findExternalMovement(db, linkedExternalId)
      : null;
  if (linkedExternal !== null && linkedExternal.kind === 'loan') {
    redirect(`/borrowing?external=${linkedExternal.id}#external-${linkedExternal.id}`);
  }
  const externalRows =
    linkedExternal === null ? recentExternal : [linkedExternal, ...recentExternal];
  // Swaps grouped as pairs (SPEC §10.2) for the management list: the
  // household records a swap and then looks for it next to the pot cards —
  // this is where that list lives, with edit and void-both-legs.
  const exchanges = listExchanges(db, { includeVoided: true, limit: 20 });
  const potNames = new Map(pots.map((pot) => [pot.id, pot.label]));
  const swapsInvolving = (potId: number) =>
    exchanges.filter(
      (exchange) => exchange.inLeg?.potId === potId || exchange.outLeg?.potId === potId,
    ).length;

  return (
    <main className="mx-auto max-w-7xl px-4 py-6 sm:py-8">
      <header className="mb-6">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">
          Accounts, pots &amp; checkpoints
        </p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">Where the money sits</h1>
        <p className="mt-1 max-w-3xl text-sm text-ink-soft">
          Reported figures, not a bank sync. A pot with no checkpoint has no estimate, by design —
          the app never guesses balances.
        </p>
      </header>

      {/* Decision 178: record first, review second. The checkpoint card and
          the add-pot card lead the page in that order; the pot cards follow. */}
      <div className="grid gap-6 lg:grid-cols-2">
        <section
          aria-labelledby="add-checkpoint-heading"
          className="rounded-xl border border-border bg-surface p-4 shadow-sm"
        >
          <h2 id="add-checkpoint-heading" className="mb-3 text-lg font-semibold">
            Record a balance checkpoint
          </h2>
          <AddCheckpointForm
            pots={pots.map((pot) => ({ id: pot.id, label: pot.label, kind: pot.kind }))}
          />
          <p className="mt-2 text-xs text-ink-muted">
            A checkpoint is an immutable correction — it never deletes what happened before.
          </p>
        </section>
        <section
          aria-labelledby="add-pot-heading"
          className="rounded-xl border border-border bg-surface p-4 shadow-sm"
        >
          <h2 id="add-pot-heading" className="mb-3 text-lg font-semibold">
            Add a pot
          </h2>
          <CreatePotForm people={people.map(({ id, label }) => ({ id, label }))} />
        </section>
      </div>

      {pots.length === 0 ? (
        <p className="mt-6 rounded-xl border border-dashed border-border-strong bg-surface p-6 text-sm text-ink-soft">
          No pots yet. Add the household&apos;s pots above — a typical setup has two bank accounts
          and a cash pot each.
        </p>
      ) : (
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          {pots.map((pot) => {
            const view = money.pots.find((entry) => entry.pot.id === pot.id);
            const latest = view?.latestCheckpoint ?? null;
            const estimate = view?.estimatePence ?? null;
            const history = checkpointsForPot(db, pot.id, 10);
            return (
              <section
                key={pot.id}
                aria-labelledby={`pot-${pot.id}-heading`}
                className="rounded-xl border border-border bg-surface p-4 shadow-sm"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <h2 id={`pot-${pot.id}-heading`} className="text-lg font-semibold">
                      {pot.label}
                    </h2>
                    <p className="text-xs text-ink-muted">
                      {pot.kind === 'bank'
                        ? 'Bank account'
                        : pot.kind === 'cash'
                          ? 'Cash pot'
                          : 'Credit card'}
                      {pot.ownerPersonId !== null && peopleById.get(pot.ownerPersonId) !== undefined
                        ? ` · ${peopleById.get(pot.ownerPersonId)}`
                        : ''}
                    </p>
                  </div>
                  {estimate !== null ? (
                    <span
                      className={`rounded-full px-3 py-1 text-sm font-semibold tabular-nums ${
                        pot.kind === 'credit-card'
                          ? 'bg-warning-50 text-warning-900'
                          : 'bg-positive-50 text-positive-800'
                      }`}
                    >
                      {pot.kind === 'credit-card' ? '' : '≈ '}
                      {potEstimateLabel(pot.kind, estimate)}
                    </span>
                  ) : (
                    <span className="rounded-full bg-surface-muted px-3 py-1 text-sm text-ink-muted">
                      no estimate
                    </span>
                  )}
                </div>

                {pot.kind === 'credit-card' ? (
                  <div className="mt-2 rounded-lg bg-canvas px-3 py-2 text-sm">
                    {estimate === null ? (
                      <p className="text-ink-muted">
                        Credit-limit use is unavailable until a checkpoint is recorded.
                      </p>
                    ) : (
                      <p className="font-medium tabular-nums">
                        {pot.overdraftLimitPence === null
                          ? `Owed ${formatPence(creditCardOwedPence(estimate))}`
                          : `${formatPence(creditCardOwedPence(estimate))} of ${formatPence(pot.overdraftLimitPence)} credit limit used`}
                      </p>
                    )}
                    {estimate !== null &&
                    pot.overdraftLimitPence !== null &&
                    creditCardOwedPence(estimate) > pot.overdraftLimitPence ? (
                      <p className="mt-1 text-danger">
                        Over the configured credit limit by{' '}
                        {formatPence(creditCardOwedPence(estimate) - pot.overdraftLimitPence)}.
                      </p>
                    ) : estimate !== null &&
                      pot.warningThresholdPence !== null &&
                      creditCardOwedPence(estimate) >= pot.warningThresholdPence ? (
                      <p className="mt-1 text-warning-900">Near the configured credit limit.</p>
                    ) : null}
                  </div>
                ) : null}

                {latest !== null ? (
                  <p className="mt-2 text-sm text-ink-soft">
                    Last reported{' '}
                    <span className="font-semibold tabular-nums text-ink">
                      {potEstimateLabel(pot.kind, latest.amountPence)}
                    </span>{' '}
                    {formatRelativeAge(latest.effectiveAt)} (
                    {formatInstantLocal(latest.effectiveAt)})
                  </p>
                ) : (
                  <p className="mt-2 text-sm text-ink-muted">
                    No checkpoint yet — record what this pot holds below.
                  </p>
                )}

                {swapsInvolving(pot.id) > 0 ? (
                  <a href="#swaps" className="mt-2 inline-block text-xs sf-link-arrow">
                    Recent swaps involving {pot.label} ↓
                  </a>
                ) : null}

                {/* Decision 178: overdraft and warning threshold describe a
                    bank facility or a credit line. A cash pot's card leaves
                    them out entirely instead of showing two meaningless
                    dashes, and the domain layer keeps them null. */}
                {pot.kind !== 'cash' ? (
                  <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
                    <div className="rounded-lg bg-canvas px-3 py-2">
                      <dt className="text-xs text-ink-muted">
                        {pot.kind === 'credit-card' ? 'Credit limit' : 'Overdraft limit'}
                      </dt>
                      <dd className="font-medium tabular-nums">
                        {pot.overdraftLimitPence === null
                          ? '—'
                          : formatPence(pot.overdraftLimitPence)}
                      </dd>
                    </div>
                    <div className="rounded-lg bg-canvas px-3 py-2">
                      <dt className="text-xs text-ink-muted">
                        {pot.kind === 'credit-card' ? 'Near-limit warning at' : 'Warning threshold'}
                      </dt>
                      <dd className="font-medium tabular-nums">
                        {pot.warningThresholdPence === null
                          ? '—'
                          : formatPence(pot.warningThresholdPence)}
                      </dd>
                    </div>
                  </dl>
                ) : null}

                {pot.kind === 'credit-card' ? (
                  <div className="mt-3 rounded-lg border border-border-hairline p-3 text-sm text-ink-soft">
                    <p>
                      Card purchases are spending against this pot. Pay the provider from your bank
                      pot using Move → transfer; repayment is not spending.
                    </p>
                    <p className="mt-1">
                      {pot.creditCardPaymentDayOfMonth === null
                        ? 'Set the usual payment due day in Edit pot to enable monthly reminders.'
                        : `Usual payment due day: ${pot.creditCardPaymentDayOfMonth}; reminder ${pot.creditCardWarningDays} days before.`}
                    </p>
                    {pot.creditCardStatementDueDate !== null &&
                    pot.creditCardStatementMinimumPence !== null ? (
                      <p className="mt-1 font-medium text-ink">
                        Current statement: minimum{' '}
                        {formatPence(pot.creditCardStatementMinimumPence)} due{' '}
                        {pot.creditCardStatementDueDate} (copied from the provider, not calculated
                        here).
                      </p>
                    ) : null}
                    {pot.creditCardPromotionalEndDate !== null ? (
                      <p className="mt-1">0% offer end date: {pot.creditCardPromotionalEndDate}.</p>
                    ) : null}
                  </div>
                ) : null}

                <details className="mt-3">
                  <summary className="cursor-pointer text-sm font-medium text-ink-body">
                    Edit pot
                  </summary>
                  <div className="mt-2">
                    <PotEditForm
                      potId={pot.id}
                      version={pot.version}
                      label={pot.label}
                      kind={pot.kind}
                      ownerPersonId={pot.ownerPersonId}
                      people={people.map(({ id, label }) => ({ id, label }))}
                      overdraftLimitPence={pot.overdraftLimitPence}
                      warningThresholdPence={pot.warningThresholdPence}
                      creditCardPaymentDayOfMonth={pot.creditCardPaymentDayOfMonth}
                      creditCardWarningDays={pot.creditCardWarningDays}
                      creditCardPromotionalEndDate={pot.creditCardPromotionalEndDate}
                      creditCardStatementDueDate={pot.creditCardStatementDueDate}
                      creditCardStatementMinimumPence={pot.creditCardStatementMinimumPence}
                    />
                  </div>
                  <div className="mt-3 border-t border-border-hairline pt-3">
                    <ArchivePotForm potId={pot.id} version={pot.version} label={pot.label} />
                  </div>
                </details>

                <details className="mt-3">
                  <summary className="cursor-pointer text-sm font-medium text-ink-body">
                    Checkpoint history ({history.length})
                  </summary>
                  {history.length === 0 ? (
                    <p className="mt-2 text-sm text-ink-muted">Nothing recorded yet.</p>
                  ) : (
                    <ul className="mt-2 divide-y divide-border-hairline">
                      {history.map((checkpoint) => (
                        <li
                          key={checkpoint.id}
                          className="flex items-baseline justify-between gap-2 py-1.5 text-sm"
                        >
                          <span>
                            {formatInstantLocal(checkpoint.effectiveAt)}
                            <span className="ml-2 text-xs text-ink-muted">
                              {checkpoint.enteredBy}
                              {checkpoint.note !== null && checkpoint.note !== ''
                                ? ` — ${checkpoint.note}`
                                : ''}
                            </span>
                          </span>
                          <span className="tabular-nums">
                            {formatPence(checkpoint.amountPence)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </details>
              </section>
            );
          })}
        </div>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        {/* Issue #60: informal borrowing moved to its own page. The signpost
            keeps this page's overview role — the running owed figures — and
            old `#debt-{id}` bookmarks are forwarded there (client-side: a
            fragment never reaches the server). */}
        <BorrowingMovedRedirect />
        <section
          aria-labelledby="borrowing-signpost-heading"
          className="rounded-xl border border-border bg-surface p-4 shadow-sm"
        >
          <h2 id="borrowing-signpost-heading" className="text-lg font-semibold">
            Owed &amp; owing
          </h2>
          <p className="mb-3 mt-1 text-sm text-ink-soft">
            Informal debts — money borrowed or lent outside the household — now live on their own
            page, with the setup flow, the repay panel and the full ledger.
          </p>
          <p className="text-sm">
            <span className="font-semibold tabular-nums">
              we owe {formatPence(owed.owedByHouseholdPence)}
            </span>
            <span className="mx-2 text-ink-muted">·</span>
            <span className="font-semibold tabular-nums">
              owed to us {formatPence(owed.owedToHouseholdPence)}
            </span>
            <span className="ml-2 text-xs text-ink-muted">
              ({owed.debtCount} arrangement{owed.debtCount === 1 ? '' : 's'})
            </span>
          </p>
          <p className="mt-3">
            <a href="/borrowing" className="sf-link-arrow">
              Open Borrowing
            </a>
          </p>
        </section>

        <section
          id="swaps"
          aria-labelledby="swap-heading"
          className="rounded-xl border border-border bg-surface p-4 shadow-sm"
        >
          <h2 id="swap-heading" className="text-lg font-semibold">
            Swap with someone outside
          </h2>
          <p className="mb-3 mt-1 text-sm text-ink-soft">
            Cash in one hand, a bank transfer in the other — recorded as one net-zero pair. Recorded
            after a checkpoint, both legs move the estimates. Recorded before one on the same day,
            the money in is already in that count and the money out still counts until the next
            checkpoint (SPEC §7.1).
          </p>
          <SwapForm
            idPrefix="pots-swap"
            pots={pots.map((pot) => ({ id: pot.id, label: pot.label }))}
            today={today}
          />

          <h3 className="mb-2 mt-4 text-sm font-semibold">Recent swaps</h3>
          {exchanges.length === 0 ? (
            <p className="text-sm text-ink-muted">Nothing recorded yet.</p>
          ) : (
            <ul className="space-y-2">
              {exchanges.map((exchange) => {
                const { inLeg, outLeg } = exchange;
                const inLive = inLeg?.voidedAt === null;
                const outLive = outLeg?.voidedAt === null;
                const bothLive = inLive && outLive;
                const bothVoided = !inLive && !outLive;
                const inAmount = inLeg?.amountPence ?? 0;
                const outAmount = outLeg?.amountPence ?? 0;
                // Net across the LIVE legs: a balanced live pair reads
                // £0.00; a pair with an orphaned leg reads the difference,
                // honestly, instead of pretending.
                const net = (inLive ? inAmount : 0) - (outLive ? outAmount : 0);
                const counterparty = inLeg?.counterparty ?? outLeg?.counterparty ?? '—';
                const date = inLeg?.occurredDate ?? outLeg?.occurredDate ?? '—';
                const note = inLeg?.note ?? outLeg?.note ?? null;
                const inPot = inLeg ? (potNames.get(inLeg.potId) ?? '—') : null;
                const outPot = outLeg ? (potNames.get(outLeg.potId) ?? '—') : null;
                return (
                  <li
                    key={exchange.exchangeKey}
                    className="rounded-lg border border-border bg-canvas p-3"
                  >
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <p className="text-sm font-medium text-ink">
                        {formatPence(inAmount || outAmount)} with {counterparty}
                        <span className="ml-2 text-xs font-normal text-ink-muted">
                          {date}
                          {note !== null && note !== '' ? ` — ${note}` : ''}
                        </span>
                      </p>
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                          bothVoided
                            ? 'bg-surface-muted text-ink-muted'
                            : net === 0
                              ? 'bg-positive-50 text-positive-800'
                              : 'bg-warning-50 text-warning'
                        }`}
                      >
                        {bothVoided
                          ? 'voided'
                          : net === 0
                            ? 'net £0.00'
                            : `legs differ · net ${net > 0 ? '+' : '−'}${formatPence(
                                Math.abs(net),
                              )}`}
                      </span>
                    </div>
                    <div className="mt-2 grid gap-1 text-sm sm:grid-cols-2">
                      <p className={inLive ? undefined : 'text-ink-faint line-through'}>
                        In{' '}
                        <span className="tabular-nums font-medium text-positive">
                          +{formatPence(inAmount)}
                        </span>{' '}
                        → {inPot ?? '—'}
                      </p>
                      <p className={outLive ? undefined : 'text-ink-faint line-through'}>
                        Out{' '}
                        <span className="tabular-nums font-medium text-danger">
                          −{formatPence(outAmount)}
                        </span>{' '}
                        ← {outPot ?? '—'}
                      </p>
                    </div>
                    {bothVoided ? (
                      <p className="mt-1 text-xs text-ink-faint">
                        Voided{inLeg?.voidReason ? ` — ${inLeg.voidReason}` : ''}
                      </p>
                    ) : (
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        {bothLive && inLeg && outLeg ? (
                          <VoidSwapPairForm
                            idPrefix={`swap-void-${exchange.exchangeKey.slice(0, 8)}`}
                            exchangeKey={exchange.exchangeKey}
                            inLeg={{ id: inLeg.id, version: inLeg.version }}
                            outLeg={{ id: outLeg.id, version: outLeg.version }}
                            summary={`${formatPence(inAmount)} with ${counterparty}`}
                          />
                        ) : null}
                        <details className="text-xs">
                          <summary className="cursor-pointer font-medium text-ink-soft">
                            Correct or void one leg
                          </summary>
                          <div className="mt-2 flex flex-col gap-2">
                            {inLeg && inLive ? (
                              <details className="rounded border border-border bg-surface p-2">
                                <summary className="cursor-pointer font-medium text-ink-body">
                                  In-leg — to {inPot}
                                </summary>
                                <div className="mt-2">
                                  <ExternalMovementEditForm
                                    idPrefix={`swap-edit-in-${inLeg.id}`}
                                    movement={inLeg}
                                    pots={pots.map((pot) => ({ id: pot.id, label: pot.label }))}
                                    today={today}
                                  />
                                </div>
                                <div className="mt-2 border-t border-border-hairline pt-2">
                                  <VoidForm
                                    kind="external"
                                    recordId={inLeg.id}
                                    expectedVersion={inLeg.version}
                                    summary={describeExternalMovement(inLeg)}
                                  />
                                </div>
                              </details>
                            ) : null}
                            {outLeg && outLive ? (
                              <details className="rounded border border-border bg-surface p-2">
                                <summary className="cursor-pointer font-medium text-ink-body">
                                  Out-leg — from {outPot}
                                </summary>
                                <div className="mt-2">
                                  <ExternalMovementEditForm
                                    idPrefix={`swap-edit-out-${outLeg.id}`}
                                    movement={outLeg}
                                    pots={pots.map((pot) => ({ id: pot.id, label: pot.label }))}
                                    today={today}
                                  />
                                </div>
                                <div className="mt-2 border-t border-border-hairline pt-2">
                                  <VoidForm
                                    kind="external"
                                    recordId={outLeg.id}
                                    expectedVersion={outLeg.version}
                                    summary={describeExternalMovement(outLeg)}
                                  />
                                </div>
                              </details>
                            ) : null}
                          </div>
                        </details>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section
          aria-labelledby="other-money-heading"
          className="rounded-xl border border-border bg-surface p-4 shadow-sm"
        >
          <h2 id="other-money-heading" className="text-lg font-semibold">
            Other money in &amp; out
          </h2>
          <p className="mb-3 mt-1 text-sm text-ink-soft">
            Anything else across the household boundary — always with a note saying what it was.
          </p>
          <OtherMovementForm
            idPrefix="pots-other"
            pots={pots.map((pot) => ({ id: pot.id, label: pot.label }))}
            today={today}
          />
        </section>
      </div>

      <section
        aria-labelledby="external-history-heading"
        className="mt-6 rounded-xl border border-border bg-surface p-4 shadow-sm"
      >
        <h2 id="external-history-heading" className="text-lg font-semibold">
          Recent swaps &amp; other money
        </h2>
        <p className="mb-3 mt-1 text-sm text-ink-soft">
          Swaps and other money across the boundary — newest first. Voiding keeps the history.
          Borrowing and repayments live on{' '}
          <a href="/borrowing" className="sf-link">
            Borrowing
          </a>
          .
        </p>
        {linkedExternal !== null ? (
          <p className="mb-2 rounded-lg bg-accent-50 px-3 py-2 text-xs text-accent-900">
            Showing the record you linked to — it is older than the twenty most recent.
          </p>
        ) : null}
        {externalRows.length === 0 ? (
          <p className="text-sm text-ink-muted">Nothing recorded yet.</p>
        ) : (
          <ul className="divide-y divide-border-hairline">
            {externalRows.map((movement) => (
              <li key={movement.id} id={`external-${movement.id}`} className="py-2">
                <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
                  <span
                    className={
                      movement.voidedAt !== null ? 'text-ink-faint line-through' : undefined
                    }
                  >
                    {describeExternalMovement(movement)} · {potNames.get(movement.potId) ?? '—'}
                    <span className="ml-2 text-xs text-ink-muted">
                      {movement.occurredDate} · {movement.enteredBy}
                      {movement.note !== null && movement.note !== '' ? ` — ${movement.note}` : ''}
                    </span>
                  </span>
                  <span className="tabular-nums">
                    {movement.direction === 'in' ? '+' : '−'}
                    {formatPence(movement.amountPence)}
                  </span>
                </div>
                {movement.voidedAt === null ? (
                  <details className="mt-1">
                    <summary className="cursor-pointer text-xs font-medium text-ink-soft">
                      Void
                    </summary>
                    <div className="mt-2">
                      <VoidForm
                        kind="external"
                        recordId={movement.id}
                        expectedVersion={movement.version}
                        summary={describeExternalMovement(movement)}
                      />
                    </div>
                  </details>
                ) : (
                  <p className="text-xs text-ink-faint">
                    Voided{movement.voidReason ? ` — ${movement.voidReason}` : ''}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

/** The boundary movement a deep link names, or null when the id is not one. */
function findExternalMovement(db: Db, movementId: number): ExternalMovement | null {
  try {
    return getExternalMovement(db, movementId);
  } catch (error) {
    if (error instanceof ExternalMovementNotFoundError) return null;
    throw error;
  }
}
