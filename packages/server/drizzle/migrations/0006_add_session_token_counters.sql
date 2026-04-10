ALTER TABLE sessions ADD COLUMN input_tokens_used INTEGER NOT NULL DEFAULT 0;--> statement-breakpoint
ALTER TABLE sessions ADD COLUMN output_tokens_used INTEGER NOT NULL DEFAULT 0;--> statement-breakpoint
ALTER TABLE sessions ADD COLUMN tool_calls_used INTEGER NOT NULL DEFAULT 0;
