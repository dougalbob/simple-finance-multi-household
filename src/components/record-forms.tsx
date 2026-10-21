'use client';

import Link from 'next/link';
import { useActionState, useState, type ReactNode } from 'react';
import {
  addRefundAction,
  addTransferAction,
  editTransferAction,
  editPurchaseAction,
  voidExternalMovementAction,
  voidPurchaseAction,
  voidReceiptAction,
  voidTransferAction,
} from '@/app/actions';
import { initialActionState } from '@/lib/action-state';
import { formatPence, penceInput } from '@/lib/money';

export interface EntryLineState {
  amount: string;
  categoryId: number;
  targetKind: 'household' | 'person' | 'vehicle';
  targetId: number | null;
  /**
   * Refund lines only (issue #96): what this line cost on the original
   * purchase. It is shown only as the amount box's placeholder
   * ("Originally £X"); the box itself starts blank, so any figure the
   * household submits is one they explicitly typed as money refunded.
   * Never submitted — `RefundForm` maps entered lines to the action's shape.
   */
  originalPence?: number;
  /**
   * Read-only line identity for refund editors, where category and target
   * are fixed by the original purchase and their select controls are not
   * rendered at all (issue #96). Labels rather than ids because the
   * editor's live category options may no longer include a retired leaf.
   */
  categoryLabel?: string;
  spentForLabel?: string;
}

interface TargetOption {
  id: number;
  label: string;
}

interface CategoryOption {
  id: number;
  parentName: string;
  childName: string;
}

export function poundsToPence(value: string): { pence: number | null; error: string | null } {
  const trimmed = value.trim();
  if (trimmed === '') return { pence: null, error: 'An amount is required.' };
  const match = /^£?\s*(-)?(\d{1,9})([.,](\d{1,2}))?$/.exec(trimmed);
  if (match === null) {
    return { pence: null, error: `“${trimmed}” is not a valid amount (use e.g. 12.50).` };
  }
  const sign = match[1] === '-' ? -1 : 1;
  const pounds = Number(match[2]);
  const decimals = match[4] === undefined ? 0 : Number(match[4].padEnd(2, '0'));
  const pence = sign * (pounds * 100 + decimals);
  if (pence === 0) return { pence: null, error: 'Amount must be more than zero.' };
  return { pence, error: null };
}

function FormMessage({ status, message }: { status: string; message: string | null }) {
  if (message === null) return null;
  return (
    <p
      role="status"
      aria-live="polite"
      className={status === 'error' ? 'text-sm text-danger' : 'text-sm text-positive'}
    >
      {message}
    </p>
  );
}

const inputClass =
  'rounded border border-border-strong bg-surface px-2.5 py-1.5 text-sm focus:border-border-emphasis focus:outline-none';
/** Line-editor controls sit a touch shorter (decision 205): the two-row line layout earns its room back here. */
const lineInputClass =
  'w-full min-w-0 rounded border border-border-strong bg-surface px-2.5 py-1 text-sm focus:border-border-emphasis focus:outline-none';
const labelClass = 'text-xs font-medium text-ink-soft';
const submitClass =
  'rounded bg-till px-3 py-1.5 text-sm font-medium text-till-ink disabled:opacity-60';
/**
 * Destructive submit. Deliberately self-contained rather than
 * `${submitClass} … text-danger`: Tailwind resolves competing utilities by
 * their order in the *generated stylesheet*, not by the order in the class
 * attribute, and `.text-till-ink` is emitted after `.text-danger` (verified
 * again in the token build, decision 159) — so layering a colour override on
 * top of `submitClass` produced ink-on-ink (and a 1.09:1 label on hover).
 * Danger label on a surface at rest, inverting to a saturated danger
 * background with a `fill-ink` label on hover (6.42:1 — WCAG AA), which also
 * keeps it legible on a touch screen where `:hover` never applies. `fill-ink`
 * rather than `till-ink` because a dark theme paints the danger fill bright
 * and writes on it in near-black; it is white in every light theme, so this
 * button is unchanged there (decision 160).
 */
const dangerSubmitClass =
  'rounded border border-danger-300 bg-surface px-3 py-1.5 text-sm font-medium text-danger hover:border-danger hover:bg-danger hover:text-fill-ink disabled:opacity-60';

