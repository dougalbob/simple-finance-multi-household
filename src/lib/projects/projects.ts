import { and, asc, desc, eq } from 'drizzle-orm';
import { recordAudit } from '../audit';
import type { Db } from '../db/client';
import { projectItems, projectQuotes, projectSuppliers, projects } from '../db/schema';
import { isValidPenceAmount, MAX_ABS_PENCE } from '../money';
import { VersionConflictError } from '../records/errors';
import { hasUsablePricing } from './costing';

/**
 * Projects domain (PROJECTS_IMPLEMENTATION.MD, SPEC §27, decision 181):
 * the costing-matrix records — a project, its rows (items / bill of
 * materials), its columns (suppliers / candidate options) and its cells
 * (quotes). Standing house rules apply even though these are planning
 * records, not money records: integer pence, typed enums, optimistic
 * concurrency on every mutable row, and an audit entry in the same
 * transaction as every change. Nothing here touches pots, purchases,
 * estimates or Insights.
 *
 * Deletion is allowed (a project is a draft plan, not money history —
 * OQ-P2 in PROJECTS_IMPLEMENTATION.MD) and is audited with what went with
 * it: deleting a supplier or item cascades its quotes, and a selection whose
 * quote goes away is cleared.
 */

export type Project = typeof projects.$inferSelect;
export type ProjectItem = typeof projectItems.$inferSelect;
export type ProjectSupplier = typeof projectSuppliers.$inferSelect;
export type ProjectQuote = typeof projectQuotes.$inferSelect;

export const PROJECT_MODES = ['mix_and_match', 'compare_options'] as const;
export type ProjectMode = (typeof PROJECT_MODES)[number];

export const PROJECT_STATUSES = ['researching', 'ready_to_order', 'completed'] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export const COST_FREQUENCIES = ['one_off', 'annual', 'monthly'] as const;
export type CostFrequency = (typeof COST_FREQUENCIES)[number];

export const FULFILMENT_CHOICES = ['delivery', 'collect'] as const;
export type FulfilmentChoice = (typeof FULFILMENT_CHOICES)[number];

export const MAX_PROJECT_NAME_LENGTH = 120;
export const MAX_PROJECT_NOTES_LENGTH = 2000;
export const MAX_ITEM_NAME_LENGTH = 120;
export const MAX_ITEM_UNIT_LENGTH = 20;
export const MAX_SUPPLIER_FIELD_LENGTH = 200;
export const MAX_URL_LENGTH = 500;
export const MAX_QUOTE_NOTES_LENGTH = 1000;

export class ProjectNotFoundError extends Error {
  constructor(projectId: number) {
    super(
      `No project with id ${projectId}. It may have been changed elsewhere — refresh the page.`,
    );
    this.name = 'ProjectNotFoundError';
  }
}

export class ProjectItemNotFoundError extends Error {
  constructor(itemId: number) {
    super(
      `No project item with id ${itemId}. It may have been changed elsewhere — refresh the page.`,
    );
    this.name = 'ProjectItemNotFoundError';
  }
}

export class ProjectSupplierNotFoundError extends Error {
  constructor(supplierId: number) {
    super(
      `No project supplier with id ${supplierId}. It may have been changed elsewhere — refresh the page.`,
    );
    this.name = 'ProjectSupplierNotFoundError';
  }
}

export class ProjectQuoteNotFoundError extends Error {
  constructor(itemId: number, supplierId: number) {
    super(
      `No quote for item ${itemId} from supplier ${supplierId}. It may have been changed elsewhere — refresh the page.`,
    );
    this.name = 'ProjectQuoteNotFoundError';
  }
}

export class InvalidProjectInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidProjectInputError';
  }
}

// ---------------------------------------------------------------------------
// Input checking (the Zod schemas at the boundary shape the strings; these
// checks are the domain's own authority and also guard programmatic callers
// such as the demo seed)
// ---------------------------------------------------------------------------

function checkedName(value: string, label: string, max: number): string {
  const trimmed = value.trim();
  if (trimmed.length < 1) throw new InvalidProjectInputError(`Give the ${label} a name.`);
  if (trimmed.length > max) {
    throw new InvalidProjectInputError(`Keep the ${label} name to ${max} characters or fewer.`);
  }
  return trimmed;
}

function checkedNotes(value: string | null | undefined, max: number): string | null {
  if (value === null || value === undefined) return null;
  const trimmed = value.trim();
  if (trimmed === '') return null;
  if (trimmed.length > max) {
    throw new InvalidProjectInputError(`Keep the notes to ${max} characters or fewer.`);
  }
  return trimmed;
}

