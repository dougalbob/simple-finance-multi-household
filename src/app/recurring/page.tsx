import Link from 'next/link';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { ProjectionSettingsForm, type RecurringData } from '@/components/recurring';
import {
  RecurringScheduleSection,
  type ScheduleListRow,
} from '@/components/recurring-schedule-list';
import { RecurringCalendarGrid } from '@/components/recurring-calendar';
import { householdContextFromRequest } from '@/lib/auth/next';
import { categoryTree } from '@/lib/records/categories';
import { addDaysLocal, daysInMonth } from '@/lib/records/dates';
import { listPeople } from '@/lib/records/people';
import { listPots } from '@/lib/records/pots';
import { listAgreements } from '@/lib/records/agreements';
import { listInstances, listSchedules } from '@/lib/records/schedules';
import { buildRecurringCalendar } from '@/lib/records/recurring-calendar';
import {
  recurringHref,
  resolveHideCancelled,
  SCHEDULE_HIDE_CANCELLED_COOKIE,
} from '@/lib/records/schedule-visibility';
import { getMonthlyFuelByVehicle, getWeeklyGroceriesPence } from '@/lib/records/settings';
import { listSuppliersForEntry } from '@/lib/records/suppliers';
import { toLocalDateString } from '@/lib/time';
import { listVehicles } from '@/lib/records/vehicles';

export const dynamic = 'force-dynamic';

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

interface MonthRef {
  year: number;
  month: number; // 1–12
}

const monthParam = (ref: MonthRef) => `${ref.year}-${String(ref.month).padStart(2, '0')}`;
const monthTitle = (ref: MonthRef) => `${MONTH_NAMES[ref.month - 1]} ${ref.year}`;

function parseMonthParam(raw: string | undefined, fallback: MonthRef): MonthRef {
  if (raw === undefined) return fallback;
  const match = /^(\d{4})-(\d{2})$/.exec(raw);
  if (match === null) return fallback;
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > 12 || year < 2000 || year > 2100) return fallback;
  return { year, month };
}

function parseScheduleId(raw: string | undefined): number | null {
  if (raw === undefined || !/^[1-9]\d*$/.test(raw)) return null;
  const id = Number(raw);
  return Number.isSafeInteger(id) ? id : null;
}

function shiftMonth(ref: MonthRef, delta: number): MonthRef {
  const index = ref.year * 12 + (ref.month - 1) + delta;
  return { year: Math.floor(index / 12), month: (index % 12) + 1 };
}

