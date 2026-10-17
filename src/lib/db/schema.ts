import { sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
  type AnySQLiteColumn,
} from 'drizzle-orm/sqlite-core';

/**
 * Phase 1 slice of the data model (docs/IMPLEMENTATION_PLAN.md — data model
 * sketch). Later phases add purchases/allocations, schedules, suppliers,
 * renewals, attachments and settings via further checked-in migrations.
 * Never edit an applied migration to change its meaning (blueprint §3).
 */

export const pots = sqliteTable('pots', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  label: text('label').notNull(),
  kind: text('kind', { enum: ['bank', 'cash', 'credit-card'] }).notNull(),
  sortOrder: integer('sort_order').notNull().default(0),
  /**
   * The person this pot belongs to (v0.28.0, decision 178) — the cash-pot
   * counterpart of a vehicle's Owner. Null = shared/household pot. Only the
   * Quick Entry "Checkpoint cash" card reads it: the till opens the signed-in
   * person's own cash pot (decision 146's "who is holding the phone").
   */
  ownerPersonId: integer('owner_person_id').references(() => people.id),
  /** Bank overdraft facility or credit-card limit (pence). */
  overdraftLimitPence: integer('overdraft_limit_pence'),
  /** Bank warning threshold or card balance-usage threshold (pence). */
  warningThresholdPence: integer('warning_threshold_pence'),
  /** Usual monthly payment due day for a credit card (1–31). */
  creditCardPaymentDayOfMonth: integer('credit_card_payment_day_of_month'),
  /** Lead for card payment and promotional-end reminders; defaults to 3 days. */
  creditCardWarningDays: integer('credit_card_warning_days').notNull().default(3),
  /** The actual promotional end date from the card agreement/statement. */
  creditCardPromotionalEndDate: text('credit_card_promotional_end_date'),
  /** Current statement details, copied from the provider (not calculated). */
  creditCardStatementDueDate: text('credit_card_statement_due_date'),
  creditCardStatementMinimumPence: integer('credit_card_statement_minimum_pence'),
  archivedAt: integer('archived_at', { mode: 'timestamp_ms' }),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
  /** Optimistic concurrency counter (blueprint §3) */
  version: integer('version').notNull().default(1),
});

/**
 * A user-reported balance for a pot — "this is how much is in this pot at
 * this moment" (SPEC §5). Immutable history: a new checkpoint never edits or
 * deletes an older one.
 */
export const checkpoints = sqliteTable(
  'checkpoints',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    potId: integer('pot_id')
      .notNull()
      .references(() => pots.id),
    amountPence: integer('amount_pence').notNull(),
    effectiveAt: integer('effective_at', { mode: 'timestamp_ms' }).notNull(),
    note: text('note'),
    enteredBy: text('entered_by').notNull(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (table) => [index('checkpoints_pot_effective_idx').on(table.potId, table.effectiveAt)],
);

/**
 * Audit trail (blueprint §3): written in the same transaction as the change.
 * Corrections are edits/voids with retained history, never silent deletion.
 */
export const auditEntries = sqliteTable(
  'audit_entries',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    actor: text('actor').notNull(),
    action: text('action').notNull(),
    entity: text('entity').notNull(),
    entityId: text('entity_id').notNull(),
    summary: text('summary').notNull(),
    before: text('before'),
    after: text('after'),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (table) => [index('audit_entity_idx').on(table.entity, table.entityId)],
);

/**
 * Phase 2a core money records (docs/SPEC.md §6, §9–§10, §12).
 *
 * Conventions shared by the new tables:
 * - money is integer pence (blueprint §3);
 * - date-only facts are TEXT 'YYYY-MM-DD' in Europe/London; instants are
 *   millisecond timestamps (UTC);
 * - correctable records carry voided_at/voided_by/void_reason (retained,
 *   excluded from totals — never silently deleted) and a version counter for
 *   optimistic concurrency on shared edits.
 */

/** The two household members (labels configured privately; SPEC §3). */
export const people = sqliteTable(
  'people',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    label: text('label').notNull(),
    /**
     * Which allowlisted sign-in is this person (v0.11.0, decision 146). Lower
     * case; null until linked in Settings. Drives the till's "Paid by" and
     * vehicle defaults for whoever is signed in. Private data — never seeded
     * with a real address in the repo.
     */
    email: text('email'),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
    version: integer('version').notNull().default(1),
  },
  (table) => [uniqueIndex('people_email_unique').on(table.email)],
);

/** Vehicles as running-cost targets (SPEC §13), each with an owning person. */
export const vehicles = sqliteTable('vehicles', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  label: text('label').notNull(),
  ownerPersonId: integer('owner_person_id').references(() => people.id),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
  version: integer('version').notNull().default(1),
});

/**
 * Two-level category tree (SPEC §12): rows with parent_id NULL are parents;
 * allocations always land on a child (leaf). Retiring a child blocks new
 * assignments but preserves history.
 */
export const categories = sqliteTable(
  'categories',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    parentId: integer('parent_id').references((): AnySQLiteColumn => categories.id),
    name: text('name').notNull(),
    sortOrder: integer('sort_order').notNull().default(0),
    retiredAt: integer('retired_at', { mode: 'timestamp_ms' }),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
    version: integer('version').notNull().default(1),
  },
  (table) => [index('categories_parent_idx').on(table.parentId)],
);

