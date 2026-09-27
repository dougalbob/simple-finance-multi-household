import Link from 'next/link';
import { redirect } from 'next/navigation';
import { RenewalEditForm } from '@/components/schedule-forms';
import { TaskDueBadge } from '@/components/task-forms';
import { currentUserFromRequest } from '@/lib/auth/next';
import { getDbHandle } from '@/lib/db/client';
import { formatPence } from '@/lib/money';
import { creditCardPaymentReminderDate } from '@/lib/records/credit-cards';
import { listPots } from '@/lib/records/pots';
import { listPeople } from '@/lib/records/people';
import { listRenewals } from '@/lib/records/renewals';
import { daysBetween } from '@/lib/records/dates';
import { listSchedulesWithContractEnds } from '@/lib/records/schedules';
import { supplierCardHref } from '@/lib/records/supplier-focus';
import { getOpenSupplierTaskRows } from '@/lib/records/tasks-view';
import { listSuppliers } from '@/lib/records/suppliers';
import { targetLabel, targetNames } from '@/lib/records/targets';
import { getContractEndWarningLeadDays, getRenewalWarningLeadDays } from '@/lib/records/settings';
import { listVehicles } from '@/lib/records/vehicles';
import { toLocalDateString } from '@/lib/time';

export const dynamic = 'force-dynamic';

/**
 * Contracts & Renewals (SPEC §22.3): the full list — renewal records with
 * their per-item leads and the fixed-term contract ends carried by DD/SO
 * schedules, plus the open tasks about suppliers (the follow-ups promised on
 * a call, decision 175) and the history the annual advance leaves behind.
 *
 * Both lists are informational. Nothing here stops a bank instruction: past
 * contract end dates read "rolled / awaiting review" because the household's
 * direct debit keeps going until they change it at the bank (SPEC §22.1).
 */
