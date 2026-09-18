CREATE TABLE `google_oauth_settings` (
	`id` text PRIMARY KEY NOT NULL,
	`client_id` text NOT NULL,
	`client_secret_ciphertext` text,
	`client_secret_iv` text,
	`configured_by` text NOT NULL,
	`configured_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`configured_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