/**
 * Suppliers: autocomplete memory plus the contact card (SPEC §21.1).
 * normalized_name is unique so \"Tesco\" and \"  TESCO \" cannot fork.
 */
export const suppliers = sqliteTable(
  'suppliers',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    name: text('name').notNull(),
    normalizedName: text('normalized_name').notNull(),
    contactPhone: text('contact_phone'),
    contactEmail: text('contact_email'),
    website: text('website'),
    address: text('address'),
    notes: text('notes'),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
    version: integer('version').notNull().default(1),
  },
  (table) => [uniqueIndex('suppliers_normalized_uidx').on(table.normalizedName)],
);

/**
 * Purchases, including refunds: a refund is its own record with a negative
 * total, negative allocation lines and refund_of_purchase_id set (SPEC §9.5).
 * The exact-total rule (Σ allocations = total) is enforced in the domain
 * transaction (src/lib/records/purchases.ts) and covered by tests.
 */
export const purchases = sqliteTable(
  'purchases',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    supplierId: integer('supplier_id').references(() => suppliers.id),
    potId: integer('pot_id')
      .notNull()
      .references(() => pots.id),
    totalPence: integer('total_pence').notNull(),
    occurredAt: integer('occurred_at', { mode: 'timestamp_ms' }).notNull(),
    /** Local calendar date the purchase belongs to ('YYYY-MM-DD'). */
    occurredDate: text('occurred_date').notNull(),
    paidByPersonId: integer('paid_by_person_id').references(() => people.id),
    enteredBy: text('entered_by').notNull(),
    note: text('note'),
    /**
     * Optional secondary payee or payment route (e.g. "James", "PayPal")
     * when the bank statement payee differs from the merchant/supplier.
     * Keeps statement reconciliation clear without polluting the suppliers directory.
     */
    paidVia: text('paid_via'),
    refundOfPurchaseId: integer('refund_of_purchase_id').references(
      (): AnySQLiteColumn => purchases.id,
    ),
    /**
     * Phase 3: set when the purchase was auto-converted from a schedule
     * instance (SPEC §11.2 "from schedule" tag). null for manual entry.
     */
    scheduleInstanceId: integer('schedule_instance_id'),
    /**
     * v0.10.0 fuel details (SPEC §15.1, decisions 139–141), meaningful only on
     * a fuel purchase (a Vehicle Running > Fuel line targeted at one vehicle).
     * Both figures are optional — a household in a rush adds them later — and
     * positive when present (column CHECKs in migration 0009). Litres are held
     * as whole millilitres, the way money is held as whole pence.
     * `fuelFullTank` marks a fill to the brim: mpg is measured between two of
     * those (SPEC §16.6). Non-fuel purchases carry the default and ignore it.
     */
    odometerMiles: integer('odometer_miles'),
    fuelMillilitres: integer('fuel_millilitres'),
    fuelFullTank: integer('fuel_full_tank', { mode: 'boolean' }).notNull().default(true),
    voidedAt: integer('voided_at', { mode: 'timestamp_ms' }),
    voidedBy: text('voided_by'),
    voidReason: text('void_reason'),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
    version: integer('version').notNull().default(1),
  },
  (table) => [
    check('purchases_total_nonzero', sql`${table.totalPence} != 0`),
    check(
      'purchases_refund_sign',
      sql`(${table.refundOfPurchaseId} IS NULL AND ${table.totalPence} > 0) OR (${table.refundOfPurchaseId} IS NOT NULL AND ${table.totalPence} < 0)`,
    ),
    index('purchases_pot_occurred_idx').on(table.potId, table.occurredAt),
    index('purchases_supplier_idx').on(table.supplierId),
    index('purchases_occurred_date_idx').on(table.occurredDate),
    index('purchases_refund_of_idx').on(table.refundOfPurchaseId),
    index('purchases_schedule_instance_idx').on(table.scheduleInstanceId),
  ],
);

/**
 * Allocation lines: each a whole-pence amount on exactly one leaf category
 * with exactly one target (SPEC §9.3–§9.4). target_id is NULL for household,
 * a people.id for person, a vehicles.id for vehicle (polymorphic by
 * target_kind — existence is enforced in the domain layer).
 */
export const allocations = sqliteTable(
  'allocations',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    purchaseId: integer('purchase_id')
      .notNull()
      .references(() => purchases.id),
    amountPence: integer('amount_pence').notNull(),
    categoryId: integer('category_id')
      .notNull()
      .references(() => categories.id),
    targetKind: text('target_kind', { enum: ['household', 'person', 'vehicle'] }).notNull(),
    targetId: integer('target_id'),
  },
  (table) => [
    check('allocations_amount_nonzero', sql`${table.amountPence} != 0`),
    index('allocations_purchase_idx').on(table.purchaseId),
    index('allocations_category_idx').on(table.categoryId),
  ],
);

/**
 * Pot-to-pot movements (SPEC §10): first-class records that never count as
 * spending. Included in per-pot estimates, excluded from every insight.
 */