function checkedOptionalText(
  value: string | null | undefined,
  label: string,
  max: number,
): string | null {
  if (value === null || value === undefined) return null;
  const trimmed = value.trim();
  if (trimmed === '') return null;
  if (trimmed.length > max) {
    throw new InvalidProjectInputError(`Keep the ${label} to ${max} characters or fewer.`);
  }
  return trimmed;
}

function checkedUrl(value: string | null | undefined): string | null {
  const trimmed = checkedOptionalText(value, 'link', MAX_URL_LENGTH);
  if (trimmed === null) return null;
  if (!/^https?:\/\/\S+$/i.test(trimmed)) {
    throw new InvalidProjectInputError('Enter a link starting with http:// or https://.');
  }
  return trimmed;
}

function checkedPence(
  value: number,
  label: string,
  { min, allowMin }: { min: number; allowMin: boolean },
): number {
  if (!isValidPenceAmount(value)) {
    throw new InvalidProjectInputError(`Enter ${label} as a whole-pence amount.`);
  }
  if (allowMin ? value < min : value <= min) {
    throw new InvalidProjectInputError(
      allowMin ? `${label} must be ${min} or more.` : `Enter ${label} greater than ${min}.`,
    );
  }
  return value;
}

function checkedQuantity(value: number): number {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new InvalidProjectInputError('Enter a whole quantity of 1 or more.');
  }
  return value;
}

function checkedUnit(value: string | null | undefined): string {
  const trimmed = checkedOptionalText(value, 'unit', MAX_ITEM_UNIT_LENGTH);
  return trimmed ?? 'each';
}

function checkedMode(value: ProjectMode): ProjectMode {
  if (!PROJECT_MODES.includes(value)) {
    throw new InvalidProjectInputError('Choose a project type this app knows.');
  }
  return value;
}

function checkedStatus(value: ProjectStatus): ProjectStatus {
  if (!PROJECT_STATUSES.includes(value)) {
    throw new InvalidProjectInputError('Choose a status this app knows.');
  }
  return value;
}

function checkedCostFrequency(value: CostFrequency): CostFrequency {
  if (!COST_FREQUENCIES.includes(value)) {
    throw new InvalidProjectInputError('Choose a cost frequency this app knows.');
  }
  return value;
}

function checkedFulfilment(value: FulfilmentChoice): FulfilmentChoice {
  if (!FULFILMENT_CHOICES.includes(value)) {
    throw new InvalidProjectInputError('Choose delivery or collect.');
  }
  return value;
}

function checkedActor(actor: string): string {
  const trimmed = actor.trim().toLowerCase();
  if (trimmed === '') throw new InvalidProjectInputError('An acting sign-in is required.');
  return trimmed;
}

function expectVersion(
  entity: string,
  id: number,
  expectedVersion: number,
  actualVersion: number,
): void {
  if (actualVersion !== expectedVersion) {
    throw new VersionConflictError(entity, id, expectedVersion, actualVersion);
  }
}

function nextSortOrder(rows: Array<{ sortOrder: number }>): number {
  let max = -1;
  for (const row of rows) if (row.sortOrder > max) max = row.sortOrder;
  return max + 1;
}

// ---------------------------------------------------------------------------
// Projects
// ---------------------------------------------------------------------------

export interface CreateProjectInput {
  name: string;
  projectMode?: ProjectMode;
  targetBudgetPence?: number | null;
  status?: ProjectStatus;
  notes?: string | null;
  actor: string;
  now?: Date;
}

export function createProject(db: Db, input: CreateProjectInput): Project {
  const now = input.now ?? new Date();
  const name = checkedName(input.name, 'project', MAX_PROJECT_NAME_LENGTH);
  const targetBudgetPence =
    input.targetBudgetPence === null || input.targetBudgetPence === undefined
      ? null
      : checkedPence(input.targetBudgetPence, 'the target budget', { min: 0, allowMin: true });
  return db.transaction((tx) => {
    const inserted = tx
      .insert(projects)
      .values({
        name,
        projectMode: checkedMode(input.projectMode ?? 'mix_and_match'),
        targetBudgetPence,
        status: checkedStatus(input.status ?? 'researching'),
        notes: checkedNotes(input.notes ?? null, MAX_PROJECT_NOTES_LENGTH),
        createdAt: now,
        updatedAt: now,
      })
      .returning()
      .get();
    if (inserted === undefined) throw new Error('insert project returned no row');
    recordAudit(tx, {
      actor: checkedActor(input.actor),
      action: 'project.create',
      entity: 'project',
      entityId: inserted.id,
      summary: `Created project “${inserted.name}”`,
      after: inserted,
      now,
    });
    return inserted;
  });
}

