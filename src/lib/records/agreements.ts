import { and, asc, eq, lte } from 'drizzle-orm';
import { recordAudit, type DbTx } from '../audit';
import type { Db } from '../db/client';
import { people, schedules, suppliers, trackedAgreements, vehicles } from '../db/schema';
import { isValidLocalDate, toLocalDateString } from '../time';
import { addYearsClamped } from './dates';
import { VersionConflictError } from './errors';

/**
 * Household-facing contract and policy register (SPEC §22 refresh).
 *
 * An agreement is not a payment schedule: it can exist without one. A
 * schedule is an optional link to the separate recurring-money record. The
 * provider's auto-renew setting is also distinct from the app's annual
 * reminder cycle. Only an insurance agreement explicitly marked "yes" is
 * advanced automatically; a no/unknown policy remains due until a person
 * confirms the next date.
 */
export type TrackedAgreement = typeof trackedAgreements.$inferSelect;
export type AgreementType = 'insurance' | 'service' | 'other';
export type AutoRenewStatus = 'yes' | 'no' | 'unknown';
export type AgreementTargetKind = 'household' | 'person' | 'vehicle';

export class AgreementNotFoundError extends Error {
  constructor(id: number) {
    super(`No contract or policy with id ${id}`);
    this.name = 'AgreementNotFoundError';
  }
}

export class InvalidAgreementInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidAgreementInputError';
  }
}

export const MAX_AGREEMENT_NAME_LENGTH = 100;
export const MAX_AGREEMENT_NOTES_LENGTH = 500;
export const DEFAULT_AGREEMENT_REMINDER_DAYS = 21;
export const MAX_AGREEMENT_REMINDER_DAYS = 365;

export interface CreateAgreementInput {
  name: string;
  type: AgreementType;
  supplierId?: number | null;
  targetKind?: AgreementTargetKind;
  targetId?: number | null;
  autoRenew?: AutoRenewStatus | null;
  renewalDate?: string | null;
  switchDate?: string | null;
  renewalReminderLeadDays?: number | null;
  switchReminderLeadDays?: number | null;
  renewalRepeatsAnnually?: boolean;
  scheduleId?: number | null;
  notes?: string | null;
  actor: string;
  now?: Date;
}

export interface EditAgreementPatch {
  name?: string;
  type?: AgreementType;
  supplierId?: number | null;
  targetKind?: AgreementTargetKind;
  targetId?: number | null;
  autoRenew?: AutoRenewStatus | null;
  /** undefined = unchanged; null = clear. */
  renewalDate?: string | null;
  /** undefined = unchanged; null = clear. */
  switchDate?: string | null;
  /** undefined = unchanged; null = turn the reminder off. */
  renewalReminderLeadDays?: number | null;
  /** undefined = unchanged; null = turn the reminder off. */
  switchReminderLeadDays?: number | null;
  renewalRepeatsAnnually?: boolean;
  /** undefined = unchanged; null = unlink. */
  scheduleId?: number | null;
  /** undefined = unchanged; null = clear. */
  notes?: string | null;
}

export interface EditAgreementInput {
  id: number;
  expectedVersion: number;
  actor: string;
  now?: Date;
  patch: EditAgreementPatch;
}

interface CheckedAgreementFields {
  name: string;
  type: AgreementType;
  supplierId: number | null;
  targetKind: AgreementTargetKind;
  targetId: number | null;
  autoRenew: AutoRenewStatus | null;
  renewalDate: string | null;
  switchDate: string | null;
  renewalReminderLeadDays: number | null;
  switchReminderLeadDays: number | null;
  renewalRepeatsAnnually: boolean;
  scheduleId: number | null;
  notes: string | null;
}