export const transfers = sqliteTable(
  'transfers',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    fromPotId: integer('from_pot_id')
      .notNull()
      .references(() => pots.id),
    toPotId: integer('to_pot_id')
      .notNull()
      .references(() => pots.id),
    amountPence: integer('amount_pence').notNull(),
    occurredAt: integer('occurred_at', { mode: 'timestamp_ms' }).notNull(),
    occurredDate: text('occurred_date').notNull(),
    enteredBy: text('entered_by').notNull(),
    note: text('note'),
    voidedAt: integer('voided_at', { mode: 'timestamp_ms' }),
    voidedBy: text('voided_by'),
    voidReason: text('void_reason'),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
    version: integer('version').notNull().default(1),
  },
  (table) => [
    check('transfers_amount_positive', sql`${table.amountPence} > 0`),
    check('transfers_different_pots', sql`${table.fromPotId} != ${table.toPotId}`),
    index('transfers_from_occurred_idx').on(table.fromPotId, table.occurredAt),
    index('transfers_to_occurred_idx').on(table.toPotId, table.occurredAt),
  ],
);

/**
 * Phase 3: schedules, instances, receipts, renewals and settings
 * (docs/SPEC.md §11, §22, §7.3; plan data-model sketch).
 *
 * Money-record shape decision (plan OQ5, resolved in Phase 3): expected
 * receipts get their own `receipts` table rather than reusing `purchases`.
 * Income is not spending (SPEC §6): it carries no category or target, so
 * forcing it through the exact-total allocation constraint would be wrong.
 * The two tables stay one money-record abstraction at the engine level —
 * both share occurred_at/occurred_date, voided_* and version conventions,
 * and the estimate engine treats them as signed movements (receipts add).
 * A converted instance links forward (converted_record_kind/_id) and the
 * converted record links back (schedule_instance_id on purchases/receipts).
 */

export const schedules = sqliteTable(
  'schedules',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    name: text('name').notNull(),
    kind: text('kind', { enum: ['dd', 'so', 'receipt'] }).notNull(),
    frequency: text('frequency', { enum: ['monthly', 'annual'] }).notNull(),
    /** 1–31; shorter months clamp to their last day (plan OQ1). */
    dueDayOfMonth: integer('due_day_of_month').notNull(),
    /**
     * 1–12; required for annual schedules (an annual premium renews on a
     * specific month and day), null for monthly.
     */
    dueMonth: integer('due_month'),
    /** Calendar months without a payment, before any income weekend shift. */
    excludedMonths: text('excluded_months', { mode: 'json' })
      .$type<number[]>()
      .notNull()
      .default(sql`'[]'`),
    amountPence: integer('amount_pence').notNull(),
    potId: integer('pot_id')
      .notNull()
      .references(() => pots.id),
    /** Leaf category for dd/so; null for receipts (income has no category). */
    categoryId: integer('category_id').references(() => categories.id),
    /**
     * Canonical supplier for dd/so payments. Required for direct debits;
     * optional for standing orders (null = household transfer / no supplier);
     * always null for expected receipts (income is not spending).
     */
    supplierId: integer('supplier_id').references(() => suppliers.id),
    targetKind: text('target_kind', { enum: ['household', 'person', 'vehicle'] })
      .notNull()
      .default('household'),
    targetId: integer('target_id'),
    /**
     * Fixed-term contract end (SPEC §22.1): informational + alert only.
     * Instances never auto-stop because of it.
     */
    contractEndsOn: text('contract_ends_on'),
    /** Local dates ('YYYY-MM-DD'). */
    activeFrom: text('active_from').notNull(),
    activeUntil: text('active_until'),
    cancelledAt: integer('cancelled_at', { mode: 'timestamp_ms' }),
    /** Cancellation is effective from this local date (SPEC §11.2). */
    cancelledEffectiveOn: text('cancelled_effective_on'),
    createdBy: text('created_by').notNull(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
    version: integer('version').notNull().default(1),
  },
  (table) => [
    check('schedules_due_day_range', sql`${table.dueDayOfMonth} BETWEEN 1 AND 31`),
    check(
      'schedules_due_month_rule',
      sql`(
        (${table.frequency} = 'monthly' AND ${table.dueMonth} IS NULL)
        OR
        (${table.frequency} = 'annual' AND ${table.dueMonth} BETWEEN 1 AND 12)
      )`,
    ),
    check('schedules_amount_positive', sql`${table.amountPence} > 0`),
    index('schedules_kind_idx').on(table.kind),
    index('schedules_pot_idx').on(table.potId),
    index('schedules_supplier_idx').on(table.supplierId),
  ],
);

/**
 * One row per scheduled due date, in exactly one state at any moment
 * (SPEC §11.2): UPCOMING while expected, CONVERTED once the due date
 * arrives (local midnight). UNIQUE(schedule_id, due_date) enforces the
 * one-instance-per-date rule at the database level.
 */
export const scheduleInstances = sqliteTable(
  'schedule_instances',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    scheduleId: integer('schedule_id')
      .notNull()
      .references(() => schedules.id),
    dueDate: text('due_date').notNull(),
    state: text('state', { enum: ['upcoming', 'converted'] })
      .notNull()
      .default('upcoming'),
    convertedRecordKind: text('converted_record_kind', { enum: ['purchase', 'receipt'] }),
    convertedRecordId: integer('converted_record_id'),
    convertedAt: integer('converted_at', { mode: 'timestamp_ms' }),
  },
  (table) => [
    check(
      'schedule_instances_state',
      sql`(
        (${table.state} = 'upcoming'
          AND ${table.convertedRecordKind} IS NULL
          AND ${table.convertedRecordId} IS NULL
          AND ${table.convertedAt} IS NULL)
        OR
        (${table.state} = 'converted'
          AND ${table.convertedRecordKind} IS NOT NULL
          AND ${table.convertedRecordId} IS NOT NULL
          AND ${table.convertedAt} IS NOT NULL)
      )`,
    ),
    uniqueIndex('schedule_instances_schedule_date_uidx').on(table.scheduleId, table.dueDate),
  ],
);

