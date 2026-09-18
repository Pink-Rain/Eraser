CREATE TABLE `campaign_characters` (
	`campaign_id` text NOT NULL,
	`character_id` text NOT NULL,
	`added_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY(`campaign_id`, `character_id`)
);
--> statement-breakpoint
CREATE INDEX `campaign_characters_character_idx` ON `campaign_characters` (`character_id`);--> statement-breakpoint
ALTER TABLE `campaign_index` ADD `description` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `campaign_index` ADD `banner_url` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `campaign_index` ADD `accent_color` text DEFAULT '#927640' NOT NULL;