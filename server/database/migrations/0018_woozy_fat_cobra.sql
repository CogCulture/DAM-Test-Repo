CREATE TABLE `org_gdrive_rules` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`enforce_nomenclature` integer DEFAULT false NOT NULL,
	`enforce_hierarchy` integer DEFAULT false NOT NULL,
	`allow_inter_dept_visibility` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `org_gdrive_rules_organization_id_unique` ON `org_gdrive_rules` (`organization_id`);