export interface EditProjectInput {
  id: number;
  expectedVersion: number;
  patch: {
    name: string;
    projectMode: ProjectMode;
    targetBudgetPence: number | null;
    status: ProjectStatus;
    notes: string | null;
  };
  actor: string;
  now?: Date;
}

export function editProject(db: Db, input: EditProjectInput): Project {
  const now = input.now ?? new Date();
  const name = checkedName(input.patch.name, 'project', MAX_PROJECT_NAME_LENGTH);
  const targetBudgetPence =
    input.patch.targetBudgetPence === null
      ? null
      : checkedPence(input.patch.targetBudgetPence, 'the target budget', {
          min: 0,
          allowMin: true,
        });
  return db.transaction((tx) => {
    const current = tx.select().from(projects).where(eq(projects.id, input.id)).get();
    if (current === undefined) throw new ProjectNotFoundError(input.id);
    expectVersion('project', input.id, input.expectedVersion, current.version);
    const updated = tx
      .update(projects)
      .set({
        name,
        projectMode: checkedMode(input.patch.projectMode),
        targetBudgetPence,
        status: checkedStatus(input.patch.status),
        notes: checkedNotes(input.patch.notes, MAX_PROJECT_NOTES_LENGTH),
        updatedAt: now,
        version: current.version + 1,
      })
      .where(eq(projects.id, input.id))
      .returning()
      .get();
    if (updated === undefined) throw new Error('update project returned no row');
    recordAudit(tx, {
      actor: checkedActor(input.actor),
      action: 'project.edit',
      entity: 'project',
      entityId: input.id,
      summary: `Edited project “${current.name}”`,
      before: current,
      after: updated,
      now,
    });
    return updated;
  });
}

/**
 * Delete a whole project — rows, columns, cells and selections go with it
 * (FK cascade). A draft plan is deletable (OQ-P2); the audit entry carries
 * the counts so the history says what went.
 */
export function deleteProject(
  db: Db,
  input: { id: number; expectedVersion: number; actor: string; now?: Date },
): void {
  const now = input.now ?? new Date();
  db.transaction((tx) => {
    const current = tx.select().from(projects).where(eq(projects.id, input.id)).get();
    if (current === undefined) throw new ProjectNotFoundError(input.id);
    expectVersion('project', input.id, input.expectedVersion, current.version);
    const itemCount = tx
      .select()
      .from(projectItems)
      .where(eq(projectItems.projectId, input.id))
      .all().length;
    const supplierCount = tx
      .select()
      .from(projectSuppliers)
      .where(eq(projectSuppliers.projectId, input.id))
      .all().length;
    const quoteCount = tx
      .select()
      .from(projectQuotes)
      .where(eq(projectQuotes.projectId, input.id))
      .all().length;
    tx.delete(projectQuotes).where(eq(projectQuotes.projectId, input.id)).run();
    tx.delete(projectItems).where(eq(projectItems.projectId, input.id)).run();
    tx.delete(projectSuppliers).where(eq(projectSuppliers.projectId, input.id)).run();
    tx.delete(projects).where(eq(projects.id, input.id)).run();
    recordAudit(tx, {
      actor: checkedActor(input.actor),
      action: 'project.delete',
      entity: 'project',
      entityId: input.id,
      summary:
        `Deleted project “${current.name}” with ${itemCount} ${itemCount === 1 ? 'item' : 'items'}, ` +
        `${supplierCount} ${supplierCount === 1 ? 'supplier' : 'suppliers'} and ` +
        `${quoteCount} ${quoteCount === 1 ? 'quote' : 'quotes'}`,
      before: { ...current, itemCount, supplierCount, quoteCount },
      now,
    });
  });
}

export function getProject(db: Pick<Db, 'select'>, id: number): Project | null {
  return db.select().from(projects).where(eq(projects.id, id)).get() ?? null;
}

/** Newest projects first; a household only ever has a handful. */
export function listProjects(db: Pick<Db, 'select'>): Project[] {
  return db.select().from(projects).orderBy(desc(projects.createdAt), desc(projects.id)).all();
}

// ---------------------------------------------------------------------------
// Project items (rows)
// ---------------------------------------------------------------------------

export interface CreateProjectItemInput {
  projectId: number;
  name: string;
  quantity: number;
  unit?: string | null;
  costFrequency?: CostFrequency;
  category?: string | null;
  notes?: string | null;
  actor: string;
  now?: Date;
}

