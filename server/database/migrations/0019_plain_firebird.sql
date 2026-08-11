CREATE TABLE `dept_invites` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`department_id` text NOT NULL,
	`email` text NOT NULL,
	`token` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `dept_invites_token_unique` ON `dept_invites` (`token`);--> statement-breakpoint
CREATE TABLE `user_permission_overrides` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`organization_id` text NOT NULL,
	`department_id` text NOT NULL,
	`can_upload` integer,
	`can_download` integer,
	`can_delete` integer,
	`can_create_folder` integer,
	`can_share` integer,
	`can_rename` integer,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_permission_overrides_user_id_unique` ON `user_permission_overrides` (`user_id`);--> statement-breakpoint
ALTER TABLE `org_departments` ADD `gdrive_folder_id` text;--> statement-breakpoint
ALTER TABLE `org_permissions` ADD `can_rename` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `organizations` ADD `setup_complete` integer DEFAULT false NOT NULL;