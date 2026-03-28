ALTER TABLE `sessions` ADD `permission_mode` text DEFAULT 'default' NOT NULL;--> statement-breakpoint
ALTER TABLE `sessions` ADD `target_dir` text;