export function createProjectItem(db: Db, input: CreateProjectItemInput): ProjectItem {
  const now = input.now ?? new Date();
  const name = checkedName(input.name, 'item', MAX_ITEM_NAME_LENGTH);
  const quantity = checkedQuantity(input.quantity);
  return db.transaction((tx) => {
    const project = tx.select().from(projects).where(eq(projects.id, input.projectId)).get();
    if (project === undefined) throw new ProjectNotFoundError(input.projectId);
    const sortOrder = nextSortOrder(
      tx.select().from(projectItems).where(eq(projectItems.projectId, input.projectId)).all(),
    );
    const inserted = tx
      .insert(projectItems)
      .values({
        projectId: input.projectId,
        sortOrder,
        name,
        quantity,
        unit: checkedUnit(input.unit),
        costFrequency: checkedCostFrequency(input.costFrequency ?? 'one_off'),
        category: checkedOptionalText(input.category, 'category', MAX_SUPPLIER_FIELD_LENGTH),
        notes: checkedNotes(input.notes ?? null, MAX_QUOTE_NOTES_LENGTH),
        createdAt: now,
        updatedAt: now,
      })
      .returning()
      .get();
    if (inserted === undefined) throw new Error('insert project item returned no row');
    recordAudit(tx, {
      actor: checkedActor(input.actor),
      action: 'project-item.create',
      entity: 'project-item',
      entityId: inserted.id,
      summary: `Added item “${inserted.name}” (${inserted.quantity} ${inserted.unit}) to project “${project.name}”`,
      after: inserted,
      now,
    });
    return inserted;
  });
}

export interface EditProjectItemInput {
  id: number;
  expectedVersion: number;
  patch: {
    name: string;
    quantity: number;
    unit: string | null;
    costFrequency: CostFrequency;
    category: string | null;
    notes: string | null;
  };
  actor: string;
  now?: Date;
}

export function editProjectItem(db: Db, input: EditProjectItemInput): ProjectItem {
  const now = input.now ?? new Date();
  const name = checkedName(input.patch.name, 'item', MAX_ITEM_NAME_LENGTH);
  const quantity = checkedQuantity(input.patch.quantity);
  return db.transaction((tx) => {
    const current = tx.select().from(projectItems).where(eq(projectItems.id, input.id)).get();
    if (current === undefined) throw new ProjectItemNotFoundError(input.id);
    expectVersion('project item', input.id, input.expectedVersion, current.version);
    const updated = tx
      .update(projectItems)
      .set({
        name,
        quantity,
        unit: checkedUnit(input.patch.unit),
        costFrequency: checkedCostFrequency(input.patch.costFrequency),
        category: checkedOptionalText(input.patch.category, 'category', MAX_SUPPLIER_FIELD_LENGTH),
        notes: checkedNotes(input.patch.notes, MAX_QUOTE_NOTES_LENGTH),
        updatedAt: now,
        version: current.version + 1,
      })
      .where(eq(projectItems.id, input.id))
      .returning()
      .get();
    if (updated === undefined) throw new Error('update project item returned no row');
    recordAudit(tx, {
      actor: checkedActor(input.actor),
      action: 'project-item.edit',
      entity: 'project-item',
      entityId: input.id,
      summary: `Edited item “${current.name}”`,
      before: current,
      after: updated,
      now,
    });
    return updated;
  });
}

/** Delete a row and the quotes that priced it (FK cascade), audited. */
export function deleteProjectItem(
  db: Db,
  input: { id: number; expectedVersion: number; actor: string; now?: Date },
): void {
  const now = input.now ?? new Date();
  db.transaction((tx) => {
    const current = tx.select().from(projectItems).where(eq(projectItems.id, input.id)).get();
    if (current === undefined) throw new ProjectItemNotFoundError(input.id);
    expectVersion('project item', input.id, input.expectedVersion, current.version);
    const quoteCount = tx
      .select()
      .from(projectQuotes)
      .where(eq(projectQuotes.itemId, input.id))
      .all().length;
    tx.delete(projectQuotes).where(eq(projectQuotes.itemId, input.id)).run();
    tx.delete(projectItems).where(eq(projectItems.id, input.id)).run();
    recordAudit(tx, {
      actor: checkedActor(input.actor),
      action: 'project-item.delete',
      entity: 'project-item',
      entityId: input.id,
      summary:
        `Deleted item “${current.name}”` +
        (quoteCount === 0 ? '' : ` and its ${quoteCount} ${quoteCount === 1 ? 'quote' : 'quotes'}`),
      before: { ...current, quoteCount },
      now,
    });
  });
}

export function getProjectItem(db: Pick<Db, 'select'>, id: number): ProjectItem | null {
  return db.select().from(projectItems).where(eq(projectItems.id, id)).get() ?? null;
}

export function listProjectItems(db: Pick<Db, 'select'>, projectId: number): ProjectItem[] {
  return db
    .select()
    .from(projectItems)
    .where(eq(projectItems.projectId, projectId))
    .orderBy(asc(projectItems.sortOrder), asc(projectItems.id))
    .all();
}

