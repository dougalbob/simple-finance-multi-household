ALTER TABLE `pots` ADD `owner_person_id` integer REFERENCES people(id);--> statement-breakpoint
UPDATE `pots` SET `overdraft_limit_pence` = NULL, `warning_threshold_pence` = NULL WHERE `kind` = 'cash';
