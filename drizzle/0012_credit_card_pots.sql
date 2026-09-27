ALTER TABLE `pots` ADD `credit_card_payment_day_of_month` integer;--> statement-breakpoint
ALTER TABLE `pots` ADD `credit_card_warning_days` integer DEFAULT 3 NOT NULL;--> statement-breakpoint
ALTER TABLE `pots` ADD `credit_card_promotional_end_date` text;--> statement-breakpoint
ALTER TABLE `pots` ADD `credit_card_statement_due_date` text;--> statement-breakpoint
ALTER TABLE `pots` ADD `credit_card_statement_minimum_pence` integer;