interface LineEditorProps {
  idPrefix: string;
  lines: EntryLineState[];
  setLines: (lines: EntryLineState[]) => void;
  categories: CategoryOption[];
  people: TargetOption[];
  vehicles: TargetOption[];
  allowEmptyCategory?: boolean;
  /** "Amount" on a purchase edit; the household's explicit refund wording on a refund. */
  amountLabel?: ReactNode;
  /** "Spent for" on a purchase edit; "Originally spent for" on a refund. */
  targetLabel?: string;
  /** Remove-button wording for editors where a line may leave. */
  removeLineLabel?: string;
  /** A purchase edit may add/remove split lines; a refund only enters amounts on the original lines. */
  allowAddLine?: boolean;
  allowRemoveLines?: boolean;
  /** Blank is meaningful on a refund: no money came back for that line. */
  amountRequired?: boolean;
  /**
   * Refund creation/edit only: category and target are inherited from the
   * original purchase, so render them as a read-only line heading and
   * offer no Spent for / Category / Which controls to change them.
   */
  lockLineIdentity?: boolean;
}

/**
 * Shared line editor for purchase edits/refunds (blueprint: same line rules
 * everywhere — total must equal the sum of the lines, enforced server-side;
 * this UI only keeps the input tidy). Purchase-edit lines can be removed
 * as well as added (issue #96): until now a split line could never leave a
 * purchase edit even though a £0 line is rejected everywhere ("remove it
 * or give it an amount", splits.ts). A refund deliberately offers neither
 * add nor remove and locks each line's identity: its lines are the
 * original purchase's lines, shown by category and target as read-only
 * headings, with only the refunded amount editable.
 */
