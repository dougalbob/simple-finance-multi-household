import Link from 'next/link';
import { redirect } from 'next/navigation';
import { DebtEditForm, DeleteDebtForm, LoanMovementForm } from '@/components/external-forms';
import { BorrowSetupForm } from '@/components/borrowing-forms';
import { BorrowingLedger } from '@/components/borrowing-ledger';
import { householdContextFromRequest } from '@/lib/auth/next';
import { formatPence } from '@/lib/money';
import { buildBorrowingLedger, type BorrowingPerson } from '@/lib/records/borrowing';
import {
  getExternalMovement,
  ExternalMovementNotFoundError,
  type ExternalMovement,
} from '@/lib/records/external-movements';
import { parseOpenRecordId } from '@/lib/records/in-place-activity';
import { listPots } from '@/lib/records/pots';
import { toLocalDateString } from '@/lib/time';

export const dynamic = 'force-dynamic';

/**
 * The Borrowing page (GitHub issue #60, decision 228,
 * docs/BORROWING_PAGE_PLAN.md): everything informal borrowing lives here —
 * the per-person summary with each IOU's honest status, one setup flow
 * (select or create the person, recurring plan or one-off), the combined
 * transaction-style ledger with its From/To filter and per-person running
 * balance, and the record panel for repayments and further borrowing. The
 * cards moved here from Accounts, Pots & Checkpoints, which keeps swaps and
 * other money across the boundary. Formal borrowing — loan agreements,
 * credit cards — is not this page; the footer says where it is.
 */
