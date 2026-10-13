import Link from 'next/link';
import { redirect } from 'next/navigation';
import { TrackedAgreementForm, type AgreementFormData } from '@/components/agreement-forms';
import { TaskDueBadge } from '@/components/task-forms';
import { householdContextFromRequest } from '@/lib/auth/next';
import { formatPence } from '@/lib/money';
import { creditCardPaymentReminderDate } from '@/lib/records/credit-cards';
import { daysBetween } from '@/lib/records/dates';
import { listAgreements, type TrackedAgreement } from '@/lib/records/agreements';
import { listPots } from '@/lib/records/pots';
import { listPeople } from '@/lib/records/people';
import { listSchedules } from '@/lib/records/schedules';
import { supplierCardHref } from '@/lib/records/supplier-focus';
import { getOpenSupplierTaskRows } from '@/lib/records/tasks-view';
import { listSuppliers } from '@/lib/records/suppliers';
import { targetLabel, targetNames } from '@/lib/records/targets';
import { listVehicles } from '@/lib/records/vehicles';
import { toLocalDateString } from '@/lib/time';

export const dynamic = 'force-dynamic';

const CARD_CLASS = 'rounded-xl border border-border bg-surface p-4 shadow-sm sm:p-5';

export default async function ContractsPage() {
  const user = await householdContextFromRequest();
  if (user === null) redirect('/unauthorized');

  const db = user.db;
  const now = new Date();
  const today = toLocalDateString(now);
  const agreements = sortAgreements(listAgreements(db), today);
  const suppliers = listSuppliers(db);
  const supplierNames = new Map(suppliers.map((supplier) => [supplier.id, supplier.name]));
  const people = listPeople(db);
  const vehicles = listVehicles(db);
  const names = targetNames({ people, vehicles });
  const allSchedules = listSchedules(db, now).map(({ schedule }) => schedule);
  const scheduleRows = allSchedules.filter(
    (schedule) => schedule.cancelledAt === null && schedule.kind !== 'receipt',
  );
  const scheduleById = new Map(
    allSchedules
      .filter((schedule) => schedule.kind !== 'receipt')
      .map((schedule) => [schedule.id, schedule]),
  );
  const linkedScheduleIds = new Set(
    agreements.flatMap((agreement) =>
      [agreement.scheduleId, agreement.legacyScheduleId].filter(
        (scheduleId): scheduleId is number => scheduleId !== null,
      ),
    ),
  );
  const formBase: AgreementFormData = {
    suppliers: suppliers.map(({ id, name }) => ({ id, name })),
    people: people.map(({ id, label }) => ({ id, label })),
    vehicles: vehicles.map(({ id, label }) => ({ id, label })),
    schedules: scheduleRows.map((schedule) => ({
      id: schedule.id,
      name: schedule.name,
      kind: schedule.kind as 'dd' | 'so',
      frequency: schedule.frequency,
      amountPence: schedule.amountPence,
      supplierName:
        schedule.supplierId === null ? null : (supplierNames.get(schedule.supplierId) ?? null),
      cancelled: false,
    })),
  };
  const availableScheduleIds = new Set(
    scheduleRows
      .filter((schedule) => !linkedScheduleIds.has(schedule.id))
      .map((schedule) => schedule.id),
  );
  const creditCards = listPots(db).filter((pot) => pot.kind === 'credit-card');
  const followUps = getOpenSupplierTaskRows(db, now);
  const insurance = agreements.filter((agreement) => agreement.type === 'insurance');
  const services = agreements.filter((agreement) => agreement.type === 'service');
  const other = agreements.filter((agreement) => agreement.type === 'other');
  const datesWithReminders = agreements.reduce(
    (count, agreement) =>
      count +
      Number(agreement.renewalDate !== null && agreement.renewalReminderLeadDays !== null) +
      Number(agreement.switchDate !== null && agreement.switchReminderLeadDays !== null),
    0,
  );

  return (
    <main className="mx-auto max-w-6xl px-4 py-6 sm:py-8">
      <header className="mb-6">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">Plan ahead</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">Contracts &amp; Renewals</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-ink-soft">
          Keep provider terms and dates here; keep payment amounts and frequency on Recurring. A
          reminder is an in-app prompt only. It never renews, cancels or changes a service or bank
          instruction.
        </p>
        <div className="mt-4 flex flex-wrap gap-2 text-xs font-medium">
          <span className="rounded-full bg-accent-soft px-3 py-1 text-accent-ink">
            {insurance.length} insurance {insurance.length === 1 ? 'policy' : 'policies'}
          </span>
          <span className="rounded-full bg-surface-muted px-3 py-1 text-ink-soft">
            {services.length} service {services.length === 1 ? 'contract' : 'contracts'}
          </span>
          <span className="rounded-full bg-surface-muted px-3 py-1 text-ink-soft">
            {datesWithReminders} in-app {datesWithReminders === 1 ? 'reminder' : 'reminders'} set
          </span>
        </div>
      </header>

      <section aria-labelledby="agreement-register-heading" className={`${CARD_CLASS} mb-6`}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 id="agreement-register-heading" className="text-xl font-semibold">
              Your agreements
            </h2>
            <p className="mt-1 max-w-3xl text-sm text-ink-soft">
              Insurance stays grouped here whether the provider auto-renews it or not. Renewal and
              fee-free switch dates are separate because they can be different.
            </p>
          </div>
          <details className="w-full sm:w-auto">
            <summary className="cursor-pointer rounded-lg bg-till px-4 py-2.5 text-center text-sm font-semibold text-till-ink">
              Add a contract or policy
            </summary>
            <div className="mt-4 rounded-xl border border-border-hairline bg-canvas p-4 sm:min-w-[min(44rem,calc(100vw-3rem))]">
              <TrackedAgreementForm
                data={{
                  ...formBase,
                  schedules: formBase.schedules.filter((schedule) =>
                    availableScheduleIds.has(schedule.id),
                  ),
                }}
              />
            </div>
          </details>
        </div>

        <div className="mt-5 space-y-7">
          <AgreementGroup
            heading="Insurance policies"
            description="Every insurance policy is listed here, including policies that do not auto-renew."
            agreements={insurance}
            today={today}
            names={names}
            supplierNames={supplierNames}
            scheduleById={scheduleById}
            formBase={formBase}
            linkedScheduleIds={linkedScheduleIds}
          />
          <AgreementGroup
            heading="Service contracts"
            description="Phone, broadband, energy and other services with terms worth reviewing."
            agreements={services}
            today={today}
            names={names}
            supplierNames={supplierNames}
            scheduleById={scheduleById}
            formBase={formBase}
            linkedScheduleIds={linkedScheduleIds}
          />
          {other.length > 0 ? (
            <AgreementGroup
              heading="Other renewal reminders"
              description="Older reminders are kept here until you classify them as an insurance policy or service contract."
              agreements={other}
              today={today}
              names={names}
              supplierNames={supplierNames}
              scheduleById={scheduleById}
              formBase={formBase}
              linkedScheduleIds={linkedScheduleIds}
            />
          ) : null}
          {agreements.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border-strong bg-canvas px-4 py-6 text-center">
              <p className="font-medium text-ink-body">No contracts or policies tracked yet</p>
              <p className="mt-1 text-sm text-ink-muted">
                Add a policy even if its payment is not a recurring direct debit. You can link a
                schedule later.
              </p>
            </div>
          ) : null}
        </div>
      </section>

      <div className="space-y-5">
        <section
          aria-labelledby="card-payments-heading"
          className={`${CARD_CLASS} border-border-hairline`}
        >
          <h2 id="card-payments-heading" className="text-lg font-semibold">
            Credit-card payment reviews
          </h2>
          <p className="mt-1 text-sm text-ink-muted">
            Monthly prompts use each card&apos;s due-day and warning settings. Check the
            provider&apos;s statement; the app cannot verify a payment.
          </p>
          {creditCards.length === 0 ? (
            <p className="mt-3 text-sm text-ink-muted">No credit-card pots to review.</p>
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
                      <Link href={`/pots#pot-${card.id}-heading`} className="sf-link">
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
          aria-labelledby="follow-ups-heading"
          className={`${CARD_CLASS} border-border-hairline`}
        >
          <h2 id="follow-ups-heading" className="text-lg font-semibold">
            Follow-ups you promised
          </h2>
          <p className="mt-1 text-sm text-ink-muted">
            Open supplier tasks, including promised call-backs. Tick them off on the supplier card
            or on{' '}
            <Link className="sf-link" href="/tasks">
              Tasks
            </Link>
            ; no notification is sent.
          </p>
          {followUps.length === 0 ? (
            <p className="mt-3 text-sm text-ink-muted">Nothing pending with suppliers.</p>
          ) : (
            <ul className="mt-3 space-y-1.5 text-sm">
              {followUps.map((task) => (
                <li key={task.id} className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                  <TaskDueBadge task={task} />
                  {task.subjectHref === null ? (
                    <span className="font-medium">{task.subjectLabel}</span>
                  ) : (
                    <Link className="sf-link" href={task.subjectHref}>
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

function AgreementGroup({
  heading,
  description,
  agreements,
  today,
  names,
  supplierNames,
  scheduleById,
  formBase,
  linkedScheduleIds,
}: {
  heading: string;
  description: string;
  agreements: TrackedAgreement[];
  today: string;
  names: ReturnType<typeof targetNames>;
  supplierNames: Map<number, string>;
  scheduleById: Map<number, ReturnType<typeof listSchedules>[number]['schedule']>;
  formBase: AgreementFormData;
  linkedScheduleIds: Set<number>;
}) {
  return (
    <section aria-label={heading}>
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h3 className="text-lg font-semibold">{heading}</h3>
          <p className="mt-0.5 text-sm text-ink-muted">{description}</p>
        </div>
        <span className="rounded-full bg-canvas px-2.5 py-1 text-xs font-medium text-ink-soft">
          {agreements.length} {agreements.length === 1 ? 'item' : 'items'}
        </span>
      </div>
      {agreements.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border-hairline px-3 py-4 text-sm text-ink-muted">
          Nothing recorded in this group yet.
        </p>
      ) : (
        <ul className="space-y-3">
          {agreements.map((agreement) => {
            const supplierName =
              agreement.supplierId === null
                ? null
                : (supplierNames.get(agreement.supplierId) ?? null);
            const schedule =
              agreement.scheduleId === null
                ? null
                : (scheduleById.get(agreement.scheduleId) ?? null);
            const editSchedules = formBase.schedules.filter(
              (option) =>
                !linkedScheduleIds.has(option.id) ||
                option.id === agreement.scheduleId ||
                option.id === agreement.legacyScheduleId,
            );
            if (schedule !== null && !editSchedules.some((option) => option.id === schedule.id)) {
              editSchedules.push({
                id: schedule.id,
                name: schedule.name,
                kind: schedule.kind as 'dd' | 'so',
                frequency: schedule.frequency,
                amountPence: schedule.amountPence,
                supplierName:
                  schedule.supplierId === null
                    ? null
                    : (supplierNames.get(schedule.supplierId) ?? null),
                cancelled: schedule.cancelledAt !== null,
              });
            }
            return (
              <li key={agreement.id}>
                <article
                  id={`agreement-${agreement.id}`}
                  className="scroll-mt-24 rounded-xl border border-border bg-surface-muted/40 p-4 sm:p-5"
                >
                  {agreement.legacyRenewalId !== null ? (
                    <span id={`renewal-${agreement.legacyRenewalId}`} className="scroll-mt-24" />
                  ) : null}
                  <AgreementCardBody
                    agreement={agreement}
                    today={today}
                    target={targetLabel(agreement, names)}
                    supplierName={supplierName}
                    schedule={schedule}
                  />
                  <details className="mt-3 border-t border-border-hairline pt-3">
                    <summary className="cursor-pointer text-sm font-semibold text-ink-soft hover:text-ink">
                      Edit contract or policy details
                    </summary>
                    <div className="mt-3">
                      <TrackedAgreementForm
                        agreement={agreement}
                        data={{ ...formBase, schedules: editSchedules }}
                      />
                    </div>
                  </details>
                </article>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function AgreementCardBody({
  agreement,
  today,
  target,
  supplierName,
  schedule,
}: {
  agreement: TrackedAgreement;
  today: string;
  target: string;
  supplierName: string | null;
  schedule: ReturnType<typeof listSchedules>[number]['schedule'] | null;
}) {
  const next = nextReview(agreement, today);
  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-accent-soft px-2.5 py-1 text-xs font-semibold text-accent-ink">
              {agreement.type === 'insurance'
                ? 'Insurance policy'
                : agreement.type === 'service'
                  ? 'Service contract'
                  : 'Other reminder'}
            </span>
            {agreement.type === 'insurance' ? (
              <AutoRenewBadge status={agreement.autoRenew} />
            ) : null}
          </div>
          <h4 className="text-base font-semibold text-ink-emphasis">{agreement.name}</h4>
          <p className="mt-0.5 text-sm text-ink-soft">
            {supplierName !== null ? (
              <>
                {supplierName} · {target}
              </>
            ) : (
              <>Provider not linked · {target}</>
            )}
            {supplierName !== null && agreement.supplierId !== null ? (
              <>
                {' · '}
                <Link href={supplierCardHref(agreement.supplierId)} className="sf-link">
                  Supplier details
                </Link>
              </>
            ) : null}
          </p>
        </div>
        {next !== null ? (
          <span
            className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
              next.tone === 'warning'
                ? 'bg-warning-50 text-warning'
                : next.tone === 'positive'
                  ? 'bg-positive-50 text-positive'
                  : 'bg-canvas text-ink-soft'
            }`}
          >
            {next.label}
          </span>
        ) : null}
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <DateDetail
          title={
            agreement.type === 'insurance' ? 'Renewal / cover-end date' : 'Renewal or review date'
          }
          date={agreement.renewalDate}
          reminderLeadDays={agreement.renewalReminderLeadDays}
          emptyLabel={
            agreement.type === 'insurance' ? 'No policy date recorded' : 'No renewal date recorded'
          }
        />
        <DateDetail
          title="Can switch without an exit fee from"
          date={agreement.switchDate}
          reminderLeadDays={agreement.switchReminderLeadDays}
          emptyLabel="No fee-free switch date recorded"
        />
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-ink-soft">
        {schedule === null ? (
          <span>No recurring payment linked</span>
        ) : (
          <>
            <span>
              Payment: {schedule.name} · {formatPence(schedule.amountPence)} · {schedule.frequency}
              {schedule.cancelledAt !== null ? ' · cancelled' : ''}
            </span>
            <Link href={`/recurring#schedule-edit-${schedule.id}`} className="sf-link">
              {schedule.cancelledAt !== null ? 'Schedule options' : 'Edit payment schedule'}
            </Link>
          </>
        )}
      </div>
      {agreement.notes !== null ? (
        <p className="mt-2 text-sm text-ink-soft">{agreement.notes}</p>
      ) : null}
      {agreement.renewalAdvancedFrom !== null ? (
        <p className="mt-2 text-xs text-ink-muted">
          The annual date moved forward from {agreement.renewalAdvancedFrom} because the provider is
          set to auto-renew.
        </p>
      ) : null}
    </>
  );
}

function DateDetail({
  title,
  date,
  reminderLeadDays,
  emptyLabel,
}: {
  title: string;
  date: string | null;
  reminderLeadDays: number | null;
  emptyLabel: string;
}) {
  return (
    <div className="rounded-lg border border-border-hairline bg-surface px-3 py-2.5">
      <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">{title}</p>
      {date === null ? (
        <p className="mt-1 text-sm text-ink-faint">{emptyLabel}</p>
      ) : (
        <>
          <p className="mt-1 text-sm font-semibold tabular-nums text-ink-body">{date}</p>
          <p className="mt-0.5 text-xs text-ink-muted">
            {reminderLeadDays === null
              ? 'No reminder set'
              : `In-app reminder ${reminderLeadDays} ${reminderLeadDays === 1 ? 'day' : 'days'} before`}
          </p>
        </>
      )}
    </div>
  );
}

function AutoRenewBadge({ status }: { status: TrackedAgreement['autoRenew'] }) {
  const copy =
    status === 'yes'
      ? 'Auto-renews: yes'
      : status === 'no'
        ? 'Auto-renews: no'
        : 'Auto-renew: unknown';
  const tone = status === 'yes' ? 'bg-positive-50 text-positive' : 'bg-canvas text-ink-soft';
  return <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${tone}`}>{copy}</span>;
}

function nextReview(
  agreement: TrackedAgreement,
  today: string,
): { label: string; tone: 'warning' | 'positive' | 'quiet' } | null {
  const upcoming = [
    ...(agreement.renewalDate === null
      ? []
      : [{ date: agreement.renewalDate, type: 'renewal' as const }]),
    ...(agreement.switchDate === null
      ? []
      : [{ date: agreement.switchDate, type: 'switch' as const }]),
  ]
    .filter((event) => event.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date));
  const next = upcoming[0];
  if (next !== undefined) {
    const days = daysBetween(today, next.date);
    const eventName = next.type === 'switch' ? 'switch date' : 'review date';
    return {
      label:
        days === 0
          ? `${next.type === 'switch' ? 'Switch' : 'Review'} today`
          : `${eventName} in ${days} ${days === 1 ? 'day' : 'days'}`,
      tone: days <= 30 ? 'warning' : 'quiet',
    };
  }
  if (agreement.switchDate !== null && agreement.switchDate < today) {
    return { label: 'Fee-free switch available now', tone: 'positive' };
  }
  if (agreement.renewalDate !== null && agreement.renewalDate < today) {
    return { label: 'Review date passed', tone: 'warning' };
  }
  return null;
}

function sortAgreements(agreements: TrackedAgreement[], today: string): TrackedAgreement[] {
  return [...agreements].sort((a, b) => {
    const dateA = nextActionDate(a, today);
    const dateB = nextActionDate(b, today);
    return dateA.localeCompare(dateB) || a.name.localeCompare(b.name);
  });
}

function nextActionDate(agreement: TrackedAgreement, today: string): string {
  const upcoming = [agreement.renewalDate, agreement.switchDate]
    .filter((date): date is string => date !== null && date >= today)
    .sort();
  if (upcoming[0] !== undefined) return upcoming[0];
  if (agreement.renewalDate !== null && agreement.renewalDate < today) return '9999-12-31';
  if (agreement.switchDate !== null && agreement.switchDate < today) return '9999-12-31';
  return '9999-12-31';
}