/**
 * Income records (SPEC §6, §11.3): the money counterpart of purchases with
 * the sign flipped. No category, no target, no supplier — income is not
 * spending and never enters a spending insight. Optional schedule_instance_id
 * links a converted expected receipt back to its instance.
 *
 * `source` (migration 0006) is who/what the money came from, free text,
 * nullable — "Sale of bicycle", "Acme windows", "eBay buyer". Income carries
 * no category or target by design, so this one field plus the note carries
 * everything a one-off credit needs. A converted expected receipt leaves it
 * NULL: its origin is the schedule, resolvable through the back-reference
 * and re-read live, so a renamed schedule reads correctly in history.
 */
export const receipts = sqliteTable(
  'receipts',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    scheduleInstanceId: integer('schedule_instance_id'),
    potId: integer('pot_id')
      .notNull()
      .references(() => pots.id),
    amountPence: integer('amount_pence').notNull(),
    occurredAt: integer('occurred_at', { mode: 'timestamp_ms' }).notNull(),
    occurredDate: text('occurred_date').notNull(),
    enteredBy: text('entered_by').notNull(),
    source: text('source'),
    note: text('note'),
    voidedAt: integer('voided_at', { mode: 'timestamp_ms' }),
    voidedBy: text('voided_by'),
    voidReason: text('void_reason'),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
    version: integer('version').notNull().default(1),
  },
  (table) => [
    check('receipts_amount_positive', sql`${table.amountPence} > 0`),
    index('receipts_pot_occurred_idx').on(table.potId, table.occurredAt),
    index('receipts_occurred_date_idx').on(table.occurredDate),
    index('receipts_schedule_instance_idx').on(table.scheduleInstanceId),
  ],
);

/**
 * Renewals (SPEC §22.2): insurance and anything else that auto-renews.
 * A renewal is an alert plus context — where the money also moves (an
 * annual premium), that is a separate annual schedule (plan decision 24);
 * the two never double-count.
 */
export const renewals = sqliteTable(
  'renewals',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    label: text('label').notNull(),
    supplierId: integer('supplier_id').references(() => suppliers.id),
    targetKind: text('target_kind', { enum: ['household', 'person', 'vehicle'] })
      .notNull()
      .default('household'),
    targetId: integer('target_id'),
    nextRenewalDate: text('next_renewal_date').notNull(),
    /** Per-item warning lead in days; default 21 (SPEC §22.2). */
    warnDaysBefore: integer('warn_days_before').notNull().default(21),
    repeatsAnnually: integer('repeats_annually', { mode: 'boolean' }).notNull().default(true),
    notes: text('notes'),
    /** The date displaced by the last annual auto-advance (history). */
    advancedFrom: text('advanced_from'),
    createdBy: text('created_by').notNull(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
    version: integer('version').notNull().default(1),
  },
  (table) => [
    check('renewals_lead_non_negative', sql`${table.warnDaysBefore} >= 0`),
    index('renewals_date_idx').on(table.nextRenewalDate),
  ],
);

/**
 * Tracked contracts and policies (SPEC §22, agreement register refresh).
 * This is deliberately separate from schedules: a household can track a
 * policy paid by card/manual payment, while a schedule remains only the
 * expected movement of money. `schedule_id` is an optional link between the
 * two. Legacy renewals/schedule end dates are copied here by migration 0017;
 * their source ids keep deep links and the legacy audit trail intelligible.
 */
