'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
import {
  deleteProjectQuoteAction,
  saveProjectQuoteAction,
  selectProjectSupplierAction,
} from '@/app/actions';
import { initialActionState, type ActionState } from '@/lib/action-state';
import { addVatPence } from '@/lib/projects/costing';
import { parsePence, penceInput } from '@/lib/money';
import type {
  MatrixRowView,
  QuoteCellView,
  SupplierColumnView,
} from '@/lib/projects/projects-view';
import { ProjectItemDeleteButton, ProjectItemEditForm } from '@/components/project-forms';

/**
 * The Costing Matrix (SPEC §27, PROJECTS_IMPLEMENTATION.MD §5): rows are the
 * bill of materials, columns the project's suppliers, cells the quotes.
 * Clicking a cell with a quote selects that supplier for the row (the manual
 * pick is stored on the item); empty cells offer an inline quote form with the
 * +20% VAT typing helper. Editing a cell opens one panel under the matrix —
 * a phone-friendly place for a six-field form.
 */

const FIELD_CLASS =
  'w-full rounded border border-border-strong bg-surface px-2 py-1 text-sm focus:border-border-emphasis focus:outline-none';

const SUBMIT_CLASS =
  'rounded bg-accent px-3 py-1.5 text-sm font-semibold text-accent-ink hover:bg-accent-strong disabled:opacity-60';

const QUIET_BUTTON_CLASS =
  'rounded border border-border-strong px-2 py-0.5 text-xs font-medium text-ink-soft hover:bg-surface-muted disabled:opacity-60';

function Status({ state }: { state: ActionState }) {
  if (state.message === null) return null;
  return (
    <span
      role="status"
      className={`text-xs ${state.status === 'error' ? 'text-danger' : 'text-positive'}`}
    >
      {state.message}
    </span>
  );
}

interface CellTarget {
  itemId: number;
  supplierId: number;
}

/** A quote-form blank, for a cell that does not exist in the matrix yet. */
const BLANK_QUOTE_CELL: QuoteCellView = {
  hasQuote: false,
  quoteId: null,
  priceLabel: '',
  lineCostLabel: '',
  lineCostPence: 0,
  productUrl: null,
  inStock: true,
  notes: null,
  version: null,
  unitPricePence: null,
  packSize: null,
  packPricePence: null,
};

/** The big clickable cell body: submitting picks this supplier for the row. */
function SelectCellButton({
  projectId,
  item,
  supplier,
  cell,
}: {
  projectId: number;
  item: MatrixRowView;
  supplier: SupplierColumnView;
  cell: QuoteCellView;
}) {
  const [state, formAction, pending] = useActionState(
    selectProjectSupplierAction,
    initialActionState,
  );
  const selected = item.selectedSupplierId === supplier.id;
  return (
    <form action={formAction} className="w-full">
      <input type="hidden" name="projectId" value={projectId} />
      <input type="hidden" name="itemId" value={item.id} />
      <input type="hidden" name="supplierId" value={supplier.id} />
      <button
        type="submit"
        disabled={pending}
        aria-label={
          selected
            ? `${supplier.name} is selected for ${item.name} — ${cell.lineCostLabel}`
            : `Select ${supplier.name} for ${item.name} — ${cell.lineCostLabel}`
        }
        aria-pressed={selected}
        className={`block w-full rounded-lg border p-2 text-left transition-colors disabled:opacity-60 ${
          selected
            ? 'border-accent bg-accent-50 shadow-sm'
            : 'border-border bg-surface hover:border-accent-300 hover:bg-accent-50/40'
        }`}
      >
        <span className="flex items-start justify-between gap-1">
          <span className="text-xs text-ink-soft">{cell.priceLabel}</span>
          {selected ? (
            <span aria-hidden="true" className="text-sm font-bold text-accent">
              ✓
            </span>
          ) : null}
        </span>
        <span className="mt-0.5 block text-sm font-semibold text-ink">{cell.lineCostLabel}</span>
        {cell.inStock ? null : (
          <span className="mt-0.5 block text-xs font-semibold text-warning-900">Out of stock</span>
        )}
        {cell.notes === null ? null : (
          <span className="mt-0.5 block text-xs text-ink-muted">{cell.notes}</span>
        )}
      </button>
      <Status state={state} />
    </form>
  );
}