function LineEditor({
  idPrefix,
  lines,
  setLines,
  categories,
  people,
  vehicles,
  amountLabel = 'Amount',
  targetLabel = 'Spent for',
  removeLineLabel = 'Remove line',
  allowAddLine = true,
  allowRemoveLines = true,
  amountRequired = true,
  lockLineIdentity = false,
}: LineEditorProps) {
  const updateLine = (index: number, patch: Partial<EntryLineState>) => {
    setLines(lines.map((line, i) => (i === index ? { ...line, ...patch } : line)));
  };
  const removeLine = (index: number) => {
    setLines(lines.filter((_, i) => i !== index));
  };

  return (
    <div className="flex flex-col gap-2">
      {lines.map((line, index) => {
        const personMatches = line.targetKind === 'person';
        const vehicleMatches = line.targetKind === 'vehicle';
        const categoryOption = categories.find((category) => category.id === line.categoryId);
        const lineCategoryLabel =
          line.categoryLabel ??
          (categoryOption !== undefined
            ? `${categoryOption.parentName} / ${categoryOption.childName}`
            : 'Category');
        const lineSpentForLabel =
          line.spentForLabel ??
          (line.targetKind === 'household'
            ? 'household'
            : line.targetKind === 'person'
              ? (people.find((person) => person.id === line.targetId)?.label ?? 'person')
              : (vehicles.find((vehicle) => vehicle.id === line.targetId)?.label ?? 'vehicle'));
        return (
          <div key={index} className="grid grid-cols-2 items-end gap-2 rounded-lg bg-canvas p-2">
            {lockLineIdentity ? (
              <div className="col-span-2 min-w-0">
                <p className="text-sm font-medium text-ink-body">
                  {lineCategoryLabel}{' '}
                  <span className="font-normal text-ink-faint">({lineSpentForLabel})</span>
                </p>
              </div>
            ) : (
              <div className="flex min-w-0 flex-col gap-1">
                <label htmlFor={`${idPrefix}-target-${index}`} className={labelClass}>
                  {targetLabel}
                </label>
                <select
                  id={`${idPrefix}-target-${index}`}
                  value={line.targetKind}
                  onChange={(event) => {
                    const targetKind = event.target.value as EntryLineState['targetKind'];
                    updateLine(index, { targetKind, targetId: null });
                  }}
                  className={lineInputClass}
                >
                  <option value="household">Household (shared)</option>
                  <option value="person">Person</option>
                  <option value="vehicle">Vehicle</option>
                </select>
              </div>
            )}
            <div className={`${lockLineIdentity ? 'col-span-2 ' : ''}flex min-w-0 flex-col gap-1`}>
              <label htmlFor={`${idPrefix}-amount-${index}`} className={labelClass}>
                {amountLabel}
              </label>
              <input
                id={`${idPrefix}-amount-${index}`}
                type="text"
                inputMode="decimal"
                required={amountRequired}
                placeholder={
                  line.originalPence !== undefined
                    ? `Originally ${formatPence(Math.abs(line.originalPence))}`
                    : undefined
                }
                value={line.amount}
                onChange={(event) => updateLine(index, { amount: event.target.value })}
                className={lineInputClass}
              />
            </div>
            {!lockLineIdentity ? (
              <div className="col-span-2 flex min-w-0 flex-col gap-1">
                <label htmlFor={`${idPrefix}-category-${index}`} className={labelClass}>
                  Category
                </label>
                <select
                  id={`${idPrefix}-category-${index}`}
                  required
                  value={String(line.categoryId)}
                  onChange={(event) =>
                    updateLine(index, { categoryId: Number(event.target.value) })
                  }
                  className={lineInputClass}
                >
                  <option value="" disabled>
                    Choose…
                  </option>
                  {categories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.parentName} / {category.childName}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}
            {!lockLineIdentity && (personMatches || vehicleMatches) ? (
              <div className="col-span-2 flex min-w-0 flex-col gap-1">
                <label htmlFor={`${idPrefix}-targetid-${index}`} className={labelClass}>
                  Which
                </label>
                <select
                  id={`${idPrefix}-targetid-${index}`}
                  required={personMatches || vehicleMatches}
                  value={line.targetId === null ? '' : String(line.targetId)}
                  onChange={(event) =>
                    updateLine(index, {
                      targetId: event.target.value === '' ? null : Number(event.target.value),
                    })
                  }
                  className={lineInputClass}
                >
                  <option value="" disabled>
                    Choose…
                  </option>
                  {(personMatches ? people : vehicles).map((target) => (
                    <option key={target.id} value={target.id}>
                      {target.label}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}
            {!lockLineIdentity && allowRemoveLines && lines.length > 1 ? (
              <div className="col-span-2 flex justify-end">
                <button
                  type="button"
                  onClick={() => removeLine(index)}
                  className="text-xs font-semibold text-danger underline underline-offset-2"
                >
                  {removeLineLabel}
                </button>
              </div>
            ) : null}
          </div>
        );
      })}
      {!lockLineIdentity && allowAddLine ? (
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() =>
              setLines([
                ...lines,
                {
                  amount: '',
                  categoryId: categories[0]?.id ?? 0,
                  targetKind: 'household',
                  targetId: null,
                },
              ])
            }
            className="text-xs font-medium text-ink-soft underline underline-offset-2 hover:text-ink"
          >
            Add a line
          </button>
        </div>
      ) : null}
    </div>
  );
}

export interface PurchaseEditFormProps {
  purchaseId: number;
  expectedVersion: number;
  occurredDate: string;
  note: string;
  paidVia?: string | null;
  lines: EntryLineState[];
  categories: CategoryOption[];
  people: TargetOption[];
  vehicles: TargetOption[];
  /**
   * Editing a refund record (issue #96): amounts stay positive magnitudes
   * in this form and are sent negative; category/target are inherited from
   * the original purchase and are not controls here.
   */
  isRefund?: boolean;
  refundOfPurchaseId?: number | null;
}

/**
 * Full-replacement edit of an ACTIVE purchase (blueprint: void + re-add is
 * the other path; editing a converted instance is never offered). The
 * same editor corrects a refund record, but with refund semantics: the
 * boxes hold positive amounts already refunded, submission converts them
 * back to the negative record, and each line's category/target is a fixed
 * heading inherited from the original purchase — there are no controls
 * with which to re-file a refund under another line.
 */
export function PurchaseEditForm(props: PurchaseEditFormProps) {
  const [lines, setLines] = useState<EntryLineState[]>(props.lines);
  const [state, formAction, pending] = useActionState(editPurchaseAction, initialActionState);
  const isRefund = props.isRefund === true;
  return (
    <form
      action={(formData: FormData) => {
        for (const [index, line] of lines.entries()) {
          const { pence, error } = poundsToPence(line.amount);
          if (pence === null || error !== null) {
            formData.set('clientError', `Line ${index + 1}: ${error}`);
            break;
          }
        }
        const submittedLines = isRefund
          ? lines.map((line) => {
              const { pence } = poundsToPence(line.amount);
              return {
                ...line,
                amount: pence === null ? line.amount : penceInput(-Math.abs(pence)),
              };
            })
          : lines;
        formData.set('linesJson', JSON.stringify(submittedLines));
        formAction(formData);
      }}
      className="flex flex-col gap-3"
    >
      {isRefund ? (
        <p className="text-sm text-ink-soft">
          Correct the amount <strong>refunded</strong>
          {props.refundOfPurchaseId ? (
            <>
              {' '}
              for purchase <strong>#{props.refundOfPurchaseId}</strong>
            </>
          ) : null}
          . Each line&apos;s category and who it was originally spent for are fixed by that purchase
          and are shown only to identify the line.
        </p>
      ) : null}
      <div className="flex flex-col gap-1">
        <label htmlFor={`edit-purchase-${props.purchaseId}-date`} className={labelClass}>
          {isRefund
            ? 'When the refund landed (blank keeps the current date)'
            : 'When it happened (blank keeps the current date)'}
        </label>
        <input
          id={`edit-purchase-${props.purchaseId}-date`}
          name="occurredDate"
          type="date"
          defaultValue={props.occurredDate}
          className={inputClass}
        />
      </div>
      <LineEditor
        idPrefix={`edit-purchase-${props.purchaseId}`}
        lines={lines}
        setLines={setLines}
        categories={props.categories}
        people={props.people}
        vehicles={props.vehicles}
        amountLabel={
          isRefund ? (
            <>
              Amount <strong>refunded</strong>
            </>
          ) : undefined
        }
        lockLineIdentity={isRefund}
        allowAddLine={!isRefund}
        allowRemoveLines={!isRefund}
      />
      <div className="flex flex-col gap-1">
        <label htmlFor={`edit-purchase-${props.purchaseId}-note`} className={labelClass}>
          Note (blank keeps the current note)
        </label>
        <input
          id={`edit-purchase-${props.purchaseId}-note`}
          name="note"
          type="text"
          maxLength={280}
          defaultValue={props.note}
          className={inputClass}
        />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor={`edit-purchase-${props.purchaseId}-paid-via`} className={labelClass}>
          Paid via / Bank payee (optional)
        </label>
        <input
          id={`edit-purchase-${props.purchaseId}-paid-via`}
          name="paidVia"
          type="text"
          maxLength={120}
          defaultValue={props.paidVia ?? ''}
          placeholder="e.g. James, PayPal (matches bank statement)"
          className={inputClass}
        />
      </div>
      <input type="hidden" name="purchaseId" value={props.purchaseId} />
      <input type="hidden" name="expectedVersion" value={props.expectedVersion} />
      <button type="submit" disabled={pending} className={`${submitClass} self-start`}>
        {pending ? 'Saving…' : isRefund ? 'Save refund' : 'Save purchase'}
      </button>
      <FormMessage status={state.status} message={state.message} />
    </form>
  );
}

export interface ExistingRefundView {
  id: number;
  /** Positive pence already returned by this live refund record. */
  amountPence: number;
  occurredDate: string;
}

export interface RefundFormProps {
  purchaseId: number;
  expectedVersion: number;
  /** The original's pot: a refund is money back into the account it left. */
  potId: number;
  occurredDate: string;
  note: string;
  lines: EntryLineState[];
  categories: CategoryOption[];
  people: TargetOption[];
  vehicles: TargetOption[];
  today: string;
  /** Live refunds already recorded against this purchase (issue #96). */
  existingRefunds?: ExistingRefundView[];
}

const REFUND_MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const;

/** `2026-10-21` as `21 Oct 2026`, without asking a timezone to reinterpret it. */
function formatRefundDate(value: string): string {
  const [year, month, day] = value.split('-').map(Number);
  if (
    year === undefined ||
    month === undefined ||
    day === undefined ||
    month < 1 ||
    month > REFUND_MONTHS.length
  ) {
    return value;
  }
  return `${day} ${REFUND_MONTHS[month - 1]} ${year}`;
}

/**
 * Refund form (negative purchase that links to its original, decision 37).
 * The original lines supply only their category/target and an "Originally
 * £X" placeholder; every amount box starts blank (issue #96, decision 252
 * as revised after the household rejected a pre-filled preview). A line
 * left blank has had no refund and is not submitted. Entered amounts are
 * positive refund magnitudes; the action flips their signs before calling
 * createRefund.
 *
 * The field names are the contract with `addRefundAction` (the same rule
 * `VoidForm` follows): the original is `refundOfPurchaseId` — *not*
 * `purchaseId`, which names a hidden field the action never reads — the pot
 * travels with the form, the total is an `amount` the household can read, and
 * the lines are whole pence (`amountPence`), because the action's schema reads
 * the till's own line shape, not the editor's typed text. Nothing here is
 * typed twice: the total is the sum of the entered lines, as SPEC §9.5
 * requires. Live refunds already against the purchase are named before the
 * boxes, so a second person can see what has already been processed and
 * how much of the original remains refundable.
 */
export function RefundForm(props: RefundFormProps) {
  const [lines, setLines] = useState<EntryLineState[]>(() =>
    props.lines.map((line) => ({ ...line, amount: '' })),
  );
  const [state, formAction, pending] = useActionState(addRefundAction, initialActionState);
  const originalTotalPence = props.lines.reduce(
    (sum, line) => sum + Math.abs(line.originalPence ?? poundsToPence(line.amount).pence ?? 0),
    0,
  );
  const existingRefunds = props.existingRefunds ?? [];
  const alreadyRefundedPence = existingRefunds.reduce(
    (sum, refund) => sum + Math.abs(refund.amountPence),
    0,
  );
  const remainingRefundablePence = Math.max(originalTotalPence - alreadyRefundedPence, 0);
  let refundTotalPence: number | null = 0;
  for (const line of lines) {
    if (line.amount.trim() === '') continue;
    const { pence } = poundsToPence(line.amount);
    if (pence === null) {
      refundTotalPence = null;
      break;
    }
    refundTotalPence += Math.abs(pence);
  }
  const blankLineCount = lines.filter((line) => line.amount.trim() === '').length;
  return (
    <form
      action={(formData: FormData) => {
        const entered = lines
          .map((line, index) => ({ line, index }))
          .filter(({ line }) => line.amount.trim() !== '');
        const pence = entered.map(({ line }) => Math.abs(poundsToPence(line.amount).pence ?? 0));
        for (const { line, index } of entered) {
          const { error } = poundsToPence(line.amount);
          if (error !== null) {
            formData.set('clientError', `Line ${index + 1}: ${error}`);
            break;
          }
        }
        formData.set(
          'linesJson',
          JSON.stringify(
            entered.map(({ line }, index) => ({
              amountPence: pence[index] ?? 0,
              categoryId: line.categoryId,
              targetKind: line.targetKind,
              targetId: line.targetKind === 'household' ? null : line.targetId,
            })),
          ),
        );
        formData.set('amount', penceInput(pence.reduce((sum, value) => sum + value, 0)));
        formAction(formData);
      }}
      className="flex flex-col gap-3"
    >
      {alreadyRefundedPence > 0 ? (
        <div
          role="status"
          className="rounded-lg border border-warning-300 bg-warning-50 px-3 py-2 text-sm text-warning-900"
        >
          <p>
            <strong>Refund already recorded for this purchase.</strong>{' '}
            {formatPence(alreadyRefundedPence)} has already been refunded, leaving{' '}
            {formatPence(remainingRefundablePence)} of the {formatPence(originalTotalPence)}{' '}
            purchase still refundable. Only enter additional money that has been refunded below.
          </p>
          <ul className="mt-1 list-inside list-disc text-xs">
            {existingRefunds.map((refund) => (
              <li key={refund.id}>
                Refund #{refund.id}: {formatPence(Math.abs(refund.amountPence))} on{' '}
                {formatRefundDate(refund.occurredDate)}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <p className="text-sm text-ink-soft">
        For any line item where there has been a refund, enter the <strong>refunded</strong> amount
        (not the amount that remains after the refund is applied). Leave any line with no refund
        blank.
      </p>
      <div className="flex flex-col gap-1">
        <label htmlFor={`refund-${props.purchaseId}-date`} className={labelClass}>
          When the refund landed
        </label>
        <input
          id={`refund-${props.purchaseId}-date`}
          name="occurredDate"
          type="date"
          required
          defaultValue={props.today}
          className={inputClass}
        />
      </div>
      <LineEditor
        idPrefix={`refund-${props.purchaseId}`}
        lines={lines}
        setLines={setLines}
        categories={props.categories}
        people={props.people}
        vehicles={props.vehicles}
        amountLabel={
          <>
            Enter the amount <strong>to be refunded</strong>
          </>
        }
        lockLineIdentity
        allowAddLine={false}
        allowRemoveLines={false}
        amountRequired={false}
      />
      {refundTotalPence !== null ? (
        <p aria-live="polite" className="text-sm font-medium text-ink-body">
          Refund total {formatPence(refundTotalPence)}
          {refundTotalPence > 0 && originalTotalPence > 0 ? (
            <span className="font-normal text-ink-soft">
              {' '}
              of the {formatPence(originalTotalPence)} paid
              {refundTotalPence === remainingRefundablePence
                ? alreadyRefundedPence > 0
                  ? ' — the rest of this purchase'
                  : ' — the whole purchase'
                : refundTotalPence < remainingRefundablePence
                  ? ' — a partial refund'
                  : ''}
            </span>
          ) : (
            <span className="font-normal text-ink-soft"> — no refund amounts entered yet</span>
          )}
        </p>
      ) : null}
      {refundTotalPence !== null &&
      remainingRefundablePence >= 0 &&
      refundTotalPence > remainingRefundablePence ? (
        <p className="text-sm text-danger">
          That is more than the {formatPence(remainingRefundablePence)} still refundable on this{' '}
          {formatPence(originalTotalPence)} purchase
          {alreadyRefundedPence > 0
            ? ` after the ${formatPence(alreadyRefundedPence)} already refunded`
            : ''}
          .
        </p>
      ) : null}
      {refundTotalPence !== null && refundTotalPence > 0 && blankLineCount > 0 ? (
        <p className="text-xs text-ink-muted">
          {blankLineCount === 1 ? 'The blank line' : `${blankLineCount} blank lines`} will not be
          included in this refund.
        </p>
      ) : null}
      <div className="flex flex-col gap-1">
        <label htmlFor={`refund-${props.purchaseId}-note`} className={labelClass}>
          Note (optional)
        </label>
        <input
          id={`refund-${props.purchaseId}-note`}
          name="note"
          type="text"
          maxLength={280}
          defaultValue={props.note}
          className={inputClass}
        />
      </div>
      <input type="hidden" name="refundOfPurchaseId" value={props.purchaseId} />
      <input type="hidden" name="potId" value={props.potId} />
      <input type="hidden" name="expectedVersion" value={props.expectedVersion} />
      <button
        type="submit"
        disabled={pending || remainingRefundablePence === 0}
        className={`${submitClass} self-start`}
      >
        {pending ? 'Saving…' : remainingRefundablePence === 0 ? 'Fully refunded' : 'Record refund'}
      </button>
      <FormMessage status={state.status} message={state.message} />
    </form>
  );
}

interface VoidFormProps {
  kind: 'purchase' | 'transfer' | 'external' | 'receipt';
  recordId: number;
  expectedVersion: number;
  summary: string;
}

/**
 * Generic void form (blueprint: every voidable record shows its void reason
 * field with the same rules). Voids never delete — the record stays in the
 * history with its reason and the actor (decision 6).
 */
export function VoidForm({ kind, recordId, expectedVersion, summary }: VoidFormProps) {
  const [state, formAction, pending] = useActionState(
    kind === 'purchase'
      ? voidPurchaseAction
      : kind === 'transfer'
        ? voidTransferAction
        : kind === 'receipt'
          ? voidReceiptAction
          : voidExternalMovementAction,
    initialActionState,
  );
  return (
    <form action={(formData: FormData) => formAction(formData)} className="flex flex-col gap-2">
      {/* Field names are the contract with the void actions:
          they read `recordId`, `expectedVersion` and `reason`. */}
      <input type="hidden" name="recordId" value={recordId} />
      <input type="hidden" name="expectedVersion" value={expectedVersion} />
      <div className="flex flex-col gap-1">
        <label htmlFor={`void-${kind}-${recordId}`} className={labelClass}>
          Why are you voiding this? ({summary})
        </label>
        <input
          id={`void-${kind}-${recordId}`}
          name="reason"
          type="text"
          required
          minLength={4}
          maxLength={280}
          placeholder="e.g. duplicate of the entry above"
          className={inputClass}
        />
      </div>
      <button type="submit" disabled={pending} className={`${dangerSubmitClass} self-start`}>
        {pending ? 'Voiding…' : `Void ${kind === 'receipt' ? 'income' : kind}`}
      </button>
      <FormMessage status={state.status} message={state.message} />
    </form>
  );
}

export interface EntryLineAmounts {
  amountPence: number;
  categoryId: number;
  targetKind: 'household' | 'person' | 'vehicle';
  targetId: number | null;
  categoryLabel?: string;
  spentForLabel?: string;
}

export interface RecentEntryActionsProps {
  purchaseId: number;
  /** The purchase's pot — a refund is money back into the account it left. */
  potId: number;
  expectedVersion: number;
  occurredDate: string;
  note: string;
  paidVia?: string | null;
  lines: EntryLineAmounts[];
  categories: CategoryOption[];
  people: TargetOption[];
  vehicles: TargetOption[];
  today: string;
  summary: string;
  /** True when this row is itself a refund — a refund of a refund is not offered. */
  isRefund?: boolean;
  /** For a refund row: the original purchase its line identities are fixed by. */
  refundOfPurchaseId?: number | null;
  /** Live refunds already recorded against this purchase, for signposting. */
  existingRefunds?: ExistingRefundView[];
}

const penceToAmountText = (pence: number): string => {
  const abs = Math.abs(pence);
  return `${Math.trunc(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
};

/**
 * Inline actions for a recent purchase row (overview + purchases pages):
 * full edit (line replacement), refund (blank amount boxes on the original
 * lines — only explicitly entered refund magnitudes are submitted), or
 * void (reason required). A refund record itself offers no Refund action,
 * and a purchase whose live refunds already cover it shows **Fully
 * refunded** instead of inviting the same money back a second time.
 */
export function RecentEntryActions(props: RecentEntryActionsProps) {
  const [mode, setMode] = useState<'none' | 'edit' | 'refund' | 'void'>('none');
  const editLines: EntryLineState[] = props.lines.map((line) => ({
    amount: penceToAmountText(line.amountPence),
    categoryId: line.categoryId,
    targetKind: line.targetKind,
    targetId: line.targetId,
    categoryLabel: line.categoryLabel,
    spentForLabel: line.spentForLabel,
  }));
  const refundLines: EntryLineState[] = props.lines.map((line) => ({
    amount: '',
    categoryId: line.categoryId,
    targetKind: line.targetKind,
    targetId: line.targetId,
    originalPence: line.amountPence,
    categoryLabel: line.categoryLabel,
    spentForLabel: line.spentForLabel,
  }));
  const purchaseTotalPence = props.lines.reduce((sum, line) => sum + Math.abs(line.amountPence), 0);
  const alreadyRefundedPence = (props.existingRefunds ?? []).reduce(
    (sum, refund) => sum + Math.abs(refund.amountPence),
    0,
  );
  const fullyRefunded =
    props.isRefund !== true && purchaseTotalPence > 0 && alreadyRefundedPence >= purchaseTotalPence;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setMode(mode === 'edit' ? 'none' : 'edit')}
          className="rounded border border-border-strong bg-surface px-2.5 py-1 text-xs font-medium text-ink-body hover:bg-canvas"
        >
          Edit
        </button>
        {props.isRefund === true ? null : fullyRefunded ? (
          <button
            type="button"
            disabled
            className="rounded border border-border-strong bg-surface-muted px-2.5 py-1 text-xs font-medium text-ink-muted disabled:cursor-not-allowed"
          >
            Fully refunded
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setMode(mode === 'refund' ? 'none' : 'refund')}
            className="rounded border border-border-strong bg-surface px-2.5 py-1 text-xs font-medium text-ink-body hover:bg-canvas"
          >
            Refund
          </button>
        )}
        <button
          type="button"
          onClick={() => setMode(mode === 'void' ? 'none' : 'void')}
          className="rounded border border-danger-200 bg-surface px-2.5 py-1 text-xs font-medium text-danger hover:bg-danger-50"
        >
          Void
        </button>
      </div>
      {mode === 'edit' ? (
        <PurchaseEditForm
          purchaseId={props.purchaseId}
          expectedVersion={props.expectedVersion}
          occurredDate={props.occurredDate}
          note={props.note}
          paidVia={props.paidVia}
          lines={editLines}
          categories={props.categories}
          people={props.people}
          vehicles={props.vehicles}
          isRefund={props.isRefund}
          refundOfPurchaseId={props.refundOfPurchaseId}
        />
      ) : null}
      {mode === 'refund' ? (
        <RefundForm
          purchaseId={props.purchaseId}
          expectedVersion={props.expectedVersion}
          potId={props.potId}
          occurredDate={props.occurredDate}
          note={props.note}
          lines={refundLines}
          categories={props.categories}
          people={props.people}
          vehicles={props.vehicles}
          today={props.today}
          existingRefunds={props.existingRefunds}
        />
      ) : null}
      {mode === 'void' ? (
        <VoidForm
          kind="purchase"
          recordId={props.purchaseId}
          expectedVersion={props.expectedVersion}
          summary={props.summary}
        />
      ) : null}
    </div>
  );
}

export interface TransferFormProps {
  pots: TargetOption[];
  today: string;
  /** Prefix for control ids — the form renders twice on pages that embed quick entry. */
  idPrefix?: string;
}

/**
 * Transfer form (money moving between the household's own pots — never a
 * bank sync; transfers never enter Insights, SPEC §10/§15.4).
 */
export function TransferForm({ pots, today, idPrefix = 'transfer' }: TransferFormProps) {
  const [state, formAction, pending] = useActionState(addTransferAction, initialActionState);
  if (pots.length < 2) {
    return (
      <p className="text-sm text-ink-soft">
        Create at least two pots before moving money between them — add them on{' '}
        <Link href="/pots" className="sf-link">
          Accounts, Pots &amp; Checkpoints
        </Link>
        .
      </p>
    );
  }
  return (
    <form action={formAction} className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-2">
        <div className="flex flex-col gap-1">
          <label htmlFor={`${idPrefix}-from`} className={labelClass}>
            From pot
          </label>
          <select
            id={`${idPrefix}-from`}
            name="fromPotId"
            required
            defaultValue={String(pots[0]?.id ?? '')}
            className={inputClass}
          >
            {pots.map((pot) => (
              <option key={pot.id} value={pot.id}>
                {pot.label}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor={`${idPrefix}-to`} className={labelClass}>
            To pot
          </label>
          <select
            id={`${idPrefix}-to`}
            name="toPotId"
            required
            defaultValue={String(pots[1]?.id ?? '')}
            className={inputClass}
          >
            {pots.map((pot) => (
              <option key={pot.id} value={pot.id}>
                {pot.label}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor={`${idPrefix}-amount`} className={labelClass}>
          Amount
        </label>
        <input
          id={`${idPrefix}-amount`}
          name="amount"
          type="text"
          inputMode="decimal"
          required
          placeholder="e.g. 50.00"
          className={inputClass}
        />
        <p className="text-xs text-ink-muted">
          Recorded as you see it; the ledger books it out of one pot and into the other.
        </p>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="flex flex-col gap-1">
          <label htmlFor={`${idPrefix}-date`} className={labelClass}>
            When
          </label>
          <input
            id={`${idPrefix}-date`}
            name="occurredDate"
            type="date"
            required
            defaultValue={today}
            className={inputClass}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor={`${idPrefix}-note`} className={labelClass}>
            Note (optional)
          </label>
          <input
            id={`${idPrefix}-note`}
            name="note"
            type="text"
            maxLength={280}
            className={inputClass}
          />
        </div>
      </div>
      <button type="submit" disabled={pending} className={`${submitClass} self-start`}>
        {pending ? 'Saving…' : 'Record transfer'}
      </button>
      <FormMessage status={state.status} message={state.message} />
    </form>
  );
}

export interface TransferEditFormProps {
  transferId: number;
  expectedVersion: number;
  fromPotId: number;
  toPotId: number;
  amountPence: number;
  occurredDate: string;
  note: string | null;
  pots: TargetOption[];
  today: string;
  /** Prefix for control ids — one editor renders inside every live row. */
  idPrefix: string;
}

/**
 * Correct a saved pot-to-pot transfer in place (SPEC §10.1, GitHub issue
 * #33): the two pots, the amount, the date and the note. A transfer is a
 * money record like any other, so a pot picked by mistake or a mistyped
 * amount is corrected here rather than voided and re-recorded — and the note
 * a hurried entry left out can be added afterwards.
 *
 * The form arrives holding the record as saved: the date is the transfer's
 * own local date (never later than today, because the record itself never
 * is) and the note is pre-filled, so a blank note keeps what is there — the
 * convention every other record edit follows. The hidden `expectedVersion`
 * is the page's snapshot of the row: if the record moved underneath, the
 * save is refused with the domain's own message and nothing is written.
 */
export function TransferEditForm({
  transferId,
  expectedVersion,
  fromPotId,
  toPotId,
  amountPence,
  occurredDate,
  note,
  pots,
  today,
  idPrefix,
}: TransferEditFormProps) {
  const [state, formAction, pending] = useActionState(editTransferAction, initialActionState);
  return (
    <form action={formAction} className="flex flex-col gap-2">
      <input type="hidden" name="transferId" value={transferId} />
      <input type="hidden" name="expectedVersion" value={expectedVersion} />
      <div className="grid grid-cols-2 gap-2">
        <div className="flex flex-col gap-1">
          <label htmlFor={`${idPrefix}-from`} className={labelClass}>
            From pot
          </label>
          {/* Keyed by the saved pot (decision 225). React resets a form after
              its action succeeds, and an uncontrolled <select> resets to the
              option it was *mounted* with — React never re-applies a changed
              `defaultValue` to a select. Without the key, a corrected pot
              would snap back on screen to the old one, and the next save
              would quietly write the old pot back. Inputs need no key: their
              changed `defaultValue` is applied. */}
          <select
            key={fromPotId}
            id={`${idPrefix}-from`}
            name="fromPotId"
            required
            defaultValue={String(fromPotId)}
            className={inputClass}
          >
            {pots.map((pot) => (
              <option key={pot.id} value={pot.id}>
                {pot.label}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor={`${idPrefix}-to`} className={labelClass}>
            To pot
          </label>
          <select
            key={toPotId}
            id={`${idPrefix}-to`}
            name="toPotId"
            required
            defaultValue={String(toPotId)}
            className={inputClass}
          >
            {pots.map((pot) => (
              <option key={pot.id} value={pot.id}>
                {pot.label}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="flex flex-col gap-1">
          <label htmlFor={`${idPrefix}-amount`} className={labelClass}>
            Amount
          </label>
          <input
            id={`${idPrefix}-amount`}
            name="amount"
            type="text"
            inputMode="decimal"
            required
            defaultValue={penceToAmountText(amountPence)}
            className={inputClass}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor={`${idPrefix}-date`} className={labelClass}>
            When
          </label>
          <input
            id={`${idPrefix}-date`}
            name="occurredDate"
            type="date"
            required
            max={today}
            defaultValue={occurredDate}
            className={inputClass}
          />
        </div>
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor={`${idPrefix}-note`} className={labelClass}>
          Note (blank keeps the current note)
        </label>
        <input
          id={`${idPrefix}-note`}
          name="note"
          type="text"
          maxLength={280}
          defaultValue={note ?? ''}
          className={inputClass}
        />
      </div>
      <button type="submit" disabled={pending} className={`${submitClass} self-start`}>
        {pending ? 'Saving…' : 'Save transfer'}
      </button>
      <FormMessage status={state.status} message={state.message} />
    </form>
  );
}
