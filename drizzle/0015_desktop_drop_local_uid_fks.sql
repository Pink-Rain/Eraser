-- google_oauth_flows.connected_by and user_identity_links.local_user_id
-- referenced the local `users` table. In desktop mode with the shared
-- eraser-accounts Worker configured (see lib/accounts-remote.ts), accounts
-- live remotely and the local `users` table stays empty, so these uids never
-- match a local row and every insert failed with a foreign key violation
-- (e.g. starting the Google Drive OAuth flow). SQLite has no ALTER TABLE
-- DROP CONSTRAINT, so the tables are recreated without the foreign keys.
CREATE TABLE `__new_google_oauth_flows` (
	`state` text PRIMARY KEY NOT NULL,
	`google_email` text NOT NULL,
	`code_verifier` text NOT NULL,
	`connected_by` text NOT NULL,
	`expires_at` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_google_oauth_flows` SELECT `state`, `google_email`, `code_verifier`, `connected_by`, `expires_at`, `created_at` FROM `google_oauth_flows`;
--> statement-breakpoint
DROP TABLE `google_oauth_flows`;
--> statement-breakpoint
ALTER TABLE `__new_google_oauth_flows` RENAME TO `google_oauth_flows`;
--> statement-breakpoint
CREATE TABLE `__new_user_identity_links` (
	`local_user_id` text PRIMARY KEY NOT NULL,
	`legacy_uid` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_user_identity_links` SELECT `local_user_id`, `legacy_uid`, `created_at`, `updated_at` FROM `user_identity_links`;
--> statement-breakpoint
DROP TABLE `user_identity_links`;
--> statement-breakpoint
ALTER TABLE `__new_user_identity_links` RENAME TO `user_identity_links`;
--> statement-breakpoint
CREATE UNIQUE INDEX `user_identity_links_legacy_uid_unique` ON `user_identity_links` (`legacy_uid`);
