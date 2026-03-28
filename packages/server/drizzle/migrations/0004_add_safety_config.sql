-- Add safety configuration to projects table
ALTER TABLE `projects` ADD `safety_mode` text NOT NULL DEFAULT 'a';--> statement-breakpoint
ALTER TABLE `projects` ADD `command_policy` text;--> statement-breakpoint
ALTER TABLE `projects` ADD `max_session_input_tokens` integer;--> statement-breakpoint
ALTER TABLE `projects` ADD `max_session_output_tokens` integer;--> statement-breakpoint
ALTER TABLE `projects` ADD `max_session_tool_calls` integer;