export default async function ContractsPage() {
  const user = await currentUserFromRequest();
  if (user === null) redirect('/unauthorized');

  const { db } = getDbHandle();
  const now = new Date();
  const today = toLocalDateString(now);
  const renewals = listRenewals(db);
  const contracts = listSchedulesWithContractEnds(db);
  const creditCards = listPots(db).filter((pot) => pot.kind === 'credit-card');
  const suppliers = listSuppliers(db);
  const supplierNames = new Map(suppliers.map((supplier) => [supplier.id, supplier.name]));
  const people = listPeople(db);
  const vehicles = listVehicles(db);
  const defaultRenewalLead = getRenewalWarningLeadDays(db);
  const contractLead = getContractEndWarningLeadDays(db);
  const followUps = getOpenSupplierTaskRows(db, now);

  const names = targetNames({ people, vehicles });

  return (
    <main className="mx-auto max-w-6xl px-4 py-6 sm:py-8">
      <header className="mb-6">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">Plan ahead</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">Contracts &amp; Renewals</h1>
        <p className="mt-1 max-w-3xl text-sm text-ink-soft">
          Dates are reminders only. The app never changes a bank instruction, sends a payment, or
          verifies a card payment with its provider. Credit-card payments are recorded as transfers,
          not spending.
        </p>
      </header>

      <div className="space-y-6">
        <section
          aria-labelledby="contract-ends-heading"
          className="rounded-xl border border-border bg-surface p-5 shadow-sm"
        >
          <h2 id="contract-ends-heading" className="text-lg font-semibold">
            Fixed-term contract ends
          </h2>
          <p className="mt-1 text-xs text-ink-muted">
            From the DD/SO schedules. Alerts start {contractLead} days ahead (change that on
            Settings).
          </p>
          {contracts.length === 0 ? (
            <p className="mt-3 text-sm text-ink-muted">
              No contract end dates recorded yet. Add one while editing a direct debit on{' '}
              <Link className="text-accent hover:underline" href="/recurring">
                Recurring Payments
              </Link>
              .
            </p>
          ) : (
            <div className="mt-3 divide-y divide-border-hairline">
              {contracts.map((schedule) => {
                const days = daysBetween(today, schedule.contractEndsOn);
                const rolled = schedule.contractEndsOn < today;
                const supplierName =
                  schedule.supplierId !== null
                    ? (supplierNames.get(schedule.supplierId) ?? null)
                    : null;
                return (
                  <div key={schedule.id} className="flex flex-wrap items-baseline gap-x-3 py-3">
                    <span className="font-medium">{schedule.name}</span>
                    <span className="text-sm text-ink-soft">
                      ends {schedule.contractEndsOn} · {formatPence(schedule.amountPence)} ·{' '}
                      {schedule.frequency}
                      {supplierName !== null ? ` · ${supplierName}` : ''}
                    </span>
                    {rolled ? (
                      <span className="rounded-full bg-warning-50 px-2 py-0.5 text-xs font-semibold text-warning">
                        rolled / awaiting review
                      </span>
                    ) : (
                      <span className="text-xs text-ink-muted">
                        {days === 0 ? 'ends today' : `in ${days} days`}
                      </span>
                    )}
                    {supplierName !== null && schedule.supplierId !== null ? (
                      <Link
                        href={supplierCardHref(schedule.supplierId)}
                        className="text-xs font-medium text-accent hover:underline"
                      >
                        {supplierName} card →
                      </Link>
                    ) : null}
                    <Link
                      href={`/recurring#schedule-edit-${schedule.id}`}
                      className="text-xs font-medium text-accent hover:underline"
                    >
                      Edit the schedule →
                    </Link>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <section
          aria-labelledby="card-payments-heading"
          className="rounded-xl border border-border bg-surface p-5 shadow-sm"
        >
          <h2 id="card-payments-heading" className="text-lg font-semibold">
            Credit-card payment reviews
          </h2>
          <p className="mt-1 text-xs text-ink-muted">
            Monthly reminders use the due day and lead you set on each card. Enter the minimum and
            exact due date from the provider&apos;s statement; the app does not calculate it. A
            recorded transfer is not provider confirmation.
          </p>
          {creditCards.length === 0 ? (
            <p className="mt-3 text-sm text-ink-muted">
              No credit-card pots yet. Add one on{' '}
              <Link className="text-accent hover:underline" href="/pots">
                Accounts &amp; Pots
              </Link>
              .
            </p>
          ) : (
            <ul className="mt-3 divide-y divide-border-hairline">
              {creditCards.map((card) => {
                const paymentDate = creditCardPaymentReminderDate(card, today);
                const paymentDays = paymentDate === null ? null : daysBetween(today, paymentDate);
                const promoDate = card.creditCardPromotionalEndDate;
                const promoDays = promoDate === null ? null : daysBetween(today, promoDate);
                return (
                  <li key={card.id} className="py-3">
                    <div className="flex flex-wrap items-baseline gap-x-3">
                      <Link
                        href={`/pots#pot-${card.id}-heading`}
                        className="font-medium text-accent hover:underline"
                      >
                        {card.label}
                      </Link>
                      <span className="text-sm text-ink-soft">
                        {paymentDate === null
                          ? 'monthly due day not set'
                          : `payment due ${paymentDate}`}
                        {card.creditCardStatementDueDate === paymentDate &&
                        card.creditCardStatementMinimumPence !== null
                          ? ` · statement minimum ${formatPence(card.creditCardStatementMinimumPence)}`
                          : ''}
                        {card.creditCardPaymentDayOfMonth !== null
                          ? ` · usual day ${card.creditCardPaymentDayOfMonth} · warn ${card.creditCardWarningDays} days before`
                          : ''}
                      </span>
                      {paymentDays !== null && paymentDays < 0 ? (
                        <span className="rounded-full bg-warning-50 px-2 py-0.5 text-xs font-semibold text-warning">
                          date passed — check provider
                        </span>
                      ) : paymentDays !== null && paymentDays <= card.creditCardWarningDays ? (
                        <span className="rounded-full bg-warning-50 px-2 py-0.5 text-xs font-semibold text-warning">
                          {paymentDays === 0 ? 'review today' : `in ${paymentDays} days`}
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-1 text-sm text-ink-soft">
                      {promoDate === null
                        ? 'No promotional end date set.'
                        : `0% offer ends ${promoDate}${promoDays !== null && promoDays < 0 ? ' — check the current card terms' : promoDays === 0 ? ' — today' : promoDays !== null && promoDays <= card.creditCardWarningDays ? ` — in ${promoDays} days` : ''}.`}
                    </p>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section
          aria-labelledby="renewals-heading"
          className="rounded-xl border border-border bg-surface p-5 shadow-sm"
        >
          <h2 id="renewals-heading" className="text-lg font-semibold">
            Renewals
          </h2>
          <p className="mt-1 text-xs text-ink-muted">
            Insurance and anything else that auto-renews. Each item has its own warning lead
            (default {defaultRenewalLead} days); a repeating date advances a year automatically once
            it passes.
          </p>
          {renewals.length === 0 ? (
            <p className="mt-3 text-sm text-ink-muted">
              No renewals recorded. Add one on{' '}
              <Link className="text-accent hover:underline" href="/recurring">
                Recurring Payments
              </Link>{' '}
              and it will raise a key date before it falls due.
            </p>
          ) : (
            <ul className="mt-3 divide-y divide-border-hairline">
              {renewals.map((renewal) => {
                const days = daysBetween(today, renewal.nextRenewalDate);
                const inWindow = days >= 0 && days <= renewal.warnDaysBefore;
                return (
                  <li key={renewal.id} id={`renewal-${renewal.id}`} className="scroll-mt-24 py-3">
                    <div className="flex flex-wrap items-baseline gap-x-3">
                      <span className="font-medium">{renewal.label}</span>
                      <span className="text-sm text-ink-soft">
                        renews {renewal.nextRenewalDate} · warn {renewal.warnDaysBefore} days ·{' '}
                        {renewal.repeatsAnnually ? 'annual' : 'one-off'}
                      </span>
                      {inWindow ? (
                        <span className="rounded-full bg-warning-50 px-2 py-0.5 text-xs font-semibold text-warning">
                          {days === 0 ? 'renews today' : `in ${days} days`}
                        </span>
                      ) : days < 0 ? (
                        <span className="rounded-full bg-surface-muted px-2 py-0.5 text-xs font-medium text-ink-muted">
                          overdue by {Math.abs(days)} days
                        </span>
                      ) : null}
                      <span className="text-xs text-ink-muted">
                        {targetLabel(renewal, names)}
                        {renewal.supplierId !== null
                          ? ` · ${supplierNames.get(renewal.supplierId) ?? 'supplier'}`
                          : ''}
                      </span>
                    </div>
                    {renewal.advancedFrom !== null ? (
                      <p className="mt-1 text-xs text-ink-muted">
                        Previously {renewal.advancedFrom} — advanced automatically when the date
                        passed.
                      </p>
                    ) : null}
                    {renewal.notes !== null && renewal.notes !== '' ? (
                      <p className="mt-1 text-sm text-ink-soft">{renewal.notes}</p>
                    ) : null}
                    <details className="mt-1.5">
                      <summary className="cursor-pointer text-xs font-medium text-ink-soft hover:text-ink">
                        Edit renewal
                      </summary>
                      <div className="mt-2 max-w-2xl">
                        <RenewalEditForm
                          renewalId={renewal.id}
                          version={renewal.version}
                          label={renewal.label}
                          nextRenewalDate={renewal.nextRenewalDate}
                          warnDaysBefore={renewal.warnDaysBefore}
                          repeatsAnnually={renewal.repeatsAnnually}
                          supplierId={renewal.supplierId}
                          supplierOptions={suppliers.map((supplier) => ({
                            id: supplier.id,
                            label: supplier.name,
                          }))}
                          targetKind={renewal.targetKind}
                          targetId={renewal.targetId}
                          people={people.map(({ id, label }) => ({ id, label }))}
                          vehicles={vehicles.map(({ id, label }) => ({ id, label }))}
                          notes={renewal.notes ?? ''}
                        />
                      </div>
                    </details>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section
          aria-labelledby="follow-ups-heading"
          className="rounded-xl border border-border bg-surface p-5 shadow-sm"
        >
          <h2 id="follow-ups-heading" className="text-lg font-semibold">
            Follow-ups you promised
          </h2>
          <p className="mt-1 text-xs text-ink-muted">
            Every open task about a supplier — including the follow-up dates agreed on a call —
            overdue first, so a promise does not evaporate once its date has passed. Tick them off
            on the supplier card or on{' '}
            <Link className="text-accent hover:underline" href="/tasks">
              Tasks
            </Link>
            . No notification is sent for these (in-app only, by design).
          </p>
          {followUps.length === 0 ? (
            <p className="mt-3 text-sm text-ink-muted">
              Nothing pending. Log a call with a follow-up date on the{' '}
              <Link className="text-accent hover:underline" href="/suppliers">
                Suppliers
              </Link>{' '}
              page and it appears here as a task.
            </p>
          ) : (
            <ul className="mt-3 space-y-1.5 text-sm">
              {followUps.map((task) => (
                <li key={task.id} className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                  <TaskDueBadge task={task} />
                  {task.subjectHref === null ? (
                    <span className="font-medium">{task.subjectLabel}</span>
                  ) : (
                    <Link className="text-accent hover:underline" href={task.subjectHref}>
                      {task.subjectLabel}
                    </Link>
                  )}
                  <span>— {task.title}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}
