ALTER TABLE `google_drive_authorizations` ADD `access_token_ciphertext` text;--> statement-breakpoint
ALTER TABLE `google_drive_authorizations` ADD `access_token_iv` text;--> statement-breakpoint
ALTER TABLE `google_drive_authorizations` ADD `access_token_expires_at` integer;