CREATE TABLE `project_items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`project_id` integer NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`name` text NOT NULL,
	`quantity` integer NOT NULL,
	`unit` text DEFAULT 'each' NOT NULL,
	`selected_supplier_id` integer,
	`cost_frequency` text DEFAULT 'one_off' NOT NULL,
	`category` text,
	`notes` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`selected_supplier_id`) REFERENCES `project_suppliers`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "project_items_quantity_positive" CHECK("project_items"."quantity" > 0)
);
--> statement-breakpoint
CREATE INDEX `project_items_project_idx` ON `project_items` (`project_id`,`sort_order`);--> statement-breakpoint
CREATE INDEX `project_items_selected_idx` ON `project_items` (`selected_supplier_id`);--> statement-breakpoint
CREATE TABLE `project_quotes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`project_id` integer NOT NULL,
	`item_id` integer NOT NULL,
	`supplier_id` integer NOT NULL,
	`unit_price_pence` integer,
	`pack_size` integer,
	`pack_price_pence` integer,
	`product_url` text,
	`in_stock` integer DEFAULT true NOT NULL,
	`notes` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`item_id`) REFERENCES `project_items`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`supplier_id`) REFERENCES `project_suppliers`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "project_quotes_price_form" CHECK(("project_quotes"."unit_price_pence" IS NOT NULL) OR ("project_quotes"."pack_size" IS NOT NULL AND "project_quotes"."pack_price_pence" IS NOT NULL)),
	CONSTRAINT "project_quotes_unit_nonnegative" CHECK(("project_quotes"."unit_price_pence" IS NULL) OR ("project_quotes"."unit_price_pence" >= 0)),
	CONSTRAINT "project_quotes_pack_positive" CHECK(("project_quotes"."pack_size" IS NULL) OR ("project_quotes"."pack_size" > 0)),
	CONSTRAINT "project_quotes_packprice_nonnegative" CHECK(("project_quotes"."pack_price_pence" IS NULL) OR ("project_quotes"."pack_price_pence" >= 0)),
	CONSTRAINT "project_quotes_pack_pair" CHECK(("project_quotes"."pack_size" IS NULL) = ("project_quotes"."pack_price_pence" IS NULL))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `project_quotes_item_supplier_uidx` ON `project_quotes` (`item_id`,`supplier_id`);--> statement-breakpoint
CREATE INDEX `project_quotes_project_idx` ON `project_quotes` (`project_id`);--> statement-breakpoint
CREATE INDEX `project_quotes_supplier_idx` ON `project_quotes` (`supplier_id`);--> statement-breakpoint
CREATE TABLE `project_suppliers` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`project_id` integer NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`name` text NOT NULL,
	`phone` text,
	`website_url` text,
	`notes` text,
	`delivery_fee_pence` integer DEFAULT 0 NOT NULL,
	`free_delivery_threshold_pence` integer,
	`click_and_collect_available` integer DEFAULT false NOT NULL,
	`fulfilment_choice` text DEFAULT 'delivery' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "project_suppliers_fee_nonnegative" CHECK("project_suppliers"."delivery_fee_pence" >= 0),
	CONSTRAINT "project_suppliers_threshold_positive" CHECK(("project_suppliers"."free_delivery_threshold_pence" IS NULL) OR ("project_suppliers"."free_delivery_threshold_pence" > 0)),
	CONSTRAINT "project_suppliers_collect_flag" CHECK(("project_suppliers"."fulfilment_choice" != 'collect') OR ("project_suppliers"."click_and_collect_available" = 1))
);
--> statement-breakpoint
CREATE INDEX `project_suppliers_project_idx` ON `project_suppliers` (`project_id`,`sort_order`);--> statement-breakpoint
CREATE TABLE `projects` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`project_mode` text DEFAULT 'mix_and_match' NOT NULL,
	`target_budget_pence` integer,
	`status` text DEFAULT 'researching' NOT NULL,
	`notes` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	CONSTRAINT "projects_budget_nonnegative" CHECK(("projects"."target_budget_pence" IS NULL) OR ("projects"."target_budget_pence" >= 0))
);