export function createAgreement(db: Db, input: CreateAgreementInput): TrackedAgreement {
  const now = input.now ?? new Date();
  const actor = checkedActor(input.actor);
  return db.transaction((tx) => {
    const effective = checkedAgreementFields(tx, {
      name: input.name,
      type: input.type,
      supplierId: input.supplierId ?? null,
      targetKind: input.targetKind ?? 'household',
      targetId: input.targetId ?? null,
      autoRenew: input.autoRenew ?? null,
      renewalDate: input.renewalDate ?? null,
      switchDate: input.switchDate ?? null,
      renewalReminderLeadDays:
        input.renewalReminderLeadDays === undefined
          ? input.renewalDate == null
            ? null
            : DEFAULT_AGREEMENT_REMINDER_DAYS
          : input.renewalReminderLeadDays,
      switchReminderLeadDays:
        input.switchReminderLeadDays === undefined
          ? input.switchDate == null
            ? null
            : DEFAULT_AGREEMENT_REMINDER_DAYS
          : input.switchReminderLeadDays,
      renewalRepeatsAnnually: input.renewalRepeatsAnnually ?? false,
      scheduleId: input.scheduleId ?? null,
      notes: input.notes ?? null,
    });
    const inserted = tx
      .insert(trackedAgreements)
      .values({
        name: effective.name,
        type: effective.type,
        supplierId: effective.supplierId,
        targetKind: effective.targetKind,
        targetId: effective.targetId,
        autoRenew: effective.autoRenew,
        renewalDate: effective.renewalDate,
        switchDate: effective.switchDate,
        renewalReminderLeadDays: effective.renewalReminderLeadDays,
        switchReminderLeadDays: effective.switchReminderLeadDays,
        renewalRepeatsAnnually: effective.renewalRepeatsAnnually,
        renewalAdvancedFrom: null,
        notes: effective.notes,
        scheduleId: effective.scheduleId,
        legacyScheduleId: null,
        legacyRenewalId: null,
        createdBy: actor,
        createdAt: now,
        updatedAt: now,
      })
      .returning()
      .get();
    if (inserted === undefined) throw new Error('insert tracked agreement returned no row');
    recordAudit(tx, {
      actor,
      action: 'agreement.create',
      entity: 'agreement',
      entityId: inserted.id,
      summary: `Added ${agreementTypeLabel(inserted.type).toLowerCase()} “${inserted.name}”`,
      after: inserted,
      now,
    });
    return inserted;
  });
}

export function editAgreement(db: Db, input: EditAgreementInput): TrackedAgreement {
  const now = input.now ?? new Date();
  const actor = checkedActor(input.actor);
  const patch = input.patch;
  return db.transaction((tx) => {
    const current = tx
      .select()
      .from(trackedAgreements)
      .where(eq(trackedAgreements.id, input.id))
      .get();
    if (current === undefined) throw new AgreementNotFoundError(input.id);
    if (current.version !== input.expectedVersion) {
      throw new VersionConflictError('agreement', input.id, input.expectedVersion, current.version);
    }

    const effective = checkedAgreementFields(
      tx,
      {
        name: patch.name ?? current.name,
        type: patch.type ?? current.type,
        supplierId: patch.supplierId === undefined ? current.supplierId : patch.supplierId,
        targetKind: patch.targetKind ?? current.targetKind,
        targetId: patch.targetId === undefined ? current.targetId : patch.targetId,
        autoRenew: patch.autoRenew === undefined ? current.autoRenew : patch.autoRenew,
        renewalDate: patch.renewalDate === undefined ? current.renewalDate : patch.renewalDate,
        switchDate: patch.switchDate === undefined ? current.switchDate : patch.switchDate,
        renewalReminderLeadDays:
          patch.renewalReminderLeadDays === undefined
            ? current.renewalReminderLeadDays
            : patch.renewalReminderLeadDays,
        switchReminderLeadDays:
          patch.switchReminderLeadDays === undefined
            ? current.switchReminderLeadDays
            : patch.switchReminderLeadDays,
        renewalRepeatsAnnually: patch.renewalRepeatsAnnually ?? current.renewalRepeatsAnnually,
        scheduleId: patch.scheduleId === undefined ? current.scheduleId : patch.scheduleId,
        notes: patch.notes === undefined ? current.notes : patch.notes,
      },
      current.id,
      current.scheduleId,
    );
    const updated = tx
      .update(trackedAgreements)
      .set({
        name: effective.name,
        type: effective.type,
        supplierId: effective.supplierId,
        targetKind: effective.targetKind,
        targetId: effective.targetId,
        autoRenew: effective.autoRenew,
        renewalDate: effective.renewalDate,
        switchDate: effective.switchDate,
        renewalReminderLeadDays: effective.renewalReminderLeadDays,
        switchReminderLeadDays: effective.switchReminderLeadDays,
        renewalRepeatsAnnually: effective.renewalRepeatsAnnually,
        notes: effective.notes,
        scheduleId: effective.scheduleId,
        updatedAt: now,
        version: current.version + 1,
      })
      .where(eq(trackedAgreements.id, current.id))
      .returning()
      .get();
    if (updated === undefined) throw new Error('update tracked agreement returned no row');
    recordAudit(tx, {
      actor,
      action: 'agreement.edit',
      entity: 'agreement',
      entityId: updated.id,
      summary: `Edited ${agreementTypeLabel(updated.type).toLowerCase()} “${updated.name}”`,
      before: current,
      after: updated,
      now,
    });
    return updated;
  });
}

