CREATE TABLE `tracked_agreements` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`type` text NOT NULL,
	`supplier_id` integer,
	`target_kind` text DEFAULT 'household' NOT NULL,
	`target_id` integer,
	`auto_renew` text,
	`renewal_date` text,
	`switch_date` text,
	`renewal_reminder_lead_days` integer,
	`switch_reminder_lead_days` integer,
	`renewal_repeats_annually` integer DEFAULT false NOT NULL,
	`renewal_advanced_from` text,
	`notes` text,
	`schedule_id` integer,
	`legacy_renewal_id` integer,
	`created_by` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	FOREIGN KEY (`supplier_id`) REFERENCES `suppliers`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`schedule_id`) REFERENCES `schedules`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`legacy_renewal_id`) REFERENCES `renewals`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "tracked_agreements_type_values" CHECK("tracked_agreements"."type" IN ('insurance', 'service', 'other')),
	CONSTRAINT "tracked_agreements_auto_renew_rule" CHECK(("tracked_agreements"."type" = 'insurance' AND "tracked_agreements"."auto_renew" IN ('yes', 'no', 'unknown')) OR ("tracked_agreements"."type" <> 'insurance' AND "tracked_agreements"."auto_renew" IS NULL)),
	CONSTRAINT "tracked_agreements_reminder_leads" CHECK(("tracked_agreements"."renewal_reminder_lead_days" IS NULL OR "tracked_agreements"."renewal_reminder_lead_days" BETWEEN 0 AND 365) AND (`switch_reminder_lead_days` IS NULL OR `switch_reminder_lead_days` BETWEEN 0 AND 365))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tracked_agreements_schedule_uidx` ON `tracked_agreements` (`schedule_id`) WHERE "tracked_agreements"."schedule_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `tracked_agreements_legacy_renewal_uidx` ON `tracked_agreements` (`legacy_renewal_id`) WHERE "tracked_agreements"."legacy_renewal_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX `tracked_agreements_renewal_date_idx` ON `tracked_agreements` (`renewal_date`);--> statement-breakpoint
CREATE INDEX `tracked_agreements_switch_date_idx` ON `tracked_agreements` (`switch_date`);
--> statement-breakpoint
-- Preserve existing renewal reminders and the old schedule-level contract end
-- dates as editable agreement records. The source rows remain intact for their
-- audit/task relationships, but the new register is their authoritative view.
INSERT INTO `tracked_agreements` (
	`name`, `type`, `supplier_id`, `target_kind`, `target_id`, `auto_renew`,
	`renewal_date`, `switch_date`, `renewal_reminder_lead_days`, `switch_reminder_lead_days`,
	`renewal_repeats_annually`, `renewal_advanced_from`, `notes`, `schedule_id`,
	`legacy_renewal_id`, `created_by`, `created_at`, `updated_at`, `version`
)
SELECT
	`label`, 'other', `supplier_id`, `target_kind`, `target_id`, NULL,
	`next_renewal_date`, NULL, `warn_days_before`, NULL,
	`repeats_annually`, `advanced_from`, `notes`, NULL,
	`id`, `created_by`, `created_at`, `updated_at`, `version`
FROM `renewals`;
--> statement-breakpoint
INSERT INTO `tracked_agreements` (
	`name`, `type`, `supplier_id`, `target_kind`, `target_id`, `auto_renew`,
	`renewal_date`, `switch_date`, `renewal_reminder_lead_days`, `switch_reminder_lead_days`,
	`renewal_repeats_annually`, `renewal_advanced_from`, `notes`, `schedule_id`,
	`legacy_renewal_id`, `created_by`, `created_at`, `updated_at`, `version`
)
SELECT
	`schedules`.`name`, 'service', `schedules`.`supplier_id`, `schedules`.`target_kind`, `schedules`.`target_id`, NULL,
	NULL, `schedules`.`contract_ends_on`, NULL, 21,
	0, NULL, NULL, `schedules`.`id`,
	NULL, `schedules`.`created_by`, `schedules`.`created_at`, `schedules`.`updated_at`, `schedules`.`version`
FROM `schedules`
WHERE `schedules`.`contract_ends_on` IS NOT NULL AND `schedules`.`cancelled_at` IS NULL;
