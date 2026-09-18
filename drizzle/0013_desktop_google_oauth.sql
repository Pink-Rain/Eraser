CREATE TABLE `google_oauth_flows` (
	`state` text PRIMARY KEY NOT NULL,
	`google_email` text NOT NULL,
	`code_verifier` text NOT NULL,
	`connected_by` text NOT NULL,
	`expires_at` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`connected_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