/** The cell's small toolbar: product link, edit, remove. */
function CellToolbar({
  cell,
  itemName,
  supplierName,
  onEdit,
}: {
  cell: QuoteCellView;
  itemName: string;
  supplierName: string;
  onEdit: () => void;
}) {
  return (
    <div className="mt-1 flex flex-wrap items-center gap-2">
      {cell.productUrl === null ? null : (
        <a
          href={cell.productUrl}
          target="_blank"
          rel="noreferrer"
          aria-label={`Open the product page for ${itemName} at ${supplierName}`}
          className="inline-flex items-center gap-1 text-xs font-medium text-accent hover:underline"
        >
          <svg aria-hidden="true" viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5">
            <path d="M12.5 3h4.5v4.5h-1.5V5.56L11.03 10.03l-1.06-1.06 4.47-4.47H12.5V3zM4 5h5v1.5H5.5v8h8V11H15v5H4V5z" />
          </svg>
          Product
        </a>
      )}
      <button type="button" onClick={onEdit} className={QUIET_BUTTON_CLASS}>
        Edit quote
      </button>
    </div>
  );
}

/** The quote form panel (add or edit) — one open at a time, under the matrix. */
function QuoteCellForm({
  projectId,
  target,
  item,
  supplier,
  cell,
  onDone,
}: {
  projectId: number;
  target: CellTarget;
  item: MatrixRowView;
  supplier: SupplierColumnView;
  cell: QuoteCellView;
  onDone: () => void;
}) {
  const [state, formAction, pending] = useActionState(saveProjectQuoteAction, initialActionState);
  const unitPriceRef = useRef<HTMLInputElement>(null);
  const [vatHint, setVatHint] = useState<string | null>(null);
  useEffect(() => {
    if (state.status === 'ok') onDone();
  }, [state, onDone]);

  /** The "+20% VAT" helper: retype the current unit price with VAT added. */
  function applyVat() {
    const input = unitPriceRef.current;
    if (input === null) return;
    const pence = parsePence(input.value);
    if (pence === null) {
      setVatHint('Enter a price like 12.50 first.');
      return;
    }
    input.value = penceInput(addVatPence(pence));
    setVatHint('VAT added — adjust if your quote rounds differently.');
  }

  return (
    <form
      action={formAction}
      className="rounded-lg border border-accent-300 bg-accent-50/40 p-4"
      aria-label={`Quote for ${item.name} at ${supplier.name}`}
    >
      <p className="text-sm font-semibold text-ink">
        Quote: {item.name} ({item.quantity} {item.unit}) from {supplier.name}
      </p>
      <input type="hidden" name="projectId" value={projectId} />
      <input type="hidden" name="itemId" value={target.itemId} />
      <input type="hidden" name="supplierId" value={target.supplierId} />
      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <label className="block">
          <span className="text-xs font-medium text-ink-soft">Unit price (inc. VAT)</span>
          <span className="mt-0.5 flex items-start gap-2">
            <input
              ref={unitPriceRef}
              name="unitPrice"
              inputMode="decimal"
              defaultValue={cell.unitPricePence === null ? '' : penceInput(cell.unitPricePence)}
              placeholder="28.50"
              className={FIELD_CLASS}
            />
            <button
              type="button"
              onClick={applyVat}
              title="Typed a trade (ex. VAT) price? Multiply it by 1.2 here."
              className="shrink-0 rounded border border-accent-300 bg-surface px-2 py-1 text-xs font-semibold text-accent hover:bg-accent-50"
            >
              +20% VAT
            </button>
          </span>
          {vatHint === null ? (
            <span className="mt-0.5 block text-xs text-ink-muted">
              Ex. VAT trade price? Tap +20% VAT.
            </span>
          ) : (
            <span role="status" className="mt-0.5 block text-xs text-ink-soft">
              {vatHint}
            </span>
          )}
        </label>
        <label className="block">
          <span className="text-xs font-medium text-ink-soft">
            Pack size (if only sold in packs)
          </span>
          <input
            name="packSize"
            inputMode="numeric"
            defaultValue={cell.packSize === null ? '' : String(cell.packSize)}
            placeholder="10"
            className={FIELD_CLASS}
          />
        </label>
        <label className="block">
          <span className="text-xs font-medium text-ink-soft">Pack price (inc. VAT)</span>
          <input
            name="packPrice"
            inputMode="decimal"
            defaultValue={cell.packPricePence === null ? '' : penceInput(cell.packPricePence)}
            placeholder="29.50"
            className={FIELD_CLASS}
          />
        </label>
        <label className="block sm:col-span-2">
          <span className="text-xs font-medium text-ink-soft">Product link (optional)</span>
          <input
            name="productUrl"
            maxLength={500}
            defaultValue={cell.productUrl ?? ''}
            placeholder="https://…"
            className={FIELD_CLASS}
          />
        </label>
        <label className="block">
          <span className="text-xs font-medium text-ink-soft">Notes (optional)</span>
          <input
            name="notes"
            maxLength={1000}
            defaultValue={cell.notes ?? ''}
            className={FIELD_CLASS}
          />
        </label>
        <label className="flex items-center gap-2 text-sm text-ink-body">
          <input
            type="checkbox"
            name="inStock"
            defaultChecked={cell.hasQuote ? cell.inStock : true}
            className="h-4 w-4 accent-accent"
          />
          In stock
        </label>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button type="submit" disabled={pending} className={SUBMIT_CLASS}>
          {pending ? 'Saving…' : cell.hasQuote ? 'Save the quote' : 'Add the quote'}
        </button>
        <button type="button" onClick={onDone} className={QUIET_BUTTON_CLASS}>
          Cancel
        </button>
        {cell.hasQuote ? <RemoveQuoteButton projectId={projectId} target={target} /> : null}
        <Status state={state} />
      </div>
    </form>
  );
}

