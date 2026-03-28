-- Session audit log for tool call tracking
CREATE TABLE IF NOT EXISTS `session_audit_log` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `session_id` text NOT NULL REFERENCES `sessions`(`id`),
  `tool_name` text NOT NULL,
  `tool_input_summary` text,
  `policy_result` text NOT NULL DEFAULT 'allow',
  `user_decision` text,
  `created_at` integer NOT NULL DEFAULT (unixepoch())
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_audit_session` ON `session_audit_log` (`session_id`, `created_at`);
