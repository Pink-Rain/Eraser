CREATE TABLE `admin_todos` (
	`id` text PRIMARY KEY NOT NULL,
	`creator_uid` text NOT NULL,
	`creator_name` text NOT NULL,
	`name` text DEFAULT '' NOT NULL,
	`content` text NOT NULL,
	`priority` text DEFAULT 'moyenne' NOT NULL,
	`label` text DEFAULT '' NOT NULL,
	`label_color` text DEFAULT '#927640' NOT NULL,
	`completed` text DEFAULT 'non' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`deleted_at` text
);
--> statement-breakpoint
CREATE INDEX `admin_todos_deleted_at_idx` ON `admin_todos` (`deleted_at`);--> statement-breakpoint
ALTER TABLE `campaign_index` ADD `deleted_at` text;--> statement-breakpoint
ALTER TABLE `character_index` ADD `deleted_at` text;