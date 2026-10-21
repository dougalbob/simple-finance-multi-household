import Link from 'next/link';
import { redirect } from 'next/navigation';
import { RecentEntryActions } from '@/components/record-forms';
import { AttachmentForm } from '@/components/attachment-form';
import { FuelDetailsForm, type FuelDetailsFormProps } from '@/components/fuel-details-form';
import { PurchaseFilterForm } from '@/components/purchase-filter-form';
import { OpenTaskList, TaskCreateForm } from '@/components/task-forms';
import { listAuditForEntity, type AuditEntry } from '@/lib/audit';
import { formatPence } from '@/lib/money';
import { householdContextFromRequest } from '@/lib/auth/next';
import { categoryTree } from '@/lib/records/categories';
import { buildEntryData } from '@/lib/records/entry-view';
import { listPeople } from '@/lib/records/people';
import { listPots } from '@/lib/records/pots';
import {
  listPurchases,
  refundOriginalsById,
  refundSummariesForPurchases,
  sumListedPurchasesPence,
  type PurchaseFilters,
  type PurchaseRefundSummary,
} from '@/lib/records/purchases';
import { listSuppliersForEntry } from '@/lib/records/suppliers';
import { supplierCardHref } from '@/lib/records/supplier-focus';
import { targetLabel, targetNames } from '@/lib/records/targets';
import { listStoredAttachments, type StoredAttachment } from '@/lib/records/attachments';
import { fuelRowDetails, getFuelRowContext } from '@/lib/records/fuel';
import { getTasksBySubject, type TaskRowView } from '@/lib/records/tasks-view';
import { listVehicles } from '@/lib/records/vehicles';
import { formatInstantLocal, toLocalDateString } from '@/lib/time';

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

interface SearchParams {
  from?: string;
  to?: string;
  potId?: string;
  supplierId?: string;
  /** Repeatable (v0.14.0): a chart bar links with one id per child. */
  categoryId?: string | string[];
  targetKind?: string;
  targetId?: string;
  paidByPersonId?: string;
  scheduleOnly?: string;
  refundsOnly?: string;
  voidedOnly?: string;
  /** Show toggles (decision 205); repeated when the hidden 0 + ticked 1 both submit — last wins. */
  showSchedule?: string | string[];
  showPurchases?: string | string[];
  showRefunds?: string | string[];
  showVoided?: string | string[];
}

function lastValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[value.length - 1] : value;
}

function showValue(value: string | string[] | undefined, fallback: boolean): boolean {
  const raw = lastValue(value);
  return raw === undefined ? fallback : raw !== '0';
}

function toNumber(value: string | undefined): number | undefined {
  if (value === undefined || value === '') return undefined;
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : undefined;
}

function toNumbers(value: string | string[] | undefined): number[] {
  const raw = value === undefined ? [] : Array.isArray(value) ? value : [value];
  return raw.flatMap((entry) => {
    const n = toNumber(entry);
    return n === undefined ? [] : [n];
  });
}

