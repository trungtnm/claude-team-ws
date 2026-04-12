ALTER TABLE sessions ADD COLUMN worktree_path TEXT;
--> statement-breakpoint
ALTER TABLE sessions ADD COLUMN worktree_branch TEXT;
--> statement-breakpoint
ALTER TABLE sessions ADD COLUMN workflow_nodes TEXT;
--> statement-breakpoint
ALTER TABLE projects ADD COLUMN worktree_merge_strategy TEXT NOT NULL DEFAULT 'leave';