// ---------------------------------------------------------------------------
// Project suppliers (columns)
// ---------------------------------------------------------------------------

export interface CreateProjectSupplierInput {
  projectId: number;
  name: string;
  phone?: string | null;
  websiteUrl?: string | null;
  notes?: string | null;
  deliveryFeePence?: number;
  freeDeliveryThresholdPence?: number | null;
  clickAndCollectAvailable?: boolean;
  fulfilmentChoice?: FulfilmentChoice;
  actor: string;
  now?: Date;
}

function checkedDeliveryRules(input: {
  deliveryFeePence?: number;
  freeDeliveryThresholdPence?: number | null;
  clickAndCollectAvailable?: boolean;
  fulfilmentChoice?: FulfilmentChoice;
}): {
  deliveryFeePence: number;
  freeDeliveryThresholdPence: number | null;
  clickAndCollectAvailable: boolean;
  fulfilmentChoice: FulfilmentChoice;
} {
  const deliveryFeePence = checkedPence(input.deliveryFeePence ?? 0, 'the delivery fee', {
    min: 0,
    allowMin: true,
  });
  const freeDeliveryThresholdPence =
    input.freeDeliveryThresholdPence === null || input.freeDeliveryThresholdPence === undefined
      ? null
      : checkedPence(input.freeDeliveryThresholdPence, 'the free delivery threshold', {
          min: 1,
          allowMin: true,
        });
  const clickAndCollectAvailable = input.clickAndCollectAvailable ?? false;
  const fulfilmentChoice = checkedFulfilment(input.fulfilmentChoice ?? 'delivery');
  if (fulfilmentChoice === 'collect' && !clickAndCollectAvailable) {
    throw new InvalidProjectInputError(
      'This supplier cannot be set to collect — tick “Click & Collect available” first.',
    );
  }
  return {
    deliveryFeePence,
    freeDeliveryThresholdPence,
    clickAndCollectAvailable,
    fulfilmentChoice,
  };
}

export function createProjectSupplier(db: Db, input: CreateProjectSupplierInput): ProjectSupplier {
  const now = input.now ?? new Date();
  const name = checkedName(input.name, 'supplier', MAX_ITEM_NAME_LENGTH);
  const rules = checkedDeliveryRules(input);
  return db.transaction((tx) => {
    const project = tx.select().from(projects).where(eq(projects.id, input.projectId)).get();
    if (project === undefined) throw new ProjectNotFoundError(input.projectId);
    const sortOrder = nextSortOrder(
      tx
        .select()
        .from(projectSuppliers)
        .where(eq(projectSuppliers.projectId, input.projectId))
        .all(),
    );
    const inserted = tx
      .insert(projectSuppliers)
      .values({
        projectId: input.projectId,
        sortOrder,
        name,
        phone: checkedOptionalText(input.phone, 'phone', MAX_SUPPLIER_FIELD_LENGTH),
        websiteUrl: checkedUrl(input.websiteUrl),
        notes: checkedNotes(input.notes ?? null, MAX_QUOTE_NOTES_LENGTH),
        ...rules,
        createdAt: now,
        updatedAt: now,
      })
      .returning()
      .get();
    if (inserted === undefined) throw new Error('insert project supplier returned no row');
    recordAudit(tx, {
      actor: checkedActor(input.actor),
      action: 'project-supplier.create',
      entity: 'project-supplier',
      entityId: inserted.id,
      summary: `Added supplier “${inserted.name}” to project “${project.name}”`,
      after: inserted,
      now,
    });
    return inserted;
  });
}

export interface EditProjectSupplierInput {
  id: number;
  expectedVersion: number;
  patch: {
    name: string;
    phone: string | null;
    websiteUrl: string | null;
    notes: string | null;
    deliveryFeePence: number;
    freeDeliveryThresholdPence: number | null;
    clickAndCollectAvailable: boolean;
    fulfilmentChoice: FulfilmentChoice;
  };
  actor: string;
  now?: Date;
}

export function editProjectSupplier(db: Db, input: EditProjectSupplierInput): ProjectSupplier {
  const now = input.now ?? new Date();
  const name = checkedName(input.patch.name, 'supplier', MAX_ITEM_NAME_LENGTH);
  const rules = checkedDeliveryRules(input.patch);
  return db.transaction((tx) => {
    const current = tx
      .select()
      .from(projectSuppliers)
      .where(eq(projectSuppliers.id, input.id))
      .get();
    if (current === undefined) throw new ProjectSupplierNotFoundError(input.id);
    expectVersion('project supplier', input.id, input.expectedVersion, current.version);
    const updated = tx
      .update(projectSuppliers)
      .set({
        name,
        phone: checkedOptionalText(input.patch.phone, 'phone', MAX_SUPPLIER_FIELD_LENGTH),
        websiteUrl: checkedUrl(input.patch.websiteUrl),
        notes: checkedNotes(input.patch.notes, MAX_QUOTE_NOTES_LENGTH),
        ...rules,
        updatedAt: now,
        version: current.version + 1,
      })
      .where(eq(projectSuppliers.id, input.id))
      .returning()
      .get();
    if (updated === undefined) throw new Error('update project supplier returned no row');
    recordAudit(tx, {
      actor: checkedActor(input.actor),
      action: 'project-supplier.edit',
      entity: 'project-supplier',
      entityId: input.id,
      summary: `Edited supplier “${current.name}”`,
      before: current,
      after: updated,
      now,
    });
    return updated;
  });
}

