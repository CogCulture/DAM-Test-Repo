CREATE TABLE `byos_storage_configs` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`organization_id` text,
	`provider` text NOT NULL,
	`access_key_id` text,
	`secret_access_key` text,
	`bucket_name` text NOT NULL,
	`region` text,
	`endpoint` text,
	`project_id` text,
	`client_email` text,
	`private_key` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE `organization_requests` ADD `byos_config_id` text;