function RemoveQuoteButton({ projectId, target }: { projectId: number; target: CellTarget }) {
  const [state, formAction, pending] = useActionState(deleteProjectQuoteAction, initialActionState);
  const [armed, setArmed] = useState(false);
  return (
    <form action={formAction} className="inline-flex items-center gap-2">
      <input type="hidden" name="projectId" value={projectId} />
      <input type="hidden" name="itemId" value={target.itemId} />
      <input type="hidden" name="supplierId" value={target.supplierId} />
      {armed ? (
        <button
          type="submit"
          disabled={pending}
          className="rounded border border-danger-300 bg-danger-50 px-2 py-0.5 text-xs font-semibold text-danger-800 hover:bg-danger-100 disabled:opacity-60"
        >
          {pending ? 'Removing…' : 'Yes — remove the quote'}
        </button>
      ) : (
        <button type="button" onClick={() => setArmed(true)} className={QUIET_BUTTON_CLASS}>
          Remove quote
        </button>
      )}
      <Status state={state} />
    </form>
  );
}

/** Clear this row's pick ("no supplier yet"). */
function ClearSelectionButton({ projectId, item }: { projectId: number; item: MatrixRowView }) {
  const [state, formAction, pending] = useActionState(
    selectProjectSupplierAction,
    initialActionState,
  );
  return (
    <form action={formAction} className="w-full">
      <input type="hidden" name="projectId" value={projectId} />
      <input type="hidden" name="itemId" value={item.id} />
      <button
        type="submit"
        disabled={pending || item.selectedSupplierId === null}
        aria-label={`Clear the supplier choice for ${item.name}`}
        className={`block w-full rounded-lg border p-2 text-center text-xs disabled:opacity-50 ${
          item.selectedSupplierId === null
            ? 'border-border-hairline bg-canvas text-ink-muted'
            : 'border-border bg-surface text-ink-soft hover:bg-surface-muted'
        }`}
      >
        {item.selectedSupplierId === null ? '—' : 'Clear'}
      </button>
      <Status state={state} />
    </form>
  );
}