export default async function BorrowingPage({
  searchParams,
}: {
  searchParams: Promise<{
    who?: string;
    order?: string;
    external?: string;
    debt?: string;
    what?: string;
    amountPence?: string;
  }>;
}) {
  const user = await householdContextFromRequest();
  if (user === null) redirect('/unauthorized');

  const db = user.db;
  const now = new Date();
  const today = toLocalDateString(now);
  const params = await searchParams;

  // `/pots?external={id}` used to open boundary records there. Swap and
  // other-money records stay on the pots page; a loan record now lives here
  // (decision 225's redirect treatment for moved records).
  const linkedExternalId = parseOpenRecordId(params.external);
  if (linkedExternalId !== null) {
    const linked = findExternalMovement(db, linkedExternalId);
    if (linked !== null && linked.kind !== 'loan') {
      redirect(`/pots?external=${linked.id}#external-${linked.id}`);
    }
  }

  const who = typeof params.who === 'string' && params.who !== '' ? params.who : undefined;
  const order = params.order === 'newest' ? ('newest' as const) : ('oldest' as const);
  const ledger = buildBorrowingLedger(db, { who, order, today });
  const pots = listPots(db);
  const allDebts = ledger.people.flatMap((person) => person.lines);

  // The record panel arrives pre-filled from a summary chip or an expected
  // row's "Record this month's" link (`?debt=&what=&amountPence=#record`).
  const presetDebtId = parseOpenRecordId(params.debt);
  const presetDirection =
    params.what === 'in' || params.what === 'out' ? (params.what as 'in' | 'out') : null;
  const presetAmountPence =
    typeof params.amountPence === 'string' && /^[1-9][0-9]{0,14}$/.test(params.amountPence)
      ? Number(params.amountPence)
      : null;

  // The From/To filter turns the captions personal: for a person with one
  // arrangement the columns say what the amounts mean in their words.
  const filteredPerson =
    who === undefined ? null : (ledger.people.find((person) => person.label === who) ?? null);
  const directions = new Set(filteredPerson?.lines.map((line) => line.debt.direction) ?? []);
  const [inLabel, outLabel] =
    directions.size === 1 && filteredPerson !== null
      ? filteredPerson.lines[0]?.debt.direction === 'we_owe'
        ? (['Amt in (borrowed)', 'Amt repaid'] as const)
        : (['Amt in (repaid to us)', 'Amt out (lent)'] as const)
      : (['Money in', 'Money out'] as const);

  return (
    <main className="mx-auto max-w-7xl px-4 py-6 sm:py-8">
      <header className="mb-6">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">Borrowing</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">Owed &amp; owing</h1>
        <p className="mt-1 max-w-3xl text-sm text-ink-soft">
          Informal IOUs with people outside the household — who, which way round, and what is still
          owed. Balances derive from the movements in the ledger below, so they can never drift.
          Borrowed money is owed, never income; a repayment is never spending.
        </p>
      </header>

      <div className="grid gap-4 md:grid-cols-2">
        {ledger.people.map((person) => (
          <PersonCard key={person.label} person={person} today={today} />
        ))}
        {ledger.people.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border-strong bg-surface p-6 text-sm text-ink-soft">
            No debts tracked. Set up the first arrangement beside this card — a recurring support
            payment, or a one-off borrow or loan.
          </p>
        ) : null}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <section
          aria-labelledby="setup-heading"
          className="rounded-xl border border-border bg-surface p-4 shadow-sm"
        >
          <h2 id="setup-heading" className="text-lg font-semibold">
            Set up borrowing or lending
          </h2>
          <p className="mb-3 mt-1 text-sm text-ink-soft">
            Select the person — or create them if they are new — then say whether this is a
            recurring arrangement or a one-off.
          </p>
          <BorrowSetupForm
            idPrefix="borrowing-setup"
            debts={allDebts.map((line) => ({
              id: line.debt.id,
              counterparty: line.debt.counterparty,
              direction: line.debt.direction,
            }))}
            pots={pots.map((pot) => ({ id: pot.id, label: pot.label }))}
            today={today}
          />
        </section>

        <section
          aria-labelledby="ledger-heading"
          className="rounded-xl border border-border bg-surface p-4 shadow-sm"
        >
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 id="ledger-heading" className="text-lg font-semibold">
              The ledger
            </h2>
            <Link
              href={
                order === 'oldest'
                  ? buildLedgerHref({ who: who ?? null, order: 'newest' })
                  : buildLedgerHref({ who: who ?? null, order: 'oldest' })
              }
              className="text-xs sf-link"
            >
              {order === 'oldest' ? 'Newest first' : 'Oldest first'}
            </Link>
          </div>
          <p className="mb-2 mt-1 text-sm text-ink-soft">
            Every borrowing, repayment, loan and expected payment in date order. The balance is that
            person&apos;s arrangement after each row:{' '}
            <span className="font-medium">− we owe · + owed to us</span>. Click an amount for the
            detail, correction and void.
          </p>
          <nav aria-label="Filter by person" className="mb-2 flex flex-wrap items-center gap-2">
            <Link
              href={buildLedgerHref({ who: null, order })}
              className={`rounded-full px-3 py-1 text-xs font-medium ${
                who === undefined
                  ? 'bg-accent text-accent-contrast'
                  : 'bg-surface-muted text-ink-body hover:bg-canvas'
              }`}
            >
              All
            </Link>
            {ledger.people.map((person) => (
              <Link
                key={person.label}
                href={buildLedgerHref({ who: person.label, order })}
                className={`rounded-full px-3 py-1 text-xs font-medium ${
                  who === person.label
                    ? 'bg-accent text-accent-contrast'
                    : 'bg-surface-muted text-ink-body hover:bg-canvas'
                }`}
              >
                {person.label} · {person.positionLabel}
              </Link>
            ))}
          </nav>
          <BorrowingLedger
            rows={ledger.rows}
            pots={pots.map((pot) => ({ id: pot.id, label: pot.label, kind: pot.kind }))}
            today={today}
            inLabel={inLabel}
            outLabel={outLabel}
          />
        </section>
      </div>

      <section
        id="record"
        aria-labelledby="record-heading"
        className="sf-anchor mt-6 rounded-xl border border-border bg-surface p-4 shadow-sm"
      >
        <h2 id="record-heading" className="text-lg font-semibold">
          Record money in or out
        </h2>
        <p className="mb-3 mt-1 text-sm text-ink-soft">
          A repayment brings what is owed down — it is never spending. More borrowing is owed —
          never income. A payment that was cash and later banked is two records: this one into the
          pot the money landed in, then Move → Between pots when you deposit it.
        </p>
        <LoanMovementForm
          // Keyed on the presets: `useState` initial values only apply at
          // mount, so a prefill link must remount the form (the decision 208
          // fix for the quick-window date pickers).
          key={`record-${presetDebtId ?? 'none'}-${presetDirection ?? 'none'}-${presetAmountPence ?? 'none'}`}
          idPrefix="borrowing-record"
          pots={pots.map((pot) => ({ id: pot.id, label: pot.label }))}
          debts={allDebts.map((line) => ({
            id: line.debt.id,
            counterparty: line.debt.counterparty,
            direction: line.debt.direction,
          }))}
          today={today}
          presetDebtId={presetDebtId}
          presetDirection={presetDirection}
          presetAmountPence={presetAmountPence}
        />
      </section>

      <p className="mt-6 rounded-xl border border-border-hairline bg-canvas px-4 py-3 text-sm text-ink-soft">
        Not this page: <strong className="font-medium text-ink-body">formal borrowing</strong> — a
        loan agreement lives under{' '}
        <Link href="/contracts" className="sf-link">
          Contracts &amp; Renewals
        </Link>
        , and a credit card is a{' '}
        <Link href="/pots" className="sf-link">
          credit-card pot
        </Link>{' '}
        repaid by transfer. This page is informal IOUs only — who, which way round, and what is
        still owed.
      </p>
    </main>
  );
}