export const trackedAgreements = sqliteTable(
  'tracked_agreements',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    name: text('name').notNull(),
    type: text('type', { enum: ['insurance', 'service', 'other'] }).notNull(),
    supplierId: integer('supplier_id').references(() => suppliers.id),
    targetKind: text('target_kind', { enum: ['household', 'person', 'vehicle'] })
      .notNull()
      .default('household'),
    targetId: integer('target_id'),
    /** Provider behaviour, not whether this app repeats a reminder. */
    autoRenew: text('auto_renew', { enum: ['yes', 'no', 'unknown'] }),
    /** Next policy renewal/review date, where one exists. */
    renewalDate: text('renewal_date'),
    /** Earliest date the household can switch/cancel without an exit fee. */
    switchDate: text('switch_date'),
    /** Null means no in-app reminder; otherwise days before the event. */
    renewalReminderLeadDays: integer('renewal_reminder_lead_days'),
    switchReminderLeadDays: integer('switch_reminder_lead_days'),
    /** The policy has an annual reminder cycle; only provider auto-renew=yes advances itself. */
    renewalRepeatsAnnually: integer('renewal_repeats_annually', { mode: 'boolean' })
      .notNull()
      .default(false),
    /** The date displaced by the most recent automatic annual reminder advance. */
    renewalAdvancedFrom: text('renewal_advanced_from'),
    notes: text('notes'),
    /** One optional schedule may be linked to one tracked agreement. */
    scheduleId: integer('schedule_id').references(() => schedules.id),
    /** Original schedule source id stays even if the optional link is later removed. */
    legacyScheduleId: integer('legacy_schedule_id').references(() => schedules.id),
    /** Source ids for a non-destructive migration of existing rows. */
    legacyRenewalId: integer('legacy_renewal_id').references(() => renewals.id),
    createdBy: text('created_by').notNull(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
    version: integer('version').notNull().default(1),
  },
  (table) => [
    check(
      'tracked_agreements_type_values',
      sql`${table.type} IN ('insurance', 'service', 'other')`,
    ),
    check(
      'tracked_agreements_auto_renew_rule',
      sql`(${table.type} = 'insurance' AND ${table.autoRenew} IN ('yes', 'no', 'unknown')) OR (${table.type} <> 'insurance' AND ${table.autoRenew} IS NULL)`,
    ),
    check(
      'tracked_agreements_reminder_leads',
      sql`(${table.renewalReminderLeadDays} IS NULL OR ${table.renewalReminderLeadDays} BETWEEN 0 AND 365) AND (${table.switchReminderLeadDays} IS NULL OR ${table.switchReminderLeadDays} BETWEEN 0 AND 365)`,
    ),
    uniqueIndex('tracked_agreements_schedule_uidx')
      .on(table.scheduleId)
      .where(sql`${table.scheduleId} IS NOT NULL`),
    uniqueIndex('tracked_agreements_legacy_schedule_uidx')
      .on(table.legacyScheduleId)
      .where(sql`${table.legacyScheduleId} IS NOT NULL`),
    uniqueIndex('tracked_agreements_legacy_renewal_uidx')
      .on(table.legacyRenewalId)
      .where(sql`${table.legacyRenewalId} IS NOT NULL`),
    index('tracked_agreements_renewal_date_idx').on(table.renewalDate),
    index('tracked_agreements_switch_date_idx').on(table.switchDate),
  ],
);

/**
 * Private runtime settings (plan data-model sketch): projection figures,
 * key-date lead, household labels. Values are stored as TEXT and typed by
 * the domain accessor (src/lib/records/settings.ts). Real figures live
 * only in the private installation (SPEC §19).
 */
export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
  updatedBy: text('updated_by').notNull(),
  version: integer('version').notNull().default(1),
});

export const supplierReferences = sqliteTable('supplier_references', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  supplierId: integer('supplier_id')
    .notNull()
    .references(() => suppliers.id),
  label: text('label').notNull(),
  value: text('value').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
});
/**
 * The interaction log (SPEC §21.2): a record of conversations — what was said
 * or sent, and who wrote it down. It is not a to-do list. Until v0.25.0 a
 * promised follow-up was a nullable `follow_up_date` column here, which three
 * pages each read differently and nothing could close; migration 0013 moved
 * every such date into `tasks` (decision 175) and dropped the column. Saving
 * an interaction with a follow-up date now creates a task in the same
 * transaction, pointing back here through `tasks.related_interaction_id`.
 */
export const supplierInteractions = sqliteTable('supplier_interactions', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  supplierId: integer('supplier_id')
    .notNull()
    .references(() => suppliers.id),
  occurredAt: integer('occurred_at', { mode: 'timestamp_ms' }).notNull(),
  channel: text('channel').notNull(),
  summary: text('summary').notNull(),
  outcome: text('outcome'),
  relatedPurchaseId: integer('related_purchase_id'),
  relatedRenewalId: integer('related_renewal_id'),
  createdBy: text('created_by').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
});

/**
 * Tasks (SPEC §25, decision 175): things the household has committed to do —
 * "Research cheaper tariffs", "Chase the refund", "Ring the broker back".
 *
 * - **About something, not *for* someone.** `subject_kind`/`subject_id` name
 *   what the task concerns: a supplier, a purchase, a vehicle, or the
 *   household (the only kind with no id). Deliberately NOT `target_kind`:
 *   that vocabulary is SPEC §9.2 "who was this spend for", and its helper
 *   prints `household` for any kind it does not know — a supplier task would
 *   silently read "household". There is no foreign key on `subject_id` (one
 *   generic pair, so a new kind never needs a table rebuild); the domain layer
 *   checks the subject exists when a task is created, and `subjectLabel()`
 *   degrades to the bare kind if it has gone since.
 * - **An undated task is still a task:** `due_date` ('YYYY-MM-DD', local) is
 *   nullable. There is no recurrence — the yearly case is renewals and key
 *   dates, which already roll themselves.
 * - **Closed, never deleted.** `completed_at`/`completed_by` (and an optional
 *   note) close a task; reopening clears them. Both are versioned and audited,
 *   exactly like renewals. A promise that is no longer needed is closed with a
 *   note, not removed.
 * - `related_interaction_id` is provenance: the logged call whose follow-up
 *   date created this task.
 * - `assigned_to` (v0.26.0, decision 176): who the task is for. Null means
 *   the household — both people see it in the bell count. A lower-cased email
 *   means only that person counts it (e.g. "Query brake disc invoice" only
 *   for one of us). The task itself stays visible to both (SPEC §3 — full
 *   mutual visibility); the bell filters by this field. No FK — resolved in
 *   the domain layer, same as `created_by`.
 */
