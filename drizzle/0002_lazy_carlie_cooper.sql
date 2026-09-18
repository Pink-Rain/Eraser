CREATE TABLE `google_drive_authorizations` (
	`id` text PRIMARY KEY NOT NULL,
	`google_email` text NOT NULL,
	`refresh_token_ciphertext` text NOT NULL,
	`refresh_token_iv` text NOT NULL,
	`scopes` text NOT NULL,
	`connected_by` text NOT NULL,
	`connected_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`connected_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
