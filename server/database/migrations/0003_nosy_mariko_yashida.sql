PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_files` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`content_type` text NOT NULL,
	`type` text NOT NULL,
	`size` integer NOT NULL,
	`path` text NOT NULL,
	`visibility` text DEFAULT 'inherit' NOT NULL,
	`preview` text,
	`dimensions` text,
	`count` integer DEFAULT 0 NOT NULL,
	`folder_id` text DEFAULT 'root' NOT NULL,
	`user_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_files`("id", "name", "content_type", "type", "size", "path", "visibility", "preview", "dimensions", "count", "folder_id", "user_id", "created_at", "updated_at") SELECT "id", "name", "content_type", "type", "size", "path", "visibility", "preview", "dimensions", "count", 'root', "user_id", "created_at", "updated_at" FROM `files`;--> statement-breakpoint
DROP TABLE `files`;--> statement-breakpoint
ALTER TABLE `__new_files` RENAME TO `files`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `files_path_unique` ON `files` (`path`);
