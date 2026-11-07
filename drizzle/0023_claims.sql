CREATE TABLE `claim_purchases` (
	`claim_id` integer NOT NULL,
	`purchase_id` integer NOT NULL,
	FOREIGN KEY (`claim_id`) REFERENCES `claims`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`purchase_id`) REFERENCES `purchases`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `claim_purchases_claim_purchase_unique` ON `claim_purchases` (`claim_id`,`purchase_id`);--> statement-breakpoint
CREATE INDEX `claim_purchases_purchase_idx` ON `claim_purchases` (`purchase_id`);--> statement-breakpoint
CREATE TABLE `claim_settlements` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`claim_id` integer NOT NULL,
	`amount_pence` integer NOT NULL,
	`occurred_at` integer NOT NULL,
	`occurred_date` text NOT NULL,
	`kind` text NOT NULL,
	`receipt_id` integer,
	`reduces_debt_id` integer,
	`note` text,
	`created_by` text NOT NULL,
	`created_at` integer NOT NULL,
	`voided_at` integer,
	`voided_by` text,
	`void_reason` text,
	`version` integer DEFAULT 1 NOT NULL,
	FOREIGN KEY (`claim_id`) REFERENCES `claims`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`receipt_id`) REFERENCES `receipts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`reduces_debt_id`) REFERENCES `debts`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "claim_settlements_amount_positive" CHECK("claim_settlements"."amount_pence" > 0),
	CONSTRAINT "claim_settlements_receipt_link" CHECK(("claim_settlements"."kind" = 'pot') = ("claim_settlements"."receipt_id" IS NOT NULL)),
	CONSTRAINT "claim_settlements_direct_only_reduction" CHECK(("claim_settlements"."kind" = 'direct') OR ("claim_settlements"."reduces_debt_id" IS NULL))
);
--> statement-breakpoint
CREATE INDEX `claim_settlements_claim_occurred_idx` ON `claim_settlements` (`claim_id`,`occurred_at`);--> statement-breakpoint
CREATE INDEX `claim_settlements_reduces_debt_idx` ON `claim_settlements` (`reduces_debt_id`);--> statement-breakpoint
CREATE TABLE `claims` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`counterparty` text NOT NULL,
	`note` text,
	`status` text DEFAULT 'open' NOT NULL,
	`closed_reason` text,
	`closed_at` integer,
	`created_by` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`voided_at` integer,
	`voided_by` text,
	`void_reason` text,
	`version` integer DEFAULT 1 NOT NULL,
	CONSTRAINT "claims_counterparty_present" CHECK(length(trim("claims"."counterparty")) > 0),
	CONSTRAINT "claims_status_reason_pair" CHECK(("claims"."status" = 'closed') = ("claims"."closed_reason" IS NOT NULL))
);
--> statement-breakpoint
CREATE INDEX `claims_status_created_idx` ON `claims` (`status`,`created_at`);