-- Add inline fields to epics table (data previously in beads.db)
ALTER TABLE `epics` ADD `title` text NOT NULL DEFAULT '';--> statement-breakpoint
ALTER TABLE `epics` ADD `description` text NOT NULL DEFAULT '';--> statement-breakpoint
ALTER TABLE `epics` ADD `priority` integer NOT NULL DEFAULT 2;--> statement-breakpoint
ALTER TABLE `epics` ADD `type` text NOT NULL DEFAULT 'task';--> statement-breakpoint
ALTER TABLE `epics` ADD `labels` text NOT NULL DEFAULT '[]';--> statement-breakpoint
ALTER TABLE `epics` ADD `assignee` text;--> statement-breakpoint
-- Drop bead_epic_id index (column kept for backward compat but no longer required)
DROP INDEX IF EXISTS `idx_epics_bead`;
