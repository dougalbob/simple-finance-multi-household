ALTER TABLE `tracked_agreements` ADD `legacy_schedule_id` integer REFERENCES schedules(id);--> statement-breakpoint
UPDATE `tracked_agreements`
SET `legacy_schedule_id` = `schedule_id`
WHERE `schedule_id` IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `tracked_agreements_legacy_schedule_uidx` ON `tracked_agreements` (`legacy_schedule_id`) WHERE "tracked_agreements"."legacy_schedule_id" IS NOT NULL;