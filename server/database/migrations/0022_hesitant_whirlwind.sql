CREATE TABLE `taxonomies` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`department_id` text,
	`name` text NOT NULL,
	`key` text NOT NULL,
	`type` text DEFAULT 'select' NOT NULL,
	`options` text,
	`is_required` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_taxonomies_org` ON `taxonomies` (`organization_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `taxonomies_organization_id_key_unique` ON `taxonomies` (`organization_id`,`key`);--> statement-breakpoint
ALTER TABLE `files` ADD `tags` text;--> statement-breakpoint
ALTER TABLE `files` ADD `custom_metadata` text;