export const tasks = sqliteTable(
  'tasks',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    /** Short and imperative: "Research cheaper tariffs". */
    title: text('title').notNull(),
    /** Optional longer note — research, a reference, what was agreed. */
    detail: text('detail'),
    /** Local calendar date the task is due by, or null for an undated task. */
    dueDate: text('due_date'),
    subjectKind: text('subject_kind', {
      enum: ['supplier', 'purchase', 'vehicle', 'household'],
    })
      .notNull()
      .default('household'),
    /** Null only for 'household'. No FK — resolved in the domain layer. */
    subjectId: integer('subject_id'),
    relatedInteractionId: integer('related_interaction_id').references(
      () => supplierInteractions.id,
    ),
    /** Null while the task is open. */
    completedAt: integer('completed_at', { mode: 'timestamp_ms' }),
    completedBy: text('completed_by'),
    /** Optional words recorded when the task was closed ("switched to FixCo"). */
    completionNote: text('completion_note'),
    /**
     * Who the task is for (v0.26.0, decision 176). Null = household (both
     * people count it in the bell). A lower-cased email = only that person.
     */
    assignedTo: text('assigned_to'),
    createdBy: text('created_by').notNull(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
    version: integer('version').notNull().default(1),
  },
  (table) => [
    check(
      'tasks_subject_shape',
      sql`(${table.subjectKind} = 'household') = (${table.subjectId} IS NULL)`,
    ),
    check(
      'tasks_completion_pair',
      sql`(${table.completedAt} IS NULL) = (${table.completedBy} IS NULL)`,
    ),
    index('tasks_open_due_idx').on(table.completedAt, table.dueDate),
    index('tasks_subject_idx').on(table.subjectKind, table.subjectId),
    index('tasks_assigned_to_idx').on(table.assignedTo),
  ],
);

/**
 * Bell seen state (SPEC §26, decision 176): when each person last opened the
 * bell panel. UI state, not a record — not audited, same as the theme cookie.
 * Email is lower-cased, primary key. One row per person.
 */
export const bellSeen = sqliteTable('bell_seen', {
  email: text('email').primaryKey(),
  seenAt: integer('seen_at', { mode: 'timestamp_ms' }).notNull(),
});
/**
 * Documents attached to a record (SPEC §23): receipts and invoices on a
 * purchase, since v0.10.0 payslips and similar on an income record (a
 * `receipts` row — decision 138), and since v0.25.0 letters and policy
 * documents on a supplier (decision 175). Exactly one owner per row, enforced
 * by a CHECK (migration 0009, widened to three owners by 0013). One table
 * keeps one pipeline: the serving route, the backup manifest and the restore
 * check never need to know the owner.
 */
export const attachments = sqliteTable(
  'attachments',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    purchaseId: integer('purchase_id').references(() => purchases.id),
    receiptId: integer('receipt_id').references(() => receipts.id),
    supplierId: integer('supplier_id').references(() => suppliers.id),
    fileKey: text('file_key').notNull().unique(),
    originalName: text('original_name').notNull(),
    mime: text('mime').notNull(),
    sizeBytes: integer('size_bytes').notNull(),
    sha256: text('sha256').notNull(),
    state: text('state').notNull().default('stored'),
    createdBy: text('created_by').notNull(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (table) => [
    check(
      'attachments_one_owner',
      sql`((${table.purchaseId} IS NOT NULL) + (${table.receiptId} IS NOT NULL) + (${table.supplierId} IS NOT NULL)) = 1`,
    ),
    index('attachments_purchase_idx').on(table.purchaseId),
    index('attachments_receipt_idx').on(table.receiptId),
    index('attachments_supplier_idx').on(table.supplierId),
  ],
);

/**
 * Phase 6: informal debts — money the household owes someone outside it, or
 * is owed by them (SPEC §10.2). A debt is a named IOU with a counterparty
 * (\"Mum\", \"our son\") and a direction; its outstanding balance is derived
 * from the linked loan movements, never stored, so the balance can never
 * drift from the movements it claims to summarise. No interest, no
 * schedules — repayments simply reduce the balance.
 */
export const debts = sqliteTable('debts', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  counterparty: text('counterparty').notNull(),
  direction: text('direction', { enum: ['we_owe', 'they_owe'] }).notNull(),
  note: text('note'),
  /**
   * An expected, read-only inflow (SPEC §10.2, v0.5.0): a support loan that
   * arrives around the same day every month. Feeds projections only — the
   * real deposit still goes through Borrow and Repay, which moves the pot
   * estimate and the derived balance. Amount and day are set together or
   * both null (enforced in the domain + Zod boundary). Since v0.7.0 the pair
   * may carry an inclusive until date; that is optional on its own.
   */
  expectedInflowAmountPence: integer('expected_inflow_amount_pence'),
  expectedInflowDayOfMonth: integer('expected_inflow_day_of_month'),
  /**
   * Optional **inclusive** end of the arrangement (SPEC §10.2, v0.7.0): the
   * last day-of-month occurrence that is expected. null = open-ended, until
   * the household clears the expectation. The form's "continuing for 5
   * payments" helper computes this date; the occurrences themselves stay
   * derived, never stored.
   */
  expectedInflowUntilDate: text('expected_inflow_until_date'),
  createdBy: text('created_by').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
  version: integer('version').notNull().default(1),
});