export function getAgreement(db: Db, id: number): TrackedAgreement {
  const agreement = db.select().from(trackedAgreements).where(eq(trackedAgreements.id, id)).get();
  if (agreement === undefined) throw new AgreementNotFoundError(id);
  return agreement;
}

export function listAgreements(db: Db): TrackedAgreement[] {
  return db
    .select()
    .from(trackedAgreements)
    .orderBy(
      asc(trackedAgreements.renewalDate),
      asc(trackedAgreements.switchDate),
      asc(trackedAgreements.id),
    )
    .all();
}

/**
 * Provider-confirmed annual insurance renewals can roll forward automatically.
 * No/unknown provider status never advances the date: it stays overdue until
 * the household edits it after arranging cover. Each advance is audited.
 */
export function advanceDueAgreementRenewals(db: Db, nowArg?: Date): number {
  const now = nowArg ?? new Date();
  const today = toLocalDateString(now);
  return db.transaction((tx) => {
    let advancedCount = 0;
    let guard = 0;
    for (;;) {
      if (guard >= 50) break;
      guard += 1;
      const dueRows = tx
        .select()
        .from(trackedAgreements)
        .where(
          and(
            eq(trackedAgreements.type, 'insurance'),
            eq(trackedAgreements.autoRenew, 'yes'),
            eq(trackedAgreements.renewalRepeatsAnnually, true),
            lte(trackedAgreements.renewalDate, today),
          ),
        )
        .all()
        .filter((agreement) => agreement.renewalDate !== null);
      if (dueRows.length === 0) break;
      for (const agreement of dueRows) {
        const previous = agreement.renewalDate;
        if (previous === null) continue;
        const advancedTo = addYearsClamped(previous, 1);
        tx.update(trackedAgreements)
          .set({
            renewalDate: advancedTo,
            renewalAdvancedFrom: previous,
            updatedAt: now,
            version: agreement.version + 1,
          })
          .where(eq(trackedAgreements.id, agreement.id))
          .run();
        recordAudit(tx, {
          actor: 'system',
          action: 'agreement.advance',
          entity: 'agreement',
          entityId: agreement.id,
          summary: `Auto-renewing policy “${agreement.name}” advanced from ${previous} to ${advancedTo}`,
          before: { renewalDate: previous },
          after: { renewalDate: advancedTo, renewalAdvancedFrom: previous },
          now,
        });
        advancedCount += 1;
      }
    }
    return advancedCount;
  });
}

export function agreementTypeLabel(type: AgreementType): string {
  switch (type) {
    case 'insurance':
      return 'Insurance policy';
    case 'service':
      return 'Service contract';
    case 'other':
      return 'Other renewal';
  }
}