/**
 * Delete a column and its quotes (FK cascade). Row selections pointing here
 * are cleared by the foreign key (`ON DELETE SET NULL`) so no row keeps a
 * selection the matrix cannot show.
 */
export function deleteProjectSupplier(
  db: Db,
  input: { id: number; expectedVersion: number; actor: string; now?: Date },
): void {
  const now = input.now ?? new Date();
  db.transaction((tx) => {
    const current = tx
      .select()
      .from(projectSuppliers)
      .where(eq(projectSuppliers.id, input.id))
      .get();
    if (current === undefined) throw new ProjectSupplierNotFoundError(input.id);
    expectVersion('project supplier', input.id, input.expectedVersion, current.version);
    const quoteCount = tx
      .select()
      .from(projectQuotes)
      .where(eq(projectQuotes.supplierId, input.id))
      .all().length;
    const clearedSelections = tx
      .select()
      .from(projectItems)
      .where(eq(projectItems.selectedSupplierId, input.id))
      .all().length;
    tx.delete(projectQuotes).where(eq(projectQuotes.supplierId, input.id)).run();
    tx.delete(projectSuppliers).where(eq(projectSuppliers.id, input.id)).run();
    recordAudit(tx, {
      actor: checkedActor(input.actor),
      action: 'project-supplier.delete',
      entity: 'project-supplier',
      entityId: input.id,
      summary:
        `Deleted supplier “${current.name}” with ${quoteCount} ${quoteCount === 1 ? 'quote' : 'quotes'}` +
        (clearedSelections === 0
          ? ''
          : `; cleared ${clearedSelections} selected ${clearedSelections === 1 ? 'row' : 'rows'}`),
      before: { ...current, quoteCount, clearedSelections },
      now,
    });
  });
}

export function getProjectSupplier(db: Pick<Db, 'select'>, id: number): ProjectSupplier | null {
  return db.select().from(projectSuppliers).where(eq(projectSuppliers.id, id)).get() ?? null;
}

export function listProjectSuppliers(db: Pick<Db, 'select'>, projectId: number): ProjectSupplier[] {
  return db
    .select()
    .from(projectSuppliers)
    .where(eq(projectSuppliers.projectId, projectId))
    .orderBy(asc(projectSuppliers.sortOrder), asc(projectSuppliers.id))
    .all();
}

// ---------------------------------------------------------------------------
// Project quotes (cells)
// ---------------------------------------------------------------------------

export interface SaveProjectQuoteInput {
  projectId: number;
  itemId: number;
  supplierId: number;
  unitPricePence: number | null;
  packSize: number | null;
  packPricePence: number | null;
  productUrl?: string | null;
  inStock?: boolean;
  notes?: string | null;
  actor: string;
  now?: Date;
}

function checkedQuotePricing(input: {
  unitPricePence: number | null;
  packSize: number | null;
  packPricePence: number | null;
}): {
  unitPricePence: number | null;
  packSize: number | null;
  packPricePence: number | null;
} {
  const unitPricePence =
    input.unitPricePence === null
      ? null
      : checkedPence(input.unitPricePence, 'the unit price', { min: 0, allowMin: true });
  if (input.packSize !== null && !Number.isSafeInteger(input.packSize)) {
    throw new InvalidProjectInputError('Enter the pack size as a whole number.');
  }
  const packSize = input.packSize;
  if (packSize !== null && packSize < 1) {
    throw new InvalidProjectInputError('The pack size must be 1 or more.');
  }
  const packPricePence =
    input.packPricePence === null
      ? null
      : checkedPence(input.packPricePence, 'the pack price', { min: 0, allowMin: true });
  if ((packSize === null) !== (packPricePence === null)) {
    throw new InvalidProjectInputError('Enter both the pack size and the pack price, or neither.');
  }
  const pricing = { unitPricePence, packSize, packPricePence };
  if (!hasUsablePricing(pricing)) {
    throw new InvalidProjectInputError(
      'Enter a unit price, or a pack size with a pack price — a quote needs a price.',
    );
  }
  return pricing;
}

