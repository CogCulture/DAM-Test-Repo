CREATE TABLE `org_departments` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`name` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_org_depts_org` ON `org_departments` (`organization_id`);--> statement-breakpoint
CREATE TABLE `org_permissions` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`role` text NOT NULL,
	`can_upload` integer DEFAULT true NOT NULL,
	`can_download` integer DEFAULT true NOT NULL,
	`can_delete` integer DEFAULT false NOT NULL,
	`can_create_folder` integer DEFAULT false NOT NULL,
	`can_approve_users` integer DEFAULT false NOT NULL,
	`can_edit_nomenclature` integer DEFAULT false NOT NULL,
	`can_share` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `org_permissions_organization_id_role_unique` ON `org_permissions` (`organization_id`,`role`);--> statement-breakpoint
CREATE TABLE `organizations` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `organizations_name_unique` ON `organizations` (`name`);--> statement-breakpoint
ALTER TABLE `buckets` ADD `organization_id` text DEFAULT 'org_default' NOT NULL;--> statement-breakpoint
ALTER TABLE `favorites` ADD `organization_id` text DEFAULT 'org_default' NOT NULL;--> statement-breakpoint
ALTER TABLE `files` ADD `organization_id` text DEFAULT 'org_default' NOT NULL;--> statement-breakpoint
CREATE INDEX `idx_files_org` ON `files` (`organization_id`);--> statement-breakpoint
ALTER TABLE `folder_requests` ADD `organization_id` text DEFAULT 'org_default' NOT NULL;--> statement-breakpoint
ALTER TABLE `nomenclatures` ADD `organization_id` text DEFAULT 'org_default' NOT NULL;--> statement-breakpoint
ALTER TABLE `shared` ADD `organization_id` text DEFAULT 'org_default' NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `organization_id` text;