export function CostingMatrix({
  projectId,
  suppliers,
  rows,
}: {
  projectId: number;
  suppliers: SupplierColumnView[];
  rows: MatrixRowView[];
}) {
  const [editing, setEditing] = useState<CellTarget | null>(null);
  const [editingRow, setEditingRow] = useState<number | null>(null);
  const editingItem =
    editing === null ? null : (rows.find((row) => row.id === editing.itemId) ?? null);
  const editingSupplier =
    editing === null ? null : (suppliers.find((col) => col.id === editing.supplierId) ?? null);
  const editingCell =
    editing === null || editingItem === null
      ? null
      : (editingItem.cells[editing.supplierId] ?? BLANK_QUOTE_CELL);

  return (
    <div>
      <div className="overflow-x-auto rounded-xl border border-border bg-surface shadow-sm">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-border text-left">
              <th
                scope="col"
                className="sticky left-0 z-10 min-w-[220px] bg-surface px-3 py-2 text-xs font-semibold uppercase tracking-wide text-ink-muted"
              >
                Material
              </th>
              <th
                scope="col"
                className="min-w-[70px] px-2 py-2 text-xs font-semibold uppercase tracking-wide text-ink-muted"
              >
                No supplier
              </th>
              {suppliers.map((supplier) => (
                <th
                  key={supplier.id}
                  scope="col"
                  className="min-w-[170px] px-2 py-2 text-xs font-semibold uppercase tracking-wide text-ink-muted"
                >
                  {supplier.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-b border-border-hairline align-top">
                <th scope="row" className="sticky left-0 z-10 bg-surface px-3 py-2 text-left">
                  {editingRow === row.id ? (
                    <ProjectItemEditForm
                      projectId={projectId}
                      item={row}
                      onDone={() => setEditingRow(null)}
                    />
                  ) : (
                    <>
                      <p className="font-semibold text-ink">{row.name}</p>
                      <p className="text-xs text-ink-soft">
                        {row.quantityLabel}
                        {row.category === null ? '' : ` · ${row.category}`}
                      </p>
                      {row.notes === null ? null : (
                        <p className="text-xs text-ink-muted">{row.notes}</p>
                      )}
                      <div className="mt-1 flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setEditingRow(row.id)}
                          className={QUIET_BUTTON_CLASS}
                        >
                          Edit item
                        </button>
                        <ProjectItemDeleteButton projectId={projectId} item={row} />
                      </div>
                    </>
                  )}
                </th>
                <td className="px-2 py-2">
                  <ClearSelectionButton projectId={projectId} item={row} />
                </td>
                {suppliers.map((supplier) => {
                  const cell = row.cells[supplier.id];
                  if (cell === undefined || !cell.hasQuote) {
                    return (
                      <td key={supplier.id} className="px-2 py-2">
                        <p className="text-xs text-ink-muted">Not stocked</p>
                        <button
                          type="button"
                          onClick={() => setEditing({ itemId: row.id, supplierId: supplier.id })}
                          aria-label={`Add a quote for ${row.name} at ${supplier.name}`}
                          className={`mt-1 ${QUIET_BUTTON_CLASS}`}
                        >
                          Add quote
                        </button>
                      </td>
                    );
                  }
                  const isEditingThis =
                    editing !== null &&
                    editing.itemId === row.id &&
                    editing.supplierId === supplier.id;
                  return (
                    <td
                      key={supplier.id}
                      className={`px-2 py-2 ${
                        row.selectedSupplierId === supplier.id ? 'bg-accent-50/60' : ''
                      }`}
                    >
                      <SelectCellButton
                        projectId={projectId}
                        item={row}
                        supplier={supplier}
                        cell={cell}
                      />
                      <CellToolbar
                        cell={cell}
                        itemName={row.name}
                        supplierName={supplier.name}
                        onEdit={() => setEditing({ itemId: row.id, supplierId: supplier.id })}
                      />
                      {isEditingThis ? (
                        <p className="mt-1 text-xs text-accent">Editing below the matrix…</p>
                      ) : null}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editing === null ||
      editingItem === null ||
      editingSupplier === null ||
      editingCell === null ? null : (
        <div className="mt-4">
          <QuoteCellForm
            projectId={projectId}
            target={editing}
            item={editingItem}
            supplier={editingSupplier}
            cell={editingCell}
            onDone={() => setEditing(null)}
          />
        </div>
      )}
    </div>
  );
}
