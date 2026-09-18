CREATE TABLE `class_index` (
	`id` text PRIMARY KEY NOT NULL,
	`type` text NOT NULL,
	`name` text NOT NULL,
	`image` text DEFAULT '' NOT NULL,
	`keywords_json` text DEFAULT '[]' NOT NULL,
	`difficulty` text DEFAULT 'X' NOT NULL,
	`completion` integer DEFAULT 0 NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
