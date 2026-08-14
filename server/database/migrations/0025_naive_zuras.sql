CREATE TABLE `permission_audit_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`actor_user_id` text NOT NULL,
	`target_user_id` text,
	`target_role` text,
	`department_id` text,
	`changes` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_permission_audit_org` ON `permission_audit_logs` (`organization_id`);--> statement-breakpoint
CREATE INDEX `idx_permission_audit_target` ON `permission_audit_logs` (`target_user_id`);--> statement-breakpoint
CREATE TABLE `user_department_access` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`organization_id` text NOT NULL,
	`department_id` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_user_department_access_user` ON `user_department_access` (`user_id`);--> statement-breakpoint
CREATE INDEX `idx_user_department_access_org` ON `user_department_access` (`organization_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `user_department_access_user_id_department_id_unique` ON `user_department_access` (`user_id`,`department_id`);--> statement-breakpoint
ALTER TABLE `org_permissions` ADD `can_view` integer DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `org_permissions` ADD `can_edit_metadata` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `org_permissions` ADD `can_use_rag` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `user_permission_overrides` ADD `can_view` integer;--> statement-breakpoint
ALTER TABLE `user_permission_overrides` ADD `can_edit_metadata` integer;--> statement-breakpoint
ALTER TABLE `user_permission_overrides` ADD `can_use_rag` integer;--> statement-breakpoint
ALTER TABLE `user_permission_overrides` ADD `all_department_access` integer DEFAULT false NOT NULL;