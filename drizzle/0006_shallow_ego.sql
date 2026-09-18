CREATE TABLE `campaign_index` (
	`id` text PRIMARY KEY NOT NULL,
	`mj_uid` text NOT NULL,
	`name` text NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `campaign_index_mj_uid_idx` ON `campaign_index` (`mj_uid`);--> statement-breakpoint
CREATE TABLE `character_index` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_uid` text NOT NULL,
	`name` text NOT NULL,
	`subtitle` text DEFAULT '' NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `character_index_owner_uid_idx` ON `character_index` (`owner_uid`);--> statement-breakpoint
CREATE TABLE `sheet_index_syncs` (
	`key` text PRIMARY KEY NOT NULL,
	`synced_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