export default async function RecurringPage({
  searchParams,
}: {
  searchParams: Promise<{
    month?: string;
    hideCancelled?: string;
    q?: string;
    scheduleId?: string;
  }>;
}) {
  const user = await householdContextFromRequest();
  if (user === null) redirect('/unauthorized');

  const db = user.db;
  const now = new Date();
  const today = toLocalDateString(now);
  const params = await searchParams;

  const cookieJar = await cookies();
  const cookieValue = cookieJar.get(SCHEDULE_HIDE_CANCELLED_COOKIE)?.value;
  const hideCancelled = resolveHideCancelled(params.hideCancelled, cookieValue);
  const initialQuery = params.q?.trim() ?? '';
  const focusedScheduleId = parseScheduleId(params.scheduleId);

  const thisMonth = {
    year: Number(today.slice(0, 4)),
    month: Number(today.slice(5, 7)),
  };
  const ref = parseMonthParam(params.month, thisMonth);

  const first = `${ref.year}-${String(ref.month).padStart(2, '0')}-01`;
  const last = addDaysLocal(first, daysInMonth(ref.year, ref.month) - 1);
  // The calendar renders exactly the instances listInstances returns for the
  // month window — same rows as the lists below (decision 70), so the two can
  // never disagree.
  const monthInstances = listInstances(db, { from: first, through: last });
  const days = buildRecurringCalendar(ref, today, monthInstances);

  const schedules = listSchedules(db, now);
  const agreements = listAgreements(db);
  const agreementByScheduleId = new Map(
    agreements.flatMap((agreement) =>
      agreement.scheduleId === null ? [] : [[agreement.scheduleId, agreement] as const],
    ),
  );
  const pots = listPots(db);
  const people = listPeople(db);
  const vehicles = listVehicles(db);
  const suppliers = listSuppliersForEntry(db);
  const categoryOptions = categoryTree(db).flatMap((parent) =>
    parent.children
      .filter((child) => child.retiredAt === null)
      .map((child) => ({ id: child.id, parentName: parent.name, childName: child.name })),
  );
  const fuelByVehicle = getMonthlyFuelByVehicle(db);
  const potNames = new Map(pots.map((pot) => [pot.id, pot.label]));

  const recurringData: RecurringData = {
    pots: pots.map(({ id, label }) => ({ id, label })),
    categories: categoryOptions,
    people: people.map(({ id, label }) => ({ id, label })),
    vehicles: vehicles.map(({ id, label }) => ({ id, label })),
    suppliers: suppliers.map(({ id, name }) => ({ id, name })),
    today,
    schedules: schedules.map(({ schedule, nextDueDate }) => ({
      id: schedule.id,
      name: schedule.name,
      kind: schedule.kind,
      frequency: schedule.frequency,
      amountPence: schedule.amountPence,
      dueDayOfMonth: schedule.dueDayOfMonth,
      dueMonth: schedule.dueMonth,
      potLabel: potNames.get(schedule.potId) ?? 'Pot',
      nextDueDate,
      version: schedule.version,
      cancelledEffectiveOn: schedule.cancelledEffectiveOn,
      contractEndsOn: schedule.contractEndsOn,
      supplierId: schedule.supplierId,
      supplierName:
        schedule.supplierId === null
          ? null
          : (suppliers.find((s) => s.id === schedule.supplierId)?.name ?? null),
    })),
    projectionSettings: {
      weeklyGroceriesPence: getWeeklyGroceriesPence(db),
      monthlyFuelPence: vehicles.map((vehicle) => ({
        vehicleId: vehicle.id,
        label: vehicle.label,
        pence: fuelByVehicle.get(vehicle.id) ?? null,
      })),
    },
  };

  const scheduleRows: ScheduleListRow[] = schedules.map(({ schedule, nextDueDate }) => {
    const linkedAgreement = agreementByScheduleId.get(schedule.id);
    return {
      id: schedule.id,
      name: schedule.name,
      kind: schedule.kind,
      frequency: schedule.frequency,
      dueDayOfMonth: schedule.dueDayOfMonth,
      dueMonth: schedule.dueMonth,
      excludedMonths: schedule.excludedMonths,
      amountPence: schedule.amountPence,
      potId: schedule.potId,
      potLabel: potNames.get(schedule.potId) ?? 'Pot',
      categoryId: schedule.categoryId,
      supplierId: schedule.supplierId,
      supplierName:
        schedule.supplierId === null
          ? null
          : (suppliers.find((s) => s.id === schedule.supplierId)?.name ?? null),
      targetKind: schedule.targetKind,
      targetId: schedule.targetId,
      contractEndsOn: schedule.contractEndsOn,
      activeFrom: schedule.activeFrom,
      activeUntil: schedule.activeUntil,
      isCancelled: schedule.cancelledAt !== null,
      cancelledEffectiveOn: schedule.cancelledEffectiveOn,
      version: schedule.version,
      nextDueDate,
      agreement: linkedAgreement ? { id: linkedAgreement.id, name: linkedAgreement.name } : null,
    };
  });

  return (
    <main className="mx-auto max-w-7xl px-4 py-6 sm:py-8">
      <header className="mb-6">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">
          Recurring payments
        </p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">
          Recurring payments &amp; the month at a glance
        </h1>
        <p className="mt-1 max-w-3xl text-sm text-ink-soft">
          Schedules convert automatically at local midnight on their due date. This calendar is
          <span className="font-semibold"> read-only planning aid</span>: moving a date here (or
          editing a schedule) changes the <em>records</em> the app makes — it never moves your bank
          instructions. Direct debits and standing orders are agreed with your bank, and the app
          does not touch them. Provider terms and review dates live on{' '}
          <Link href="/contracts" className="sf-link">
            Contracts &amp; Renewals
          </Link>
          .
        </p>
      </header>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section
          aria-labelledby="calendar-heading"
          className="order-1 rounded-xl border border-border bg-surface p-4 shadow-sm lg:col-start-1 lg:row-start-1"
        >
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 id="calendar-heading" className="text-xl font-semibold">
              {monthTitle(ref)}
            </h2>
            <div className="flex items-center gap-1">
              <Link
                href={recurringHref({
                  month: monthParam(shiftMonth(ref, -1)),
                  hideCancelled,
                  q: initialQuery !== '' ? initialQuery : undefined,
                  scheduleId: focusedScheduleId ?? undefined,
                })}
                className="rounded border border-border-strong px-2.5 py-1 text-sm font-medium text-ink-body hover:bg-canvas"
              >
                ← Prev
              </Link>
              <Link
                href={recurringHref({
                  hideCancelled,
                  q: initialQuery !== '' ? initialQuery : undefined,
                  scheduleId: focusedScheduleId ?? undefined,
                })}
                className="rounded border border-border-strong px-2.5 py-1 text-sm font-medium text-ink-body hover:bg-canvas"
              >
                Today
              </Link>
              <Link
                href={recurringHref({
                  month: monthParam(shiftMonth(ref, 1)),
                  hideCancelled,
                  q: initialQuery !== '' ? initialQuery : undefined,
                  scheduleId: focusedScheduleId ?? undefined,
                })}
                className="rounded border border-border-strong px-2.5 py-1 text-sm font-medium text-ink-body hover:bg-canvas"
              >
                Next →
              </Link>
            </div>
          </div>
          <RecurringCalendarGrid
            days={days}
            month={monthParam(ref)}
            today={today}
            hideCancelled={hideCancelled}
          />
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-muted">
            <span>
              <span className="mr-1 inline-block h-2 w-2 rounded-full bg-marker-muted" />
              outgo (direct debit / standing order)
            </span>
            <span>
              <span className="mr-1 inline-block h-2 w-2 rounded-full bg-positive-500" />
              receipt (income)
            </span>
            <span>
              <span className="mr-1 inline-block h-2 w-2 rounded-full border border-marker-muted bg-surface" />
              not converted yet
            </span>
          </div>
        </section>

        <RecurringScheduleSection
          schedules={scheduleRows}
          pots={pots.map(({ id, label }) => ({ id, label }))}
          categories={categoryOptions}
          suppliers={suppliers.map(({ id, name }) => ({ id, name }))}
          people={people.map(({ id, label }) => ({ id, label }))}
          vehicles={vehicles.map(({ id, label }) => ({ id, label }))}
          recurringData={recurringData}
          month={monthParam(ref)}
          initialHideCancelled={hideCancelled}
          initialQuery={initialQuery}
          initialFocusedScheduleId={focusedScheduleId}
          today={today}
        />

        <section
          aria-labelledby="agreements-heading"
          className="order-3 rounded-xl border border-border bg-surface p-4 shadow-sm lg:order-4 lg:col-start-2 lg:row-start-2"
        >
          <h2 id="agreements-heading" className="mb-2 text-lg font-semibold">
            Contracts &amp; policies
          </h2>
          <p className="mb-3 text-sm text-ink-soft">
            Track suppliers, insurance policies, renewal dates and fee-free switch dates in the
            agreement register. Payment schedules stay here and can be linked to an agreement.
          </p>
          <Link
            href="/contracts"
            className="inline-flex rounded border border-border-strong px-3 py-2 text-sm font-medium text-ink-body hover:bg-canvas"
          >
            Open Contracts &amp; Renewals →
          </Link>
        </section>

        <section
          aria-labelledby="projection-figures-heading"
          className="order-4 rounded-xl border border-border bg-surface p-4 shadow-sm lg:order-3 lg:col-start-1 lg:row-start-2"
        >
          <h2 id="projection-figures-heading" className="text-base font-semibold">
            Projection figures
          </h2>
          <p className="mb-3 text-sm text-ink-soft">
            What you expect to spend on weekly food and monthly fuel. These figures shape the
            cash-flow projection on the Horizon page, and the honesty loop compares them with recent
            actuals.
          </p>
          <ProjectionSettingsForm data={recurringData.projectionSettings} />
        </section>
      </div>
    </main>
  );
}