/**
 * Save (create or update) the quote cell for one item/supplier pair — the
 * UNIQUE(item_id, supplier_id) upsert the matrix's inline form posts to.
 * Editing a quote never silently moves the row's selection.
 */
export function saveProjectQuote(db: Db, input: SaveProjectQuoteInput): ProjectQuote {
  const now = input.now ?? new Date();
  const pricing = checkedQuotePricing(input);
  const productUrl = checkedUrl(input.productUrl);
  const notes = checkedNotes(input.notes ?? null, MAX_QUOTE_NOTES_LENGTH);
  return db.transaction((tx) => {
    const item = tx.select().from(projectItems).where(eq(projectItems.id, input.itemId)).get();
    if (item === undefined) throw new ProjectItemNotFoundError(input.itemId);
    const supplier = tx
      .select()
      .from(projectSuppliers)
      .where(eq(projectSuppliers.id, input.supplierId))
      .get();
    if (supplier === undefined) throw new ProjectSupplierNotFoundError(input.supplierId);
    if (item.projectId !== input.projectId || supplier.projectId !== input.projectId) {
      throw new InvalidProjectInputError('That item and supplier are not in the same project.');
    }
    const current = tx
      .select()
      .from(projectQuotes)
      .where(
        and(eq(projectQuotes.itemId, input.itemId), eq(projectQuotes.supplierId, input.supplierId)),
      )
      .get();
    const inStock = input.inStock ?? true;
    if (current === undefined) {
      const inserted = tx
        .insert(projectQuotes)
        .values({
          projectId: input.projectId,
          itemId: input.itemId,
          supplierId: input.supplierId,
          ...pricing,
          productUrl,
          inStock,
          notes,
          createdAt: now,
          updatedAt: now,
        })
        .returning()
        .get();
      if (inserted === undefined) throw new Error('insert project quote returned no row');
      recordAudit(tx, {
        actor: checkedActor(input.actor),
        action: 'project-quote.create',
        entity: 'project-quote',
        entityId: inserted.id,
        summary: `Quoted “${item.name}” from “${supplier.name}”`,
        after: inserted,
        now,
      });
      return inserted;
    }
    const updated = tx
      .update(projectQuotes)
      .set({
        ...pricing,
        productUrl,
        inStock,
        notes,
        updatedAt: now,
        version: current.version + 1,
      })
      .where(eq(projectQuotes.id, current.id))
      .returning()
      .get();
    if (updated === undefined) throw new Error('update project quote returned no row');
    recordAudit(tx, {
      actor: checkedActor(input.actor),
      action: 'project-quote.edit',
      entity: 'project-quote',
      entityId: updated.id,
      summary: `Edited the “${item.name}” quote from “${supplier.name}”`,
      before: current,
      after: updated,
      now,
    });
    return updated;
  });
}

/**
 * Remove one quote cell. A row currently selecting that supplier is cleared
 * in the same transaction — a selection always points at a quote that exists.
 */
export function deleteProjectQuote(
  db: Db,
  input: {
    projectId: number;
    itemId: number;
    supplierId: number;
    actor: string;
    now?: Date;
  },
): void {
  const now = input.now ?? new Date();
  db.transaction((tx) => {
    const current = tx
      .select()
      .from(projectQuotes)
      .where(
        and(eq(projectQuotes.itemId, input.itemId), eq(projectQuotes.supplierId, input.supplierId)),
      )
      .get();
    if (current === undefined) throw new ProjectQuoteNotFoundError(input.itemId, input.supplierId);
    if (current.projectId !== input.projectId) {
      throw new InvalidProjectInputError('That quote is not in this project.');
    }
    const item = tx.select().from(projectItems).where(eq(projectItems.id, input.itemId)).get();
    const supplier = tx
      .select()
      .from(projectSuppliers)
      .where(eq(projectSuppliers.id, input.supplierId))
      .get();
    tx.delete(projectQuotes).where(eq(projectQuotes.id, current.id)).run();
    let clearedSelection = false;
    if (item !== undefined && item.selectedSupplierId === input.supplierId) {
      clearedSelection = true;
      tx.update(projectItems)
        .set({ selectedSupplierId: null, updatedAt: now, version: item.version + 1 })
        .where(eq(projectItems.id, input.itemId))
        .run();
    }
    recordAudit(tx, {
      actor: checkedActor(input.actor),
      action: 'project-quote.delete',
      entity: 'project-quote',
      entityId: current.id,
      summary:
        `Removed the “${item?.name ?? 'item'}” quote from “${supplier?.name ?? 'a supplier'}”` +
        (clearedSelection ? ' and cleared the row’s selection' : ''),
      before: current,
      now,
    });
  });
}

