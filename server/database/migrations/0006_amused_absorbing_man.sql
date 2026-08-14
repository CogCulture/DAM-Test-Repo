CREATE TABLE `favorites` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`file_id` text NOT NULL,
	`user_id` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `favorites_file_id_user_id_unique` ON `favorites` (`file_id`,`user_id`);--> statement-breakpoint
CREATE TABLE `recent_opens` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`file_id` text NOT NULL,
	`user_id` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `recent_opens_file_id_user_id_unique` ON `recent_opens` (`file_id`,`user_id`);--> statement-breakpoint
CREATE TABLE `shared` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`file_id` text NOT NULL,
	`user_id` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `shared_file_id_user_id_unique` ON `shared` (`file_id`,`user_id`);--> statement-breakpoint
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
	`parent_id` text DEFAULT 'root' NOT NULL,
	`bucket_name` text NOT NULL,
	`user_id` text NOT NULL,
	`shared_count` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_files`("id", "name", "content_type", "type", "size", "path", "visibility", "preview", "dimensions", "count", "parent_id", "bucket_name", "user_id", "shared_count", "created_at", "updated_at") SELECT "id", "name", "content_type", "type", "size", "path", "visibility", "preview", "dimensions", "count", "parent_id", "bucket_name", "user_id", 0, "created_at", "updated_at" FROM `files`;--> statement-breakpoint
DROP TABLE `files`;--> statement-breakpoint
ALTER TABLE `__new_files` RENAME TO `files`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `files_path_unique` ON `files` (`path`);
