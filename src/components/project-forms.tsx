'use client';

import { useActionState, useEffect, useState } from 'react';
import {
  createProjectAction,
  createProjectItemAction,
  createProjectSupplierAction,
  deleteProjectAction,
  deleteProjectItemAction,
  deleteProjectSupplierAction,
  editProjectAction,
  editProjectItemAction,
  editProjectSupplierAction,
} from '@/app/actions';
import { initialActionState, type ActionState } from '@/lib/action-state';
import { penceInput } from '@/lib/money';
import type {
  MatrixRowView,
  ProjectWorkspaceView,
  SupplierColumnView,
} from '@/lib/projects/projects-view';

/**
 * Projects forms (SPEC §27, PROJECTS_IMPLEMENTATION.MD §5): create/manage a
 * project, add/edit/delete its material rows and its supplier columns with
 * their delivery rules. The task-forms language: plain labels, one submit,
 * a visible status line, destructive actions tucked behind a second click.
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

function Labelled({
  htmlFor,
  label,
  hint,
  children,
}: {
  htmlFor: string;
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block" htmlFor={htmlFor}>
      <span className="text-xs font-medium text-ink-soft">{label}</span>
      {hint === undefined ? null : <span className="ml-1 text-xs text-ink-muted">{hint}</span>}
      <span className="mt-0.5 block">{children}</span>
    </label>
  );
}

// ---------------------------------------------------------------------------
// Project create/edit
// ---------------------------------------------------------------------------

interface ProjectFieldsProps {
  idPrefix: string;
  defaults?: {
    name: string;
    projectMode: 'mix_and_match' | 'compare_options';
    targetBudget: string;
    status: 'researching' | 'ready_to_order' | 'completed';
    notes: string;
  };
}

function ProjectFields({ idPrefix, defaults }: ProjectFieldsProps) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Labelled htmlFor={`${idPrefix}-name`} label="Project name">
        <input
          id={`${idPrefix}-name`}
          name="name"
          required
          maxLength={120}
          defaultValue={defaults?.name ?? ''}
          placeholder="Back Garden Fence Replacement"
          className={FIELD_CLASS}
        />
      </Labelled>
      <Labelled htmlFor={`${idPrefix}-mode`} label="Project type">
        <select
          id={`${idPrefix}-mode`}
          name="projectMode"
          defaultValue={defaults?.projectMode ?? 'mix_and_match'}
          className={FIELD_CLASS}
        >
          <option value="mix_and_match">Mix &amp; match (pick suppliers per item)</option>
          <option value="compare_options">Compare options (whole candidates)</option>
        </select>
      </Labelled>
      <Labelled
        htmlFor={`${idPrefix}-budget`}
        label="Target budget"
        hint="(optional — e.g. 1200.00)"
      >
        <input
          id={`${idPrefix}-budget`}
          name="targetBudget"
          inputMode="decimal"
          defaultValue={defaults?.targetBudget ?? ''}
          placeholder="1200.00"
          className={FIELD_CLASS}
        />
      </Labelled>
      <Labelled htmlFor={`${idPrefix}-status`} label="Status">
        <select
          id={`${idPrefix}-status`}
          name="status"
          defaultValue={defaults?.status ?? 'researching'}
          className={FIELD_CLASS}
        >
          <option value="researching">Researching</option>
          <option value="ready_to_order">Ready to order</option>
          <option value="completed">Completed</option>
        </select>
      </Labelled>
      <div className="sm:col-span-2">
        <Labelled htmlFor={`${idPrefix}-notes`} label="Notes" hint="(optional)">
          <textarea
            id={`${idPrefix}-notes`}
            name="notes"
            rows={2}
            maxLength={2000}
            defaultValue={defaults?.notes ?? ''}
            className={FIELD_CLASS}
          />
        </Labelled>
      </div>
    </div>
  );
}

export function ProjectCreateForm() {
  const [state, formAction, pending] = useActionState(createProjectAction, initialActionState);
  return (
    <form action={formAction} className="space-y-3">
      <ProjectFields idPrefix="project-new" />
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={pending} className={SUBMIT_CLASS}>
          {pending ? 'Starting…' : 'Start the project'}
        </button>
        <Status state={state} />
      </div>
    </form>
  );
}

export function ProjectEditForm({ project }: { project: ProjectWorkspaceView['project'] }) {
  const [state, formAction, pending] = useActionState(editProjectAction, initialActionState);
  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="projectId" value={project.id} />
      <input type="hidden" name="expectedVersion" value={project.version} />
      <ProjectFields
        idPrefix={`project-${project.id}`}
        defaults={{
          name: project.name,
          projectMode: project.projectMode,
          targetBudget:
            project.targetBudgetPence === null ? '' : penceInput(project.targetBudgetPence),
          status: project.status,
          notes: project.notes ?? '',
        }}
      />
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={pending} className={SUBMIT_CLASS}>
          {pending ? 'Saving…' : 'Save the project'}
        </button>
        <Status state={state} />
      </div>
    </form>
  );
}

export function ProjectDeleteButton({ project }: { project: ProjectWorkspaceView['project'] }) {
  const [state, formAction, pending] = useActionState(deleteProjectAction, initialActionState);
  const [armed, setArmed] = useState(false);
  return (
    <form action={formAction} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="projectId" value={project.id} />
      <input type="hidden" name="expectedVersion" value={project.version} />
      {armed ? (
        <>
          <button
            type="submit"
            disabled={pending}
            className="rounded border border-danger-300 bg-danger-50 px-2 py-0.5 text-xs font-semibold text-danger-800 hover:bg-danger-100 disabled:opacity-60"
          >
            {pending ? 'Deleting…' : 'Yes — delete the whole project'}
          </button>
          <button type="button" onClick={() => setArmed(false)} className={QUIET_BUTTON_CLASS}>
            Keep it
          </button>
        </>
      ) : (
        <button type="button" onClick={() => setArmed(true)} className={QUIET_BUTTON_CLASS}>
          Delete project
        </button>
      )}
      <Status state={state} />
    </form>
  );
}

// ---------------------------------------------------------------------------
// Material rows (project items)
// ---------------------------------------------------------------------------

interface ItemDefaults {
  name: string;
  quantity: string;
  unit: string;
  costFrequency: 'one_off' | 'annual' | 'monthly';
  category: string;
  notes: string;
}

function ItemFields({ idPrefix, defaults }: { idPrefix: string; defaults?: ItemDefaults }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Labelled htmlFor={`${idPrefix}-name`} label="Material / cost line">
        <input
          id={`${idPrefix}-name`}
          name="name"
          required
          maxLength={120}
          defaultValue={defaults?.name ?? ''}
          placeholder="8ft Concrete Slotted Post"
          className={FIELD_CLASS}
        />
      </Labelled>
      <div className="grid grid-cols-2 gap-3">
        <Labelled htmlFor={`${idPrefix}-quantity`} label="Quantity">
          <input
            id={`${idPrefix}-quantity`}
            name="quantity"
            inputMode="numeric"
            required
            defaultValue={defaults?.quantity ?? ''}
            placeholder="10"
            className={FIELD_CLASS}
          />
        </Labelled>
        <Labelled htmlFor={`${idPrefix}-unit`} label="Unit">
          <input
            id={`${idPrefix}-unit`}
            name="unit"
            maxLength={20}
            defaultValue={defaults?.unit ?? 'each'}
            placeholder="each"
            className={FIELD_CLASS}
          />
        </Labelled>
      </div>
      <Labelled htmlFor={`${idPrefix}-category`} label="Category" hint="(optional)">
        <input
          id={`${idPrefix}-category`}
          name="category"
          maxLength={200}
          defaultValue={defaults?.category ?? ''}
          placeholder="Timber"
          className={FIELD_CLASS}
        />
      </Labelled>
      <Labelled htmlFor={`${idPrefix}-costFrequency`} label="Cost frequency">
        <select
          id={`${idPrefix}-costFrequency`}
          name="costFrequency"
          defaultValue={defaults?.costFrequency ?? 'one_off'}
          className={FIELD_CLASS}
        >
          <option value="one_off">One-off</option>
          <option value="annual">Annual</option>
          <option value="monthly">Monthly</option>
        </select>
      </Labelled>
      <div className="sm:col-span-2">
        <Labelled htmlFor={`${idPrefix}-notes`} label="Notes" hint="(optional)">
          <input
            id={`${idPrefix}-notes`}
            name="notes"
            maxLength={1000}
            defaultValue={defaults?.notes ?? ''}
            className={FIELD_CLASS}
          />
        </Labelled>
      </div>
    </div>
  );
}

export function ProjectItemCreateForm({ projectId }: { projectId: number }) {
  const [state, formAction, pending] = useActionState(createProjectItemAction, initialActionState);
  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="projectId" value={projectId} />
      <ItemFields idPrefix="item-new" />
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={pending} className={SUBMIT_CLASS}>
          {pending ? 'Adding…' : 'Add to the matrix'}
        </button>
        <Status state={state} />
      </div>
    </form>
  );
}

export function ProjectItemEditForm({
  projectId,
  item,
  onDone,
}: {
  projectId: number;
  item: MatrixRowView;
  onDone?: () => void;
}) {
  const [state, formAction, pending] = useActionState(editProjectItemAction, initialActionState);
  useEffect(() => {
    if (state.status === 'ok') onDone?.();
  }, [state, onDone]);
  return (
    <form action={formAction} className="space-y-3 rounded-lg border border-border bg-canvas p-3">
      <input type="hidden" name="projectId" value={projectId} />
      <input type="hidden" name="itemId" value={item.id} />
      <input type="hidden" name="expectedVersion" value={item.version} />
      <ItemFields
        idPrefix={`item-${item.id}`}
        defaults={{
          name: item.name,
          quantity: String(item.quantity),
          unit: item.unit,
          costFrequency: item.costFrequency,
          category: item.category ?? '',
          notes: item.notes ?? '',
        }}
      />
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={pending} className={SUBMIT_CLASS}>
          {pending ? 'Saving…' : 'Save the item'}
        </button>
        {onDone === undefined ? null : (
          <button type="button" onClick={onDone} className={QUIET_BUTTON_CLASS}>
            Cancel
          </button>
        )}
        <Status state={state} />
      </div>
    </form>
  );
}

export function ProjectItemDeleteButton({
  projectId,
  item,
}: {
  projectId: number;
  item: Pick<MatrixRowView, 'id' | 'version' | 'name'>;
}) {
  const [state, formAction, pending] = useActionState(deleteProjectItemAction, initialActionState);
  const [armed, setArmed] = useState(false);
  return (
    <form action={formAction} className="inline-flex flex-wrap items-center gap-2">
      <input type="hidden" name="projectId" value={projectId} />
      <input type="hidden" name="itemId" value={item.id} />
      <input type="hidden" name="expectedVersion" value={item.version} />
      {armed ? (
        <>
          <button
            type="submit"
            disabled={pending}
            aria-label={`Confirm delete item: ${item.name}`}
            className="rounded border border-danger-300 bg-danger-50 px-2 py-0.5 text-xs font-semibold text-danger-800 hover:bg-danger-100 disabled:opacity-60"
          >
            {pending ? 'Deleting…' : 'Yes — delete'}
          </button>
          <button type="button" onClick={() => setArmed(false)} className={QUIET_BUTTON_CLASS}>
            Keep
          </button>
        </>
      ) : (
        <button
          type="button"
          onClick={() => setArmed(true)}
          aria-label={`Delete item: ${item.name}`}
          className={QUIET_BUTTON_CLASS}
        >
          Delete
        </button>
      )}
      <Status state={state} />
    </form>
  );
}

// ---------------------------------------------------------------------------
// Supplier columns with delivery rules
// ---------------------------------------------------------------------------

interface SupplierDefaults {
  name: string;
  phone: string;
  websiteUrl: string;
  notes: string;
  deliveryFee: string;
  freeDeliveryThreshold: string;
  clickAndCollectAvailable: boolean;
  fulfilmentChoice: 'delivery' | 'collect';
}

function SupplierFields({ idPrefix, defaults }: { idPrefix: string; defaults?: SupplierDefaults }) {
  const [collectAvailable, setCollectAvailable] = useState(
    defaults?.clickAndCollectAvailable ?? false,
  );
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Labelled htmlFor={`${idPrefix}-name`} label="Supplier name">
        <input
          id={`${idPrefix}-name`}
          name="name"
          required
          maxLength={120}
          defaultValue={defaults?.name ?? ''}
          placeholder="Local Timber Yard"
          className={FIELD_CLASS}
        />
      </Labelled>
      <Labelled htmlFor={`${idPrefix}-phone`} label="Phone" hint="(optional)">
        <input
          id={`${idPrefix}-phone`}
          name="phone"
          maxLength={200}
          defaultValue={defaults?.phone ?? ''}
          placeholder="01632 960111"
          className={FIELD_CLASS}
        />
      </Labelled>
      <Labelled htmlFor={`${idPrefix}-website`} label="Website" hint="(optional, https://…)">
        <input
          id={`${idPrefix}-website`}
          name="websiteUrl"
          maxLength={500}
          defaultValue={defaults?.websiteUrl ?? ''}
          placeholder="https://…"
          className={FIELD_CLASS}
        />
      </Labelled>
      <Labelled htmlFor={`${idPrefix}-notes`} label="Notes" hint="(optional)">
        <input
          id={`${idPrefix}-notes`}
          name="notes"
          maxLength={1000}
          defaultValue={defaults?.notes ?? ''}
          className={FIELD_CLASS}
        />
      </Labelled>
      <Labelled
        htmlFor={`${idPrefix}-fee`}
        label="Delivery fee"
        hint="(e.g. 15.00 — charged once per order)"
      >
        <input
          id={`${idPrefix}-fee`}
          name="deliveryFee"
          inputMode="decimal"
          defaultValue={defaults?.deliveryFee ?? '0.00'}
          className={FIELD_CLASS}
        />
      </Labelled>
      <Labelled
        htmlFor={`${idPrefix}-threshold`}
        label="Free delivery over"
        hint="(optional — e.g. 300.00)"
      >
        <input
          id={`${idPrefix}-threshold`}
          name="freeDeliveryThreshold"
          inputMode="decimal"
          defaultValue={defaults?.freeDeliveryThreshold ?? ''}
          className={FIELD_CLASS}
        />
      </Labelled>
      <div className="space-y-2">
        <label className="flex items-center gap-2 text-sm text-ink-body">
          <input
            type="checkbox"
            name="clickAndCollectAvailable"
            checked={collectAvailable}
            onChange={(event) => setCollectAvailable(event.currentTarget.checked)}
            className="h-4 w-4 accent-accent"
          />
          Click &amp; Collect available
        </label>
        <Labelled htmlFor={`${idPrefix}-fulfilment`} label="This order will be">
          <select
            id={`${idPrefix}-fulfilment`}
            name="fulfilmentChoice"
            defaultValue={defaults?.fulfilmentChoice ?? 'delivery'}
            className={FIELD_CLASS}
          >
            <option value="delivery">Delivered (pay the fee rules above)</option>
            <option value="collect" disabled={!collectAvailable}>
              Collected — £0 delivery{collectAvailable ? '' : ' (tick Click & Collect first)'}
            </option>
          </select>
        </Labelled>
      </div>
    </div>
  );
}

export function ProjectSupplierCreateForm({ projectId }: { projectId: number }) {
  const [state, formAction, pending] = useActionState(
    createProjectSupplierAction,
    initialActionState,
  );
  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="projectId" value={projectId} />
      <SupplierFields idPrefix="supplier-new" />
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={pending} className={SUBMIT_CLASS}>
          {pending ? 'Adding…' : 'Add the supplier'}
        </button>
        <Status state={state} />
      </div>
    </form>
  );
}

export function ProjectSupplierEditForm({
  supplier,
  onDone,
}: {
  supplier: SupplierColumnView;
  onDone?: () => void;
}) {
  const [state, formAction, pending] = useActionState(
    editProjectSupplierAction,
    initialActionState,
  );
  useEffect(() => {
    if (state.status === 'ok') onDone?.();
  }, [state, onDone]);
  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="supplierId" value={supplier.id} />
      <input type="hidden" name="expectedVersion" value={supplier.version} />
      <SupplierFields
        idPrefix={`supplier-${supplier.id}`}
        defaults={{
          name: supplier.name,
          phone: supplier.phone ?? '',
          websiteUrl: supplier.websiteUrl ?? '',
          notes: supplier.notes ?? '',
          deliveryFee: penceInput(supplier.deliveryFeePence),
          freeDeliveryThreshold:
            supplier.freeDeliveryThresholdPence === null
              ? ''
              : penceInput(supplier.freeDeliveryThresholdPence),
          clickAndCollectAvailable: supplier.clickAndCollectAvailable,
          fulfilmentChoice: supplier.fulfilmentChoice,
        }}
      />
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={pending} className={SUBMIT_CLASS}>
          {pending ? 'Saving…' : 'Save the supplier'}
        </button>
        {onDone === undefined ? null : (
          <button type="button" onClick={onDone} className={QUIET_BUTTON_CLASS}>
            Close
          </button>
        )}
        <Status state={state} />
      </div>
    </form>
  );
}

export function ProjectSupplierDeleteButton({
  projectId,
  supplier,
}: {
  projectId: number;
  supplier: Pick<SupplierColumnView, 'id' | 'version' | 'name'>;
}) {
  const [state, formAction, pending] = useActionState(
    deleteProjectSupplierAction,
    initialActionState,
  );
  const [armed, setArmed] = useState(false);
  return (
    <form action={formAction} className="inline-flex flex-wrap items-center gap-2">
      <input type="hidden" name="projectId" value={projectId} />
      <input type="hidden" name="supplierId" value={supplier.id} />
      <input type="hidden" name="expectedVersion" value={supplier.version} />
      {armed ? (
        <>
          <button
            type="submit"
            disabled={pending}
            aria-label={`Confirm delete supplier: ${supplier.name}`}
            className="rounded border border-danger-300 bg-danger-50 px-2 py-0.5 text-xs font-semibold text-danger-800 hover:bg-danger-100 disabled:opacity-60"
          >
            {pending ? 'Deleting…' : 'Yes — delete'}
          </button>
          <button type="button" onClick={() => setArmed(false)} className={QUIET_BUTTON_CLASS}>
            Keep
          </button>
        </>
      ) : (
        <button
          type="button"
          onClick={() => setArmed(true)}
          aria-label={`Delete supplier: ${supplier.name}`}
          className={QUIET_BUTTON_CLASS}
        >
          Delete
        </button>
      )}
      <Status state={state} />
    </form>
  );
}