/**
 * Phase 6: money crossing the household boundary that is neither salary nor
 * spending (SPEC §10.2) — borrowing and repayments (kind `loan`, always
 * linked to a debt), the two legs of a cash-for-bank style swap (kind
 * `swap`, always created as a pair sharing one exchange key), and anything
 * else with a note saying what it was (kind `other`). External movements
 * move pot estimates like receipts (in) and spending (out) but never enter
 * Insights; the join over `allocations` excludes them by construction.
 */
export const externalMovements = sqliteTable(
  'external_movements',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    potId: integer('pot_id')
      .notNull()
      .references(() => pots.id),
    direction: text('direction', { enum: ['in', 'out'] }).notNull(),
    kind: text('kind', { enum: ['loan', 'swap', 'other'] }).notNull(),
    amountPence: integer('amount_pence').notNull(),
    occurredAt: integer('occurred_at', { mode: 'timestamp_ms' }).notNull(),
    /** Local calendar date the movement belongs to ('YYYY-MM-DD'). */
    occurredDate: text('occurred_date').notNull(),
    /** Who the money came from or went to — copied from the debt for loans. */
    counterparty: text('counterparty').notNull(),
    debtId: integer('debt_id').references(() => debts.id),
    /** Swap-pairing key: the two legs of one exchange share it, nothing else carries it. */
    exchangeKey: text('exchange_key'),
    note: text('note'),
    enteredBy: text('entered_by').notNull(),
    voidedAt: integer('voided_at', { mode: 'timestamp_ms' }),
    voidedBy: text('voided_by'),
    voidReason: text('void_reason'),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
    version: integer('version').notNull().default(1),
  },
  (table) => [
    check('external_movements_amount_positive', sql`${table.amountPence} > 0`),
    check(
      'external_movements_loan_link',
      sql`(${table.kind} != 'loan') OR (${table.debtId} IS NOT NULL AND ${table.exchangeKey} IS NULL)`,
    ),
    check(
      'external_movements_swap_link',
      sql`(${table.kind} != 'swap') OR (${table.exchangeKey} IS NOT NULL AND ${table.debtId} IS NULL)`,
    ),
    check(
      'external_movements_other_link',
      sql`(${table.kind} != 'other') OR (${table.debtId} IS NULL AND ${table.exchangeKey} IS NULL)`,
    ),
    index('external_movements_pot_occurred_idx').on(table.potId, table.occurredAt),
    index('external_movements_occurred_date_idx').on(table.occurredDate),
    index('external_movements_debt_idx').on(table.debtId),
    index('external_movements_exchange_idx').on(table.exchangeKey),
  ],
);

/**
 * Projects — Project Costing &amp; Supplier Optimiser (PROJECTS_IMPLEMENTATION.MD,
 * decision 181, SPEC §27). One costing matrix serves DIY projects now and
 * holiday/TCO comparisons later without a schema rewrite:
 *
 * - rows `project_items` = what you need (materials / trip legs / cost lines);
 * - columns `project_suppliers` = merchants in 'mix_and_match' mode, or
 *   mutually exclusive candidates in 'compare_options' mode;
 * - cells `project_quotes` = one row's price from one column.
 *
 * These are planning records, not money records: they never touch pots,
 * purchases, estimates or Insights. Money is integer pence like everywhere
 * else; every mutable row carries a version counter and every write is
 * audited (the standing domain rules).
 */
export const projects = sqliteTable(
  'projects',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    name: text('name').notNull(),
    /**
     * 'mix_and_match' (Phase 1 default — DIY &amp; holidays: one cell per row,
     * grouped by supplier with delivery rules) or 'compare_options' (Phase 4 —
     * columns are whole candidates; sums run vertically by cost_frequency).
     */
    projectMode: text('project_mode', { enum: ['mix_and_match', 'compare_options'] })
      .notNull()
      .default('mix_and_match'),
    /** Optional budget for the grand-total under/over status (pence). */
    targetBudgetPence: integer('target_budget_pence'),
    status: text('status', {
      enum: ['researching', 'ready_to_order', 'completed'],
    })
      .notNull()
      .default('researching'),
    notes: text('notes'),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
    version: integer('version').notNull().default(1),
  },
  (table) => [
    check(
      'projects_budget_nonnegative',
      sql`(${table.targetBudgetPence} IS NULL) OR (${table.targetBudgetPence} >= 0)`,
    ),
  ],
);

/**
 * Columns of the costing matrix: the suppliers/merchants a project is quoting
 * with (deliberately separate from the contact book's `suppliers`, SPEC §21 —
 * a project supplier is a quote source for one plan, not a household record).
 *
 * Delivery pricing (PROJECTS_IMPLEMENTATION.MD §4.4): the flat fee is incurred
 * once if ≥1 item is ordered from this supplier; meeting the free-delivery
 * threshold on the materials subtotal waives it; fulfilment 'collect' waives
 * it regardless.
 */
