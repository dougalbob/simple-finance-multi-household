CREATE TABLE `energy_bills` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`purchase_id` integer NOT NULL,
	`period_start` text,
	`period_end` text,
	`gas_wh` integer,
	`electric_wh` integer,
	`gas_reading_start` integer,
	`gas_reading_end` integer,
	`electric_reading_start` integer,
	`electric_reading_end` integer,
	`gas_estimate_wh` integer,
	`electric_estimate_wh` integer,
	`note` text,
	`created_by` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`purchase_id`) REFERENCES `purchases`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "energy_bills_usage_present" CHECK("energy_bills"."gas_wh" IS NOT NULL OR "energy_bills"."electric_wh" IS NOT NULL),
	CONSTRAINT "energy_bills_period_order" CHECK("energy_bills"."period_start" IS NULL OR "energy_bills"."period_end" IS NULL OR "energy_bills"."period_end" >= "energy_bills"."period_start")
);
--> statement-breakpoint
CREATE UNIQUE INDEX `energy_bills_purchase_unique` ON `energy_bills` (`purchase_id`);