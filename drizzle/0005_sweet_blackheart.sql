CREATE TABLE `google_apps_script_integrations` (
	`key` text PRIMARY KEY NOT NULL,
	`spreadsheet_id` text NOT NULL,
	`script_id` text NOT NULL,
	`deployment_id` text,
	`last_error` text,
	`last_run_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
