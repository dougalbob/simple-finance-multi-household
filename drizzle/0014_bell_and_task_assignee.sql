CREATE TABLE `bell_seen` (
	`email` text PRIMARY KEY NOT NULL,
	`seen_at` integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE `tasks` ADD `assigned_to` text;--> statement-breakpoint
CREATE INDEX `tasks_assigned_to_idx` ON `tasks` (`assigned_to`);