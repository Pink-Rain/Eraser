CREATE TABLE `user_identity_links` (
	`local_user_id` text PRIMARY KEY NOT NULL,
	`legacy_uid` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`local_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
CREATE UNIQUE INDEX `user_identity_links_legacy_uid_unique` ON `user_identity_links` (`legacy_uid`);
