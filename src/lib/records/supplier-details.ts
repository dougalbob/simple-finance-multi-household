import { asc, desc, eq } from 'drizzle-orm';
import { recordAudit, type DbTx } from '../audit';
import type { Db } from '../db/client';
import { supplierInteractions, supplierReferences, suppliers } from '../db/schema';
import { SupplierNotFoundError } from './suppliers';
import { createTaskInTransaction, MAX_TASK_TITLE_LENGTH, type Task } from './tasks';
import { isValidLocalDate } from '../time';

/**
 * Supplier reference pairs and the interaction log (SPEC §21.1–21.2).
 *
 * These used to be written straight into the tables by the form actions: no
 * validation, no actor in the audit trail. They are domain operations now, for
 * the same reason every other record is: one code path shared by the page, the
 * tests and the audit trail, with every write attributed to the person who
 * made it (blueprint §3).
 */

export const INTERACTION_CHANNELS = ['call', 'email', 'letter', 'in_person', 'other'] as const;
export type InteractionChannel = (typeof INTERACTION_CHANNELS)[number];

export const MAX_REFERENCE_LABEL_LENGTH = 100;
export const MAX_REFERENCE_VALUE_LENGTH = 500;
export const MAX_INTERACTION_SUMMARY_LENGTH = 1000;
export const MAX_INTERACTION_OUTCOME_LENGTH = 1000;

export class InvalidSupplierDetailError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidSupplierDetailError';
  }
}

export type SupplierReference = typeof supplierReferences.$inferSelect;
export type SupplierInteraction = typeof supplierInteractions.$inferSelect;

function requireSupplier(tx: DbTx, supplierId: number): { id: number; name: string } {
  const supplier = tx
    .select({ id: suppliers.id, name: suppliers.name })
    .from(suppliers)
    .where(eq(suppliers.id, supplierId))
    .get();
  if (supplier === undefined) throw new SupplierNotFoundError(supplierId);
  return supplier;
}

function cleanText(value: string, max: number, label: string, required: boolean): string | null {
  const trimmed = value.replace(/\s+/g, ' ').trim();
  if (trimmed.length === 0) {
    if (required) throw new InvalidSupplierDetailError(`${label} is required.`);
    return null;
  }
  if (trimmed.length > max) {
    throw new InvalidSupplierDetailError(`Keep the ${label.toLowerCase()} to ${max} characters.`);
  }
  return trimmed;
}

export interface AddSupplierReferenceInput {
  supplierId: number;
  label: string;
  value: string;
  actor: string;
  now?: Date;
}

/** Label→value pair, e.g. "Policy number — Vehicle A" → "ABC123" (SPEC §21.1). */
export function addSupplierReference(db: Db, input: AddSupplierReferenceInput): SupplierReference {
  const now = input.now ?? new Date();
  const label = cleanText(input.label, MAX_REFERENCE_LABEL_LENGTH, 'A reference label', true)!;
  const value = cleanText(input.value, MAX_REFERENCE_VALUE_LENGTH, 'A reference value', true)!;
  return db.transaction((tx) => {
    const supplier = requireSupplier(tx, input.supplierId);
    const inserted = tx
      .insert(supplierReferences)
      .values({
        supplierId: input.supplierId,
        label,
        value,
        createdAt: now,
        updatedAt: now,
      })
      .returning()
      .get();
    recordAudit(tx, {
      actor: input.actor,
      action: 'supplier.reference',
      entity: 'supplier',
      entityId: input.supplierId,
      summary: `Added reference “${label}” to supplier “${supplier.name}”`,
      after: { label, value },
      now,
    });
    return inserted;
  });
}

export interface AddSupplierInteractionInput {
  supplierId: number;
  channel: string;
  summary: string;
  outcome?: string | null;
  /**
   * Local date ('YYYY-MM-DD') by which the household promised to follow up,
   * or null. Since v0.25.0 this creates a task (decision 175) rather than
   * being stored on the interaction.
   */
  followUpDate?: string | null;
  /**
   * The follow-up task's words, e.g. "Ring back about the refund". Blank
   * means "Follow up with <supplier>". Words with no date still make a task —
   * an undated promise is still a promise.
   */
  followUpTitle?: string | null;
  occurredAt?: Date;
  relatedPurchaseId?: number | null;
  relatedRenewalId?: number | null;
  actor: string;
  now?: Date;
}