export function listProjectQuotes(db: Pick<Db, 'select'>, projectId: number): ProjectQuote[] {
  return db
    .select()
    .from(projectQuotes)
    .where(eq(projectQuotes.projectId, projectId))
    .orderBy(asc(projectQuotes.itemId), asc(projectQuotes.supplierId))
    .all();
}

// ---------------------------------------------------------------------------
// Manual selection (the cell click)
// ---------------------------------------------------------------------------

/**
 * Choose which supplier this row buys from (`supplierId` null = clear the
 * pick). Only a supplier with a quote for the item can be selected — an
 * empty cell is not stock. Out-of-stock quotes can still be selected (they
 * are flagged in the breakdown; Phase 2's optimiser will skip them).
 */
export function selectProjectItemSupplier(
  db: Db,
  input: {
    itemId: number;
    supplierId: number | null;
    actor: string;
    now?: Date;
  },
): ProjectItem {
  const now = input.now ?? new Date();
  return db.transaction((tx) => {
    const item = tx.select().from(projectItems).where(eq(projectItems.id, input.itemId)).get();
    if (item === undefined) throw new ProjectItemNotFoundError(input.itemId);
    if (input.supplierId !== null) {
      const supplier = tx
        .select()
        .from(projectSuppliers)
        .where(eq(projectSuppliers.id, input.supplierId))
        .get();
      if (supplier === undefined) throw new ProjectSupplierNotFoundError(input.supplierId);
      if (supplier.projectId !== item.projectId) {
        throw new InvalidProjectInputError('That supplier is not in the same project as the item.');
      }
      const quote = tx
        .select()
        .from(projectQuotes)
        .where(
          and(
            eq(projectQuotes.itemId, input.itemId),
            eq(projectQuotes.supplierId, input.supplierId),
          ),
        )
        .get();
      if (quote === undefined) {
        throw new InvalidProjectInputError(
          'Only a supplier with a quote for this item can be selected for it.',
        );
      }
    }
    const updated = tx
      .update(projectItems)
      .set({
        selectedSupplierId: input.supplierId,
        updatedAt: now,
        version: item.version + 1,
      })
      .where(eq(projectItems.id, input.itemId))
      .returning()
      .get();
    if (updated === undefined) throw new Error('update project item returned no row');
    const supplierName =
      input.supplierId === null
        ? null
        : (tx.select().from(projectSuppliers).where(eq(projectSuppliers.id, input.supplierId)).get()
            ?.name ?? null);
    recordAudit(tx, {
      actor: checkedActor(input.actor),
      action: 'project-item.select',
      entity: 'project-item',
      entityId: input.itemId,
      summary:
        input.supplierId === null
          ? `Cleared the supplier choice for “${item.name}”`
          : `Selected “${supplierName ?? 'a supplier'}” for “${item.name}”`,
      before: item,
      after: updated,
      now,
    });
    return updated;
  });
}

// ---------------------------------------------------------------------------
// Row adapters — database rows as the pure costing module needs them
// ---------------------------------------------------------------------------

export function toCostingItems(
  rows: readonly ProjectItem[],
): Array<
  Pick<ProjectItem, 'name' | 'quantity' | 'unit' | 'selectedSupplierId'> & { itemId: number }
> {
  return rows.map((row) => ({
    itemId: row.id,
    name: row.name,
    quantity: row.quantity,
    unit: row.unit,
    selectedSupplierId: row.selectedSupplierId,
  }));
}

export function toCostingSuppliers(rows: readonly ProjectSupplier[]): Array<
  Omit<
    ProjectSupplier,
    'id' | 'projectId' | 'sortOrder' | 'notes' | 'createdAt' | 'updatedAt' | 'version'
  > & {
    supplierId: number;
  }
> {
  return rows.map((row) => ({
    supplierId: row.id,
    name: row.name,
    phone: row.phone,
    websiteUrl: row.websiteUrl,
    deliveryFeePence: row.deliveryFeePence,
    freeDeliveryThresholdPence: row.freeDeliveryThresholdPence,
    clickAndCollectAvailable: row.clickAndCollectAvailable,
    fulfilmentChoice: row.fulfilmentChoice,
  }));
}

export function toCostingQuotes(
  rows: readonly ProjectQuote[],
): Array<Omit<ProjectQuote, 'id' | 'projectId' | 'createdAt' | 'updatedAt' | 'version' | 'notes'>> {
  return rows.map((row) => ({
    itemId: row.itemId,
    supplierId: row.supplierId,
    unitPricePence: row.unitPricePence,
    packSize: row.packSize,
    packPricePence: row.packPricePence,
    productUrl: row.productUrl,
    inStock: row.inStock,
  }));
}
