CREATE TABLE `jdr_google_sheets` (
	`key` text PRIMARY KEY NOT NULL,
	`spreadsheet_id` text NOT NULL,
	`name` text NOT NULL,
	`tab_name` text NOT NULL,
	`web_view_link` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