export const projectSuppliers = sqliteTable(
  'project_suppliers',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    projectId: integer('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    sortOrder: integer('sort_order').notNull().default(0),
    name: text('name').notNull(),
    phone: text('phone'),
    websiteUrl: text('website_url'),
    notes: text('notes'),
    /** Flat delivery charge, pence, incurred once per order from this supplier. */
    deliveryFeePence: integer('delivery_fee_pence').notNull().default(0),
    /** Materials subtotal at or above this (pence) makes delivery free. */
    freeDeliveryThresholdPence: integer('free_delivery_threshold_pence'),
    clickAndCollectAvailable: integer('click_and_collect_available', { mode: 'boolean' })
      .notNull()
      .default(false),
    fulfilmentChoice: text('fulfilment_choice', { enum: ['delivery', 'collect'] })
      .notNull()
      .default('delivery'),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
    version: integer('version').notNull().default(1),
  },
  (table) => [
    check('project_suppliers_fee_nonnegative', sql`${table.deliveryFeePence} >= 0`),
    check(
      'project_suppliers_threshold_positive',
      sql`(${table.freeDeliveryThresholdPence} IS NULL) OR (${table.freeDeliveryThresholdPence} > 0)`,
    ),
    check(
      'project_suppliers_collect_flag',
      sql`(${table.fulfilmentChoice} != 'collect') OR (${table.clickAndCollectAvailable} = 1)`,
    ),
    index('project_suppliers_project_idx').on(table.projectId, table.sortOrder),
  ],
);

/**
 * Rows of the costing matrix: the bill of materials / cost lines.
 * `quantity` is whole units (boards, posts, packs, days, years); `unit` names
 * the unit. `selected_supplier_id` stores the user's manual pick for the row —
 * it points at a supplier that must carry a quote for this item (enforced in
 * the domain, not by the FK). `cost_frequency` is dormant in Phase 1 and
 * unlocks car/TCO running costs in Phase 4.
 */
export const projectItems = sqliteTable(
  'project_items',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    projectId: integer('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    sortOrder: integer('sort_order').notNull().default(0),
    name: text('name').notNull(),
    quantity: integer('quantity').notNull(),
    unit: text('unit').notNull().default('each'),
    selectedSupplierId: integer('selected_supplier_id').references(
      (): AnySQLiteColumn => projectSuppliers.id,
      { onDelete: 'set null' },
    ),
    costFrequency: text('cost_frequency', { enum: ['one_off', 'annual', 'monthly'] })
      .notNull()
      .default('one_off'),
    category: text('category'),
    notes: text('notes'),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
    version: integer('version').notNull().default(1),
  },
  (table) => [
    check('project_items_quantity_positive', sql`${table.quantity} > 0`),
    index('project_items_project_idx').on(table.projectId, table.sortOrder),
    index('project_items_selected_idx').on(table.selectedSupplierId),
  ],
);

/**
 * Cells of the costing matrix: one item's quote from one supplier. Unique on
 * (item_id, supplier_id) — one quote per cell. Pricing: either a unit price,
 * or pack pricing (sold in packs of N at £P; required packs =
 * ceil(quantity / pack_size)). Prices are inc. VAT, integer pence.
 */
export const projectQuotes = sqliteTable(
  'project_quotes',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    projectId: integer('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    itemId: integer('item_id')
      .notNull()
      .references(() => projectItems.id, { onDelete: 'cascade' }),
    supplierId: integer('supplier_id')
      .notNull()
      .references(() => projectSuppliers.id, { onDelete: 'cascade' }),
    /** Price per unit, inc. VAT (pence). Null on a pack-only quote. */
    unitPricePence: integer('unit_price_pence'),
    /** Pack-only quotes: sold in packs of N … */
    packSize: integer('pack_size'),
    /** … at £P per pack, inc. VAT. */
    packPricePence: integer('pack_price_pence'),
    productUrl: text('product_url'),
    inStock: integer('in_stock', { mode: 'boolean' }).notNull().default(true),
    notes: text('notes'),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
    version: integer('version').notNull().default(1),
  },
  (table) => [
    uniqueIndex('project_quotes_item_supplier_uidx').on(table.itemId, table.supplierId),
    check(
      'project_quotes_price_form',
      sql`(${table.unitPricePence} IS NOT NULL) OR (${table.packSize} IS NOT NULL AND ${table.packPricePence} IS NOT NULL)`,
    ),
    check(
      'project_quotes_unit_nonnegative',
      sql`(${table.unitPricePence} IS NULL) OR (${table.unitPricePence} >= 0)`,
    ),
    check(
      'project_quotes_pack_positive',
      sql`(${table.packSize} IS NULL) OR (${table.packSize} > 0)`,
    ),
    check(
      'project_quotes_packprice_nonnegative',
      sql`(${table.packPricePence} IS NULL) OR (${table.packPricePence} >= 0)`,
    ),
    check(
      'project_quotes_pack_pair',
      sql`(${table.packSize} IS NULL) = (${table.packPricePence} IS NULL)`,
    ),
    index('project_quotes_project_idx').on(table.projectId),
    index('project_quotes_supplier_idx').on(table.supplierId),
  ],
);

/**
 * The long-term forecast's saved assumptions (LONGTERM_FORECASTING.md §9,
 * slice 2). One row per household holds the whole plan as a versioned JSON
 * payload — people and their optional streams, pension pots, investments,
 * windfalls, spending, commitments and the comparison rates. Pensions and
 * investments stay inside the payload at v1; promote them to tables only with
 * a real need. The row carries the same optimistic-concurrency `version`
 * counter as every other correctable record.
 */
export const longtermPlans = sqliteTable(
  'longterm_plans',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    name: text('name').notNull(),
    /** JSON `LongTermPlanDocument` (src/lib/longterm/plan.ts), validated on read and write. */
    payload: text('payload').notNull(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
    version: integer('version').notNull().default(1),
  },
  (table) => [uniqueIndex('longterm_plans_name_unique').on(table.name)],
);