export interface AddedSupplierInteraction {
  interaction: SupplierInteraction;
  /** The task the follow-up created, or null when none was asked for. */
  followUpTask: Task | null;
}

/**
 * One interaction: what was said or sent, and who recorded it and when
 * (SPEC §21.2). A follow-up date (or follow-up words) creates an open task
 * about the supplier **in the same transaction** — the call and the promise
 * it produced are saved together or not at all — and the task points back at
 * the interaction. Nothing is sent to anyone (decision 19).
 */
export function addSupplierInteraction(
  db: Db,
  input: AddSupplierInteractionInput,
): AddedSupplierInteraction {
  const now = input.now ?? new Date();
  if (!INTERACTION_CHANNELS.includes(input.channel as InteractionChannel)) {
    throw new InvalidSupplierDetailError('Choose how the conversation happened.');
  }
  const summary = cleanText(
    input.summary,
    MAX_INTERACTION_SUMMARY_LENGTH,
    'A summary of the interaction',
    true,
  )!;
  const outcome = input.outcome
    ? cleanText(input.outcome, MAX_INTERACTION_OUTCOME_LENGTH, 'Outcome', false)
    : null;
  const followUpDate = input.followUpDate?.trim() ? input.followUpDate.trim() : null;
  if (followUpDate !== null && !isValidLocalDate(followUpDate)) {
    throw new InvalidSupplierDetailError('Enter the follow-up date as a calendar date.');
  }
  const followUpTitle = input.followUpTitle
    ? cleanText(input.followUpTitle, MAX_TASK_TITLE_LENGTH, 'Follow-up task', false)
    : null;
  const occurredAt = input.occurredAt ?? now;

  return db.transaction((tx) => {
    const supplier = requireSupplier(tx, input.supplierId);
    const inserted = tx
      .insert(supplierInteractions)
      .values({
        supplierId: input.supplierId,
        occurredAt,
        channel: input.channel,
        summary,
        outcome,
        relatedPurchaseId: input.relatedPurchaseId ?? null,
        relatedRenewalId: input.relatedRenewalId ?? null,
        createdBy: input.actor,
        createdAt: now,
      })
      .returning()
      .get();
    const followUpTask =
      followUpDate === null && followUpTitle === null
        ? null
        : createTaskInTransaction(tx, {
            title: followUpTitle ?? `Follow up with ${supplier.name}`,
            detail: summary,
            dueDate: followUpDate,
            subjectKind: 'supplier',
            subjectId: supplier.id,
            relatedInteractionId: inserted.id,
            actor: input.actor,
            now,
          });
    recordAudit(tx, {
      actor: input.actor,
      action: 'supplier.interaction',
      entity: 'supplier',
      entityId: input.supplierId,
      summary:
        `Logged a ${input.channel.replace('_', ' ')} with supplier “${supplier.name}”` +
        (followUpTask === null ? '' : ` and added the task “${followUpTask.title}”`),
      after: { summary, outcome, followUpDate, followUpTaskId: followUpTask?.id ?? null },
      now,
    });
    return { interaction: inserted, followUpTask };
  });
}

export function listSupplierReferences(db: Db, supplierId: number): SupplierReference[] {
  return db
    .select()
    .from(supplierReferences)
    .where(eq(supplierReferences.supplierId, supplierId))
    .orderBy(asc(supplierReferences.id))
    .all();
}

/** Newest first; the same order the Suppliers page reads. */
export function listSupplierInteractions(
  db: Db,
  supplierId: number,
  limit = 50,
): SupplierInteraction[] {
  const top = Math.min(Math.max(limit, 1), 200);
  return db
    .select()
    .from(supplierInteractions)
    .where(eq(supplierInteractions.supplierId, supplierId))
    .orderBy(desc(supplierInteractions.occurredAt), desc(supplierInteractions.id))
    .limit(top)
    .all();
}
