DROP INDEX `org_permissions_organization_id_role_unique`;--> statement-breakpoint
ALTER TABLE `org_permissions` ADD `department_id` text DEFAULT 'global' NOT NULL;--> statement-breakpoint
ALTER TABLE `org_permissions` ADD `max_count` integer;--> statement-breakpoint
CREATE UNIQUE INDEX `org_permissions_organization_id_department_id_role_unique` ON `org_permissions` (`organization_id`,`department_id`,`role`);