export default async function PurchasesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const user = await householdContextFromRequest();
  if (user === null) redirect('/unauthorized');

  const db = user.db;
  const now = new Date();
  const today = toLocalDateString(now);
  const params = await searchParams;

  // A category link may name a parent (a chart bar covers all of its
  // children) and may name several at once. Expand parents against the live
  // tree, then filter on the resulting leaves — allocations only ever point
  // at a leaf, so an unexpanded parent id would match nothing at all.
  const tree = categoryTree(db);
  const childrenOfParent = new Map(
    tree.map((parent) => [parent.id, parent.children.map((child) => child.id)] as const),
  );
  const requestedCategoryIds = toNumbers(params.categoryId);
  const resolvedCategoryIds = [
    ...new Set(requestedCategoryIds.flatMap((id) => childrenOfParent.get(id) ?? [id])),
  ];

  // Show toggles (decision 205): all four kinds show by default. Legacy
  // `…Only` deep links (charts, tasks) keep their old meaning when no show
  // toggle was submitted: scheduleOnly hides non-scheduled records, and a
  // legacy-only visit still hides voided records unless voidedOnly is set.
  const hasShowParams =
    params.showSchedule !== undefined ||
    params.showPurchases !== undefined ||
    params.showRefunds !== undefined ||
    params.showVoided !== undefined;
  const hasLegacyOnly =
    params.scheduleOnly === '1' || params.refundsOnly === '1' || params.voidedOnly === '1';
  let showPurchases = showValue(params.showPurchases, true);
  if (!hasShowParams && params.scheduleOnly === '1') showPurchases = false;
  const showSchedule = showValue(params.showSchedule, true);
  const showRefunds = showValue(params.showRefunds, true);
  const showVoided = showValue(params.showVoided, hasLegacyOnly ? params.voidedOnly === '1' : true);

  const filters: PurchaseFilters = {
    potId: toNumber(params.potId),
    supplierId: toNumber(params.supplierId),
    categoryId: resolvedCategoryIds.length === 1 ? resolvedCategoryIds[0] : undefined,
    categoryIds: resolvedCategoryIds.length > 1 ? resolvedCategoryIds : undefined,
    targetKind:
      params.targetKind === 'person' ||
      params.targetKind === 'vehicle' ||
      params.targetKind === 'household'
        ? params.targetKind
        : undefined,
    targetId: toNumber(params.targetId),
    paidByPersonId: toNumber(params.paidByPersonId),
    dateFrom: params.from || undefined,
    dateTo: params.to || undefined,
    scheduleOnly: params.scheduleOnly === '1',
    refundsOnly: params.refundsOnly === '1',
    voidedOnly: params.voidedOnly === '1',
    includeVoided: showVoided,
    excludeScheduled: !showSchedule,
    excludePurchases: !showPurchases,
    excludeRefunds: !showRefunds,
    limit: 500,
  };

  const purchases = listPurchases(db, filters);
  const shownTotalPence = sumListedPurchasesPence(purchases);

  const pots = listPots(db);
  const people = listPeople(db);
  const vehicles = listVehicles(db);
  const names = targetNames({ people, vehicles });
  const suppliers = listSuppliersForEntry(db);
  const entryData = buildEntryData(db, now, user.email);
  const categoryNames = new Map(
    tree.flatMap((parent) =>
      parent.children.map((child) => [child.id, `${parent.name} / ${child.name}`] as const),
    ),
  );
  // The filter select offers every parent as "all children", so a link from a
  // chart (which filters by parent) round-trips through the form unchanged.
  const filterCategories = tree.flatMap((parent) => [
    { id: parent.id, parentName: parent.name, childName: 'all children' },
    ...parent.children
      .filter((child) => child.retiredAt === null)
      .map((child) => ({ id: child.id, parentName: parent.name, childName: child.name })),
  ]);
  const potNames = new Map(pots.map((pot) => [pot.id, pot.label]));
  const supplierNames = new Map(suppliers.map((supplier) => [supplier.id, supplier.name]));
  const personNames = new Map(people.map((person) => [person.id, person.label]));
  const fuelContext = getFuelRowContext(db);
  // "Chase the refund" (decision 175): open tasks about each listed purchase.
  const tasksByPurchase = getTasksBySubject(db, 'purchase', now);
  // Refund signposting (issue #96): an original says how much has already
  // come back against it, and a refund names the purchase it belongs to —
  // so a second household member does not process the same refund again
  // simply because neither row mentioned the other.
  const refundSummaries = refundSummariesForPurchases(
    db,
    purchases
      .filter(({ purchase }) => purchase.refundOfPurchaseId === null)
      .map(({ purchase }) => purchase.id),
  );
  const refundOriginalRecords = refundOriginalsById(
    db,
    purchases.flatMap(({ purchase }) =>
      purchase.refundOfPurchaseId === null ? [] : [purchase.refundOfPurchaseId],
    ),
  );
  const refundOriginals = new Map(
    [...refundOriginalRecords].map(([id, original]) => [
      id,
      {
        id: original.id,
        totalPence: original.totalPence,
        occurredAt: original.occurredAt,
        occurredDate: original.occurredDate,
        potId: original.potId,
        supplierLabel:
          original.supplierId !== null
            ? (supplierNames.get(original.supplierId) ?? 'Unknown supplier')
            : 'Unknown supplier',
      },
    ]),
  );

  return (
    <main className="mx-auto max-w-7xl px-4 py-6 sm:py-8">
      <header className="mb-6">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">Purchases</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">Every recorded purchase</h1>
        <p className="mt-1 text-sm text-ink-soft">
          Filter, review and correct entries. Voids and refunds are kept in the history — a purchase
          record is never deleted. A receipt can be removed; that removal is in the history, and an
          older backup is the only way to get the file back.
        </p>
      </header>

      <PurchaseFilterForm
        pots={pots.map((pot) => ({ id: pot.id, label: pot.label }))}
        suppliers={suppliers.map((supplier) => ({ id: supplier.id, name: supplier.name }))}
        people={people.map((person) => ({ id: person.id, label: person.label }))}
        vehicles={vehicles.map((vehicle) => ({ id: vehicle.id, label: vehicle.label }))}
        categories={filterCategories}
        active={{
          ...params,
          showSchedule: showSchedule ? '1' : '0',
          showPurchases: showPurchases ? '1' : '0',
          showRefunds: showRefunds ? '1' : '0',
          showVoided: showVoided ? '1' : '0',
          categoryId: requestedCategoryIds[0]?.toString(),
        }}
      />

      <section aria-labelledby="results-heading" className="mt-6">
        <div className="mb-1 flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between sm:gap-3">
          <h2 id="results-heading" className="text-xl font-semibold">
            {purchases.length} {purchases.length === 1 ? 'entry' : 'entries'}: Total{' '}
            <span className="whitespace-nowrap tabular-nums">{formatPence(shownTotalPence)}</span>
          </h2>
          <span className="text-xs text-ink-muted">
            Newest first · line items shown receipt-style
          </span>
        </div>
        <p className="mb-3 text-xs text-ink-muted">
          Net of refunds; voided history adds nothing. Total covers the rows shown (up to 500 newest
          matches).
        </p>
        {purchases.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border-strong bg-surface p-6 text-sm text-ink-soft">
            Nothing matches these filters. Clear the filters to see the full history.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-border bg-surface shadow-sm">
            <table className="w-full min-w-[860px] text-sm">
              <thead className="bg-surface-muted text-left text-xs uppercase tracking-wide text-ink-muted">
                <tr>
                  <th className="px-3 py-2">When</th>
                  <th className="px-3 py-2">Supplier</th>
                  <th className="px-3 py-2">Lines</th>
                  <th className="px-3 py-2">Pot</th>
                  <th className="px-3 py-2">Paid by</th>
                  <th className="px-3 py-2 text-right">Total</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {purchases.map(({ purchase, allocations }, rowIndex) => (
                  <PurchaseRow
                    key={purchase.id}
                    rowIndex={rowIndex}
                    supplierId={purchase.supplierId}
                    purchaseId={purchase.id}
                    totalPence={purchase.totalPence}
                    occurredAt={purchase.occurredAt}
                    occurredDate={toLocalDateString(new Date(purchase.occurredAt))}
                    paidVia={purchase.paidVia}
                    supplierLabel={
                      purchase.supplierId !== null
                        ? (supplierNames.get(purchase.supplierId) ?? 'Unknown supplier')
                        : 'Unknown supplier'
                    }
                    potId={purchase.potId}
                    potLabel={potNames.get(purchase.potId) ?? 'Pot'}
                    paidByLabel={
                      purchase.paidByPersonId !== null
                        ? (personNames.get(purchase.paidByPersonId) ?? 'Someone')
                        : '—'
                    }
                    lines={allocations.map((line) => ({
                      label: categoryNames.get(line.categoryId) ?? 'Category',
                      targetLabel: targetLabel(line, names),
                      amountPence: line.amountPence,
                      categoryId: line.categoryId,
                      targetKind: line.targetKind,
                      targetId: line.targetId,
                    }))}
                    attachments={listStoredAttachments(db, purchase.id)}
                    fuel={fuelRowDetails(fuelContext, purchase, allocations)}
                    history={listAuditForEntity(db, 'purchase', purchase.id)}
                    openTasks={tasksByPurchase.get(purchase.id)?.open ?? []}
                    fromSchedule={purchase.scheduleInstanceId !== null}
                    isRefund={purchase.refundOfPurchaseId !== null}
                    refundSummary={refundSummaries.get(purchase.id) ?? null}
                    refundOriginal={
                      purchase.refundOfPurchaseId === null
                        ? null
                        : (refundOriginals.get(purchase.refundOfPurchaseId) ?? null)
                    }
                    voidedAt={purchase.voidedAt}
                    voidReason={purchase.voidReason}
                    note={purchase.note ?? ''}
                    version={purchase.version}
                    people={people.map(({ id, label }) => ({ id, label }))}
                    vehicles={vehicles.map(({ id, label }) => ({ id, label }))}
                    categories={entryData.categories}
                    today={today}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}

interface PurchaseRowProps {
  purchaseId: number;
  rowIndex: number;
  supplierId: number | null;
  totalPence: number;
  occurredAt: Date;
  occurredDate: string;
  supplierLabel: string;
  potId: number;
  potLabel: string;
  paidByLabel: string;
  lines: Array<{
    label: string;
    targetLabel: string;
    amountPence: number;
    categoryId: number;
    targetKind: 'household' | 'person' | 'vehicle';
    targetId: number | null;
  }>;
  fromSchedule: boolean;
  isRefund: boolean;
  /** Live refunds against this original; null when none (and on refund rows). */
  refundSummary: PurchaseRefundSummary | null;
  /** For a refund row: the purchase this money came back against. */
  refundOriginal: {
    id: number;
    totalPence: number;
    occurredAt: Date;
    occurredDate: string;
    potId: number;
    supplierLabel: string;
  } | null;
  voidedAt: Date | null;
  voidReason: string | null;
  note: string;
  paidVia: string | null;
  version: number;
  attachments: StoredAttachment[];
  /** Odometer, litres and mpg — fuel purchases only (v0.10.0). */
  fuel: FuelDetailsFormProps | null;
  history: AuditEntry[];
  /** Open tasks about this purchase — "Chase the refund" (v0.25.0). */
  openTasks: TaskRowView[];
  people: Array<{ id: number; label: string }>;
  vehicles: Array<{ id: number; label: string }>;
  categories: Array<{ id: number; parentName: string; childName: string }>;
  today: string;
}

function PurchaseRow(props: PurchaseRowProps) {
  const status =
    props.voidedAt !== null
      ? `Voided · ${props.voidReason ?? 'no reason'}`
      : props.fromSchedule
        ? 'From schedule'
        : props.isRefund
          ? props.refundOriginal !== null
            ? `Refund · for #${props.refundOriginal.id}`
            : 'Refund'
          : 'Active';
  const refundedPence = props.refundSummary?.refundedPence ?? 0;
  const remainingRefundablePence = Math.max(Math.abs(props.totalPence) - refundedPence, 0);
  const refundState =
    !props.isRefund && refundedPence > 0
      ? remainingRefundablePence === 0
        ? 'Fully refunded'
        : `${formatPence(refundedPence)} refunded`
      : null;
  const statusClass =
    props.voidedAt !== null
      ? 'bg-surface-muted text-ink-muted'
      : props.isRefund
        ? 'bg-danger-50 text-danger'
        : props.fromSchedule
          ? 'bg-accent-50 text-accent'
          : 'bg-positive-50 text-positive';
  return (
    <tr
      id={`purchase-${props.purchaseId}`}
      className={`sf-anchor border-t border-border-hairline align-top ${props.rowIndex % 2 === 1 ? 'bg-canvas' : ''} ${props.voidedAt !== null ? 'text-ink-faint' : ''}`}
    >
      <td className="whitespace-nowrap px-3 py-2.5">{formatInstantLocal(props.occurredAt)}</td>
      <td className="px-3 py-2.5">
        {props.supplierId !== null ? (
          <Link
            href={supplierCardHref(props.supplierId)}
            className={`sf-link ${props.voidedAt !== null ? 'line-through' : 'font-medium'}`}
          >
            {props.supplierLabel}
          </Link>
        ) : (
          <span
            className={props.voidedAt !== null ? 'line-through' : 'font-medium text-ink-emphasis'}
          >
            {props.paidVia ? `via ${props.paidVia}` : props.supplierLabel}
          </span>
        )}
        {props.supplierId !== null && props.paidVia ? (
          <span className="ml-1.5 text-xs text-ink-soft">· via {props.paidVia}</span>
        ) : null}
        {props.note !== '' ? <p className="mt-0.5 text-xs text-ink-muted">{props.note}</p> : null}
        {props.isRefund && props.refundOriginal !== null ? (
          <p className="mt-1 text-xs text-ink-soft">
            <strong className="font-medium text-ink-body">Refund for</strong>{' '}
            <Link
              href={`/purchases?potId=${props.refundOriginal.potId}&from=${props.refundOriginal.occurredDate}&to=${props.refundOriginal.occurredDate}#purchase-${props.refundOriginal.id}`}
              className="sf-link"
            >
              purchase #{props.refundOriginal.id} · {props.refundOriginal.supplierLabel}
            </Link>{' '}
            · {formatInstantLocal(props.refundOriginal.occurredAt)} ·{' '}
            {formatPence(props.refundOriginal.totalPence)}
          </p>
        ) : null}
        {!props.isRefund && props.refundSummary !== null && refundedPence > 0 ? (
          <div className="mt-1.5 text-xs text-ink-soft">
            <p>
              <strong className="font-medium text-ink-body">Refund recorded:</strong>{' '}
              {formatPence(refundedPence)} back
              {remainingRefundablePence > 0
                ? ` · ${formatPence(remainingRefundablePence)} still refundable`
                : ' · fully refunded'}
              .
            </p>
            <ul className="mt-0.5 space-y-0.5">
              {props.refundSummary.refunds.map((refund) => (
                <li key={refund.id}>
                  <Link
                    href={`/purchases?potId=${refund.potId}&from=${refund.occurredDate}&to=${refund.occurredDate}#purchase-${refund.id}`}
                    className="sf-link"
                  >
                    Refund #{refund.id}
                  </Link>{' '}
                  · {formatPence(refund.amountPence)} · {formatInstantLocal(refund.occurredAt)}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {props.fuel !== null ? <FuelDetailsForm {...props.fuel} /> : null}
        <AttachmentForm purchaseId={props.purchaseId} attachments={props.attachments} />
        {props.openTasks.length > 0 ? (
          <div className="mt-1.5 max-w-md text-ink-body">
            <p className="mb-1 text-xs font-medium text-ink-muted">Tasks</p>
            <OpenTaskList tasks={props.openTasks} showSubject={false} />
          </div>
        ) : null}
        {props.voidedAt === null ? (
          <details className="mt-1">
            <summary className="cursor-pointer text-xs font-medium text-ink-muted hover:text-ink-emphasis">
              Add a task
            </summary>
            <div className="mt-1 max-w-md">
              <TaskCreateForm
                idPrefix={`purchase-${props.purchaseId}-task`}
                subject={`purchase:${props.purchaseId}`}
                titlePlaceholder="e.g. Chase the refund"
              />
            </div>
          </details>
        ) : null}
        <details className="mt-1">
          <summary className="cursor-pointer text-xs font-medium text-ink-muted hover:text-ink-emphasis">
            History
          </summary>
          {props.history.length === 0 ? (
            <p className="mt-1 text-xs text-ink-muted">No history recorded.</p>
          ) : (
            <ul className="mt-1 space-y-1" aria-label={`History for purchase ${props.purchaseId}`}>
              {props.history.map((entry) => (
                <li key={entry.id} className="text-xs text-ink-soft">
                  <span className="font-medium text-ink-body">{entry.summary}</span>
                  <span className="block text-ink-muted">
                    {entry.actor} · {formatInstantLocal(entry.createdAt)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </details>
      </td>
      <td className="px-3 py-2.5">
        <ul className="space-y-0.5">
          {props.lines.map((line, index) => (
            <li key={index} className="text-xs">
              <span className={props.voidedAt !== null ? 'line-through' : ''}>{line.label}</span>
              <span className="ml-1 text-ink-faint">({line.targetLabel})</span>
              <span className="ml-2 tabular-nums">{formatPence(line.amountPence)}</span>
            </li>
          ))}
        </ul>
      </td>
      <td className="whitespace-nowrap px-3 py-2.5 text-ink-soft">{props.potLabel}</td>
      <td className="whitespace-nowrap px-3 py-2.5 text-ink-soft">{props.paidByLabel}</td>
      <td className="whitespace-nowrap px-3 py-2.5 text-right font-semibold tabular-nums">
        {formatPence(props.totalPence)}
      </td>
      <td className="whitespace-nowrap px-3 py-2.5">
        <div className="flex flex-col items-start gap-1">
          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusClass}`}>
            {status}
          </span>
          {refundState !== null ? (
            <span className="rounded-full bg-accent-50 px-2 py-0.5 text-xs font-semibold text-accent">
              {refundState}
            </span>
          ) : null}
        </div>
      </td>
      <td className="px-3 py-2.5">
        {props.voidedAt === null ? (
          <details className="inline-block">
            <summary className="cursor-pointer text-xs font-medium text-ink-soft hover:text-ink">
              Edit
            </summary>
            <div className="mt-2 w-80 max-w-[calc(100vw-2.5rem)] sm:w-96">
              <RecentEntryActions
                purchaseId={props.purchaseId}
                potId={props.potId}
                expectedVersion={props.version}
                occurredDate={props.occurredDate}
                note={props.note}
                paidVia={props.paidVia}
                lines={props.lines.map((line) => ({
                  amountPence: line.amountPence,
                  categoryId: line.categoryId,
                  targetKind: line.targetKind,
                  targetId: line.targetId,
                  categoryLabel: line.label,
                  spentForLabel: line.targetLabel,
                }))}
                people={props.people}
                vehicles={props.vehicles}
                categories={props.categories}
                today={props.today}
                summary={`${props.supplierLabel}, ${formatPence(props.totalPence)}`}
                isRefund={props.isRefund}
                refundOfPurchaseId={props.refundOriginal?.id ?? null}
                existingRefunds={(props.refundSummary?.refunds ?? []).map((refund) => ({
                  id: refund.id,
                  amountPence: refund.amountPence,
                  occurredDate: refund.occurredDate,
                }))}
              />
            </div>
          </details>
        ) : (
          <span className="text-xs text-ink-faint">history kept</span>
        )}
      </td>
    </tr>
  );
}
