CREATE TABLE `organization_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`org_name` text NOT NULL,
	`org_type` text DEFAULT 's3' NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`review_note` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_org_requests_user` ON `organization_requests` (`user_id`);--> statement-breakpoint
CREATE INDEX `idx_org_requests_status` ON `organization_requests` (`status`);--> statement-breakpoint
ALTER TABLE `organizations` ADD `status` text DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE `organizations` ADD `org_type` text DEFAULT 's3' NOT NULL;--> statement-breakpoint
ALTER TABLE `organizations` ADD `features` text;