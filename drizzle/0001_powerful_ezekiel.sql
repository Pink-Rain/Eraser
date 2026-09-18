CREATE TABLE `drive_connections` (
	`id` text PRIMARY KEY NOT NULL,
	`folder_id` text NOT NULL,
	`folder_name` text NOT NULL,
	`folder_url` text NOT NULL,
	`connected_by` text NOT NULL,
	`connected_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`connected_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