function checkedAgreementFields(
  db: Db | DbTx,
  input: {
    name: string;
    type: AgreementType;
    supplierId: number | null;
    targetKind: AgreementTargetKind;
    targetId: number | null;
    autoRenew: AutoRenewStatus | null;
    renewalDate: string | null;
    switchDate: string | null;
    renewalReminderLeadDays: number | null;
    switchReminderLeadDays: number | null;
    renewalRepeatsAnnually: boolean;
    scheduleId: number | null;
    notes: string | null;
  },
  editingAgreementId: number | null = null,
  currentScheduleId: number | null = null,
): CheckedAgreementFields {
  const name = input.name.trim().replace(/\s+/g, ' ');
  if (name === '') throw new InvalidAgreementInputError('Give the contract or policy a name.');
  if (name.length > MAX_AGREEMENT_NAME_LENGTH) {
    throw new InvalidAgreementInputError(
      `Keep the name to ${MAX_AGREEMENT_NAME_LENGTH} characters or fewer.`,
    );
  }
  if (input.type !== 'insurance' && input.type !== 'service' && input.type !== 'other') {
    throw new InvalidAgreementInputError(
      'Choose an insurance policy, service contract or other renewal.',
    );
  }

  const supplierId = input.supplierId;
  if (supplierId !== null) {
    const supplier = db
      .select({ id: suppliers.id })
      .from(suppliers)
      .where(eq(suppliers.id, supplierId))
      .get();
    if (supplier === undefined)
      throw new InvalidAgreementInputError('Choose a supplier from this household.');
  }

  const targetKind = input.targetKind;
  let targetId = input.targetId;
  if (targetKind === 'household') {
    if (targetId !== null)
      throw new InvalidAgreementInputError(
        'A household agreement has no person or vehicle target.',
      );
    targetId = null;
  } else if (targetId === null || !Number.isInteger(targetId) || targetId <= 0) {
    throw new InvalidAgreementInputError('Choose the person or vehicle this agreement is for.');
  } else if (targetKind === 'person') {
    const target = db.select({ id: people.id }).from(people).where(eq(people.id, targetId)).get();
    if (target === undefined)
      throw new InvalidAgreementInputError('Choose a person from this household.');
  } else {
    const target = db
      .select({ id: vehicles.id })
      .from(vehicles)
      .where(eq(vehicles.id, targetId))
      .get();
    if (target === undefined)
      throw new InvalidAgreementInputError('Choose a vehicle from this household.');
  }

  const renewalDate = checkedOptionalDate(input.renewalDate, 'renewal date');
  const switchDate = checkedOptionalDate(input.switchDate, 'fee-free switch date');
  const renewalReminderLeadDays = checkedReminderLead(
    renewalDate === null ? null : input.renewalReminderLeadDays,
    'renewal',
  );
  const switchReminderLeadDays = checkedReminderLead(
    switchDate === null ? null : input.switchReminderLeadDays,
    'switch',
  );

  let autoRenew: AutoRenewStatus | null = null;
  if (input.type === 'insurance') {
    if (input.autoRenew !== 'yes' && input.autoRenew !== 'no' && input.autoRenew !== 'unknown') {
      throw new InvalidAgreementInputError(
        'Choose whether the insurer will auto-renew, or mark it not known.',
      );
    }
    autoRenew = input.autoRenew;
  }

  let scheduleId = input.scheduleId;
  if (scheduleId !== null) {
    const schedule = db.select().from(schedules).where(eq(schedules.id, scheduleId)).get();
    if (
      schedule === undefined ||
      schedule.kind === 'receipt' ||
      (schedule.cancelledAt !== null && currentScheduleId !== scheduleId)
    ) {
      throw new InvalidAgreementInputError(
        'Choose an active payment schedule, or leave it unlinked.',
      );
    }
    const alreadyLinked = db
      .select({ id: trackedAgreements.id })
      .from(trackedAgreements)
      .where(eq(trackedAgreements.scheduleId, scheduleId))
      .all()
      .some((row) => row.id !== editingAgreementId);
    if (alreadyLinked) {
      throw new InvalidAgreementInputError('That schedule is already linked to another agreement.');
    }
  }

  const notes = input.notes?.trim() ?? '';
  if (notes.length > MAX_AGREEMENT_NOTES_LENGTH) {
    throw new InvalidAgreementInputError(
      `Keep notes to ${MAX_AGREEMENT_NOTES_LENGTH} characters or fewer.`,
    );
  }

  return {
    name,
    type: input.type,
    supplierId,
    targetKind,
    targetId,
    autoRenew,
    renewalDate,
    switchDate,
    renewalReminderLeadDays,
    switchReminderLeadDays,
    renewalRepeatsAnnually:
      input.type === 'insurance' && renewalDate !== null && input.renewalRepeatsAnnually,
    scheduleId,
    notes: notes === '' ? null : notes,
  };
}

function checkedOptionalDate(value: string | null, label: string): string | null {
  if (value === null || value === '') return null;
  if (!isValidLocalDate(value)) {
    throw new InvalidAgreementInputError(`The ${label} must be a valid date like 2026-10-13.`);
  }
  return value;
}

function checkedReminderLead(value: number | null, label: string): number | null {
  if (value === null) return null;
  if (!Number.isInteger(value) || value < 0 || value > MAX_AGREEMENT_REMINDER_DAYS) {
    throw new InvalidAgreementInputError(
      `The ${label} reminder must be between 0 and ${MAX_AGREEMENT_REMINDER_DAYS} days before.`,
    );
  }
  return value;
}

function checkedActor(actor: string): string {
  const value = actor.trim().toLowerCase();
  if (value === '' || value.length > 254) {
    throw new InvalidAgreementInputError('A valid signed-in household member is required.');
  }
  return value;
}
