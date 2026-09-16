ALTER TABLE `files` ADD `department_id` text;--> statement-breakpoint
ALTER TABLE `files` ADD `processing_status` text DEFAULT 'pending_processing' NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_files_department_id` ON `files` (`department_id`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_files_processing_status` ON `files` (`processing_status`);
