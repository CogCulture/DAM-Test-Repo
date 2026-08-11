ALTER TABLE `byos_storage_configs` ADD `gcs_connection_mode` text;--> statement-breakpoint
ALTER TABLE `byos_storage_configs` ADD `gcs_access_token` text;--> statement-breakpoint
ALTER TABLE `byos_storage_configs` ADD `gcs_refresh_token` text;--> statement-breakpoint
ALTER TABLE `byos_storage_configs` ADD `gcs_token_expires_at` integer;