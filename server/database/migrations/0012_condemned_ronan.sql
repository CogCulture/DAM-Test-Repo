CREATE TABLE `folder_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`requested_by` text NOT NULL,
	`department_id` text NOT NULL,
	`folder_name` text NOT NULL,
	`parent_id` text DEFAULT 'root' NOT NULL,
	`bucket_name` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`reviewed_by` text,
	`review_note` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_folder_requests_dept` ON `folder_requests` (`department_id`);--> statement-breakpoint
CREATE INDEX `idx_folder_requests_status` ON `folder_requests` (`status`);--> statement-breakpoint
CREATE INDEX `idx_folder_requests_user` ON `folder_requests` (`requested_by`);--> statement-breakpoint
CREATE TABLE `nomenclatures` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`department_id` text NOT NULL,
	`template` text DEFAULT 'Brand_Campaign_Channel_Asset_Format_Version_Date' NOT NULL,
	`segments` text,
	`updated_by` text NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `nomenclatures_department_id_unique` ON `nomenclatures` (`department_id`);--> statement-breakpoint
ALTER TABLE `users` ADD `role` text DEFAULT 'team_member' NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `department_id` text;--> statement-breakpoint
ALTER TABLE `users` ADD `approval_status` text DEFAULT 'pending' NOT NULL;