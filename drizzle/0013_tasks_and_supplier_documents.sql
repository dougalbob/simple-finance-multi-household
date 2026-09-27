-- Migration 0013 (v0.25.0, decision 175): tasks, and documents on a supplier.
--
-- 1. `tasks`: what the household has promised to do, as a record that can be
--    closed and reopened. Until now a promised follow-up was a nullable date on
--    the interaction log that three pages each read differently and nothing
--    could close; a date that had passed simply vanished from every list.
CREATE TABLE `tasks` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`title` text NOT NULL,
	`detail` text,
	`due_date` text,
	`subject_kind` text DEFAULT 'household' NOT NULL,
	`subject_id` integer,
	`related_interaction_id` integer,
	`completed_at` integer,
	`completed_by` text,
	`completion_note` text,
	`created_by` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	FOREIGN KEY (`related_interaction_id`) REFERENCES `supplier_interactions`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "tasks_subject_shape" CHECK(("tasks"."subject_kind" = 'household') = ("tasks"."subject_id" IS NULL)),
	CONSTRAINT "tasks_completion_pair" CHECK(("tasks"."completed_at" IS NULL) = ("tasks"."completed_by" IS NULL))
);
--> statement-breakpoint
CREATE INDEX `tasks_open_due_idx` ON `tasks` (`completed_at`,`due_date`);--> statement-breakpoint
CREATE INDEX `tasks_subject_idx` ON `tasks` (`subject_kind`,`subject_id`);--> statement-breakpoint
-- 2. Every promised follow-up becomes an open task about its supplier, whether
--    its date is still ahead or has already passed (an overdue promise is the
--    one that most needs to be seen). The title names the supplier, the detail
--    keeps what the call was about, and the task points back at the interaction
--    that produced it. Who and when are the interaction's: the promise was made
--    then. A date that is not a plain YYYY-MM-DD (the domain never wrote one,
--    but a hand-edited database might hold one) is kept as an undated task
--    rather than lost. This must run before step 4 drops the column.
INSERT INTO `tasks` (`title`, `detail`, `due_date`, `subject_kind`, `subject_id`, `related_interaction_id`, `created_by`, `created_at`, `updated_at`, `version`)
SELECT
	'Follow up with ' || s.`name`,
	si.`summary`,
	CASE WHEN si.`follow_up_date` GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]' THEN si.`follow_up_date` ELSE NULL END,
	'supplier',
	si.`supplier_id`,
	si.`id`,
	si.`created_by`,
	si.`created_at`,
	si.`created_at`,
	1
FROM `supplier_interactions` si
JOIN `suppliers` s ON s.`id` = si.`supplier_id`
WHERE si.`follow_up_date` IS NOT NULL AND trim(si.`follow_up_date`) <> ''
ORDER BY si.`id`;--> statement-breakpoint
-- Each migrated task's history says where it came from. The actor is the
-- system, like a renewal advancing itself (decision 149); the time is the
-- upgrade's.
INSERT INTO `audit_entries` (`actor`, `action`, `entity`, `entity_id`, `summary`, `before`, `after`, `created_at`)
SELECT
	'system',
	'task.migrate',
	'task',
	CAST(t.`id` AS TEXT),
	'Task created by the upgrade from the follow-up date on a logged interaction (' || t.`title` || ')',
	NULL,
	json_object('title', t.`title`, 'dueDate', t.`due_date`, 'subjectKind', t.`subject_kind`, 'subjectId', t.`subject_id`, 'relatedInteractionId', t.`related_interaction_id`),
	(CAST(strftime('%s', 'now') AS INTEGER) * 1000)
FROM `tasks` t
ORDER BY t.`id`;--> statement-breakpoint
-- 3. `attachments` gains a third owner: letters, policy documents and terms on
--    a supplier. SQLite cannot alter a CHECK, so the table is rebuilt (the same
--    shape as 0009) with the exactly-one-owner rule widened to three columns.
--    Every existing row is copied with its id, so file keys and history keep
--    pointing at the same documents. The PRAGMAs are no-ops inside the
--    migrator's transaction and are harmless: nothing references `attachments`.
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_attachments` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`purchase_id` integer,
	`receipt_id` integer,
	`supplier_id` integer,
	`file_key` text NOT NULL,
	`original_name` text NOT NULL,
	`mime` text NOT NULL,
	`size_bytes` integer NOT NULL,
	`sha256` text NOT NULL,
	`state` text DEFAULT 'stored' NOT NULL,
	`created_by` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`purchase_id`) REFERENCES `purchases`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`receipt_id`) REFERENCES `receipts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`supplier_id`) REFERENCES `suppliers`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "attachments_one_owner" CHECK(((`purchase_id` IS NOT NULL) + (`receipt_id` IS NOT NULL) + (`supplier_id` IS NOT NULL)) = 1)
);
--> statement-breakpoint
INSERT INTO `__new_attachments`("id", "purchase_id", "receipt_id", "supplier_id", "file_key", "original_name", "mime", "size_bytes", "sha256", "state", "created_by", "created_at") SELECT "id", "purchase_id", "receipt_id", NULL, "file_key", "original_name", "mime", "size_bytes", "sha256", "state", "created_by", "created_at" FROM `attachments`;--> statement-breakpoint
DROP TABLE `attachments`;--> statement-breakpoint
ALTER TABLE `__new_attachments` RENAME TO `attachments`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `attachments_file_key_unique` ON `attachments` (`file_key`);--> statement-breakpoint
CREATE INDEX `attachments_purchase_idx` ON `attachments` (`purchase_id`);--> statement-breakpoint
CREATE INDEX `attachments_receipt_idx` ON `attachments` (`receipt_id`);--> statement-breakpoint
CREATE INDEX `attachments_supplier_idx` ON `attachments` (`supplier_id`);--> statement-breakpoint
-- 4. The follow-up now lives on its task (step 2), so the interaction log stops
--    carrying it: an interaction is a record of what was said, not a to-do.
ALTER TABLE `supplier_interactions` DROP COLUMN `follow_up_date`;