function PersonCard({ person, today }: { person: BorrowingPerson; today: string }) {
  return (
    <section
      aria-labelledby={`person-${person.label.replace(/\s+/g, '-').toLowerCase()}-heading`}
      className="rounded-xl border border-border bg-surface p-4 shadow-sm"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2
          id={`person-${person.label.replace(/\s+/g, '-').toLowerCase()}-heading`}
          className="text-lg font-semibold"
        >
          {person.label}
        </h2>
        <span className="text-sm font-semibold tabular-nums">{person.positionLabel}</span>
      </div>
      <ul className="mt-2 divide-y divide-border-hairline">
        {person.lines.map((line) => (
          <li key={line.debt.id} id={`debt-${line.debt.id}`} className="sf-anchor py-2">
            <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
              <span className="font-medium">{line.statusLabel}</span>
              <span className="tabular-nums">
                {line.movementCount === 0
                  ? line.totalMovementCount === 0
                    ? 'no movements yet'
                    : 'no effective movements — all voided'
                  : `${line.movementCount} movement${line.movementCount === 1 ? '' : 's'}`}
              </span>
            </div>
            {line.nextExpected !== null ? (
              <p className="mt-1 text-xs text-accent-800">
                Expecting {formatPence(line.nextExpected.amountPence)} on day{' '}
                {line.debt.expectedInflowDayOfMonth ?? ''} of each month (a weekend day lands on the
                Friday before)
                {line.debt.expectedInflowUntilDate === null
                  ? ', until you stop it'
                  : ` until ${line.debt.expectedInflowUntilDate} inclusive`}
                . Expected, never received: it shows in the projections and in All Transactions, and
                the pot moves only when you record the borrowing.
              </p>
            ) : null}
            {line.debt.note !== null && line.debt.note !== '' ? (
              <p className="text-xs text-ink-muted">{line.debt.note}</p>
            ) : null}
            <div className="mt-1 flex flex-wrap items-center gap-3 text-xs">
              {line.debt.direction === 'we_owe' ? (
                <>
                  <Link href={`?debt=${line.debt.id}&what=in#record`} className="sf-link">
                    Record borrowing
                  </Link>
                  <Link href={`?debt=${line.debt.id}&what=out#record`} className="sf-link">
                    Record a repayment
                  </Link>
                </>
              ) : (
                <>
                  <Link href={`?debt=${line.debt.id}&what=out#record`} className="sf-link">
                    Record a loan out
                  </Link>
                  <Link href={`?debt=${line.debt.id}&what=in#record`} className="sf-link">
                    Record what they repaid
                  </Link>
                </>
              )}
            </div>
            <details className="mt-1">
              <summary className="cursor-pointer text-xs font-medium text-ink-soft">Edit</summary>
              <div className="mt-2">
                <DebtEditForm
                  idPrefix={`debt-edit-${line.debt.id}`}
                  debtId={line.debt.id}
                  version={line.debt.version}
                  counterparty={line.debt.counterparty}
                  note={line.debt.note}
                  expectedInflowAmountPence={line.debt.expectedInflowAmountPence}
                  expectedInflowDayOfMonth={line.debt.expectedInflowDayOfMonth}
                  expectedInflowUntilDate={line.debt.expectedInflowUntilDate}
                  today={today}
                />
              </div>
            </details>
            {line.totalMovementCount === 0 ? (
              <details className="mt-1">
                <summary className="cursor-pointer text-xs font-medium text-danger">Delete</summary>
                <div className="mt-2">
                  <DeleteDebtForm
                    debtId={line.debt.id}
                    version={line.debt.version}
                    counterparty={line.debt.counterparty}
                    direction={line.debt.direction}
                    hasExpectedInflow={
                      line.debt.expectedInflowAmountPence !== null &&
                      line.debt.expectedInflowDayOfMonth !== null
                    }
                  />
                </div>
              </details>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}

/** The ledger's own URL: the From/To filter and the order, nothing else. */
function buildLedgerHref(options: { who: string | null; order: 'oldest' | 'newest' }): string {
  const params = new URLSearchParams();
  if (options.who !== null) params.set('who', options.who);
  if (options.order !== 'oldest') params.set('order', options.order);
  const query = params.toString();
  return query === '' ? '/borrowing' : `/borrowing?${query}`;
}

/** The boundary movement a deep link names, or null when the id is not one. */
function findExternalMovement(
  db: Parameters<typeof getExternalMovement>[0],
  movementId: number,
): ExternalMovement | null {
  try {
    return getExternalMovement(db, movementId);
  } catch (error) {
    if (error instanceof ExternalMovementNotFoundError) return null;
    throw error;
  }
}
