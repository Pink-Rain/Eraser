CREATE TABLE `roll20_campaign_links` (
	`id` text PRIMARY KEY NOT NULL,
	`campaign_id` text NOT NULL,
	`mj_uid` text NOT NULL,
	`token_hash` text NOT NULL,
	`image_token` text NOT NULL,
	`roll20_game_id` text DEFAULT '' NOT NULL,
	`roll20_game_name` text DEFAULT '' NOT NULL,
	`last_pull_at` text,
	`last_push_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `roll20_campaign_links_campaign_id_unique` ON `roll20_campaign_links` (`campaign_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `roll20_campaign_links_token_hash_unique` ON `roll20_campaign_links` (`token_hash`);--> statement-breakpoint
CREATE UNIQUE INDEX `roll20_campaign_links_image_token_unique` ON `roll20_campaign_links` (`image_token`);--> statement-breakpoint
CREATE INDEX `roll20_campaign_links_mj_uid_idx` ON `roll20_campaign_links` (`mj_uid`);