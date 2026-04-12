import { sqliteTable, text, integer, real, primaryKey, uniqueIndex, index } from 'drizzle-orm/sqlite-core'
import { sql } from 'drizzle-orm'

// ─── Users ───────────────────────────────────────────────────────────────────

export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').unique(),
  role: text('role', { enum: ['pm', 'dev', 'techlead', 'viewer'] }).notNull().default('dev'),
  api_key: text('api_key').unique(),
  avatar_url: text('avatar_url'),
  created_at: integer('created_at').notNull().default(sql`(unixepoch())`),
  updated_at: integer('updated_at').notNull().default(sql`(unixepoch())`),
}, (table) => [
  index('idx_users_email').on(table.email),
  index('idx_users_api_key').on(table.api_key),
])

// ─── Projects ────────────────────────────────────────────────────────────────

export const projects = sqliteTable('projects', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  project_root: text('project_root').notNull().unique(),
  max_concurrent_agents: integer('max_concurrent_agents').notNull().default(3),
  ask_question_mode: text('ask_question_mode', { enum: ['pause', 'auto', 'hybrid'] }).notNull().default('hybrid'),
  safety_mode: text('safety_mode', { enum: ['a', 'b'] }).notNull().default('a'),
  command_policy: text('command_policy'),
  max_session_input_tokens: integer('max_session_input_tokens'),
  max_session_output_tokens: integer('max_session_output_tokens'),
  max_session_tool_calls: integer('max_session_tool_calls'),
  worktree_merge_strategy: text('worktree_merge_strategy', {
    enum: ['leave', 'push', 'pr'],
  }).notNull().default('leave'),
  picture_url: text('picture_url'),
  created_at: integer('created_at').notNull().default(sql`(unixepoch())`),
  updated_at: integer('updated_at').notNull().default(sql`(unixepoch())`),
})

// ─── Repos ───────────────────────────────────────────────────────────────────

export const repos = sqliteTable('repos', {
  id: text('id').primaryKey(),
  project_id: text('project_id').notNull().references(() => projects.id),
  name: text('name').notNull(),
  git_url: text('git_url'),
  path: text('path').notNull(),
  default_branch: text('default_branch').notNull().default('main'),
  link_mode: text('link_mode', { enum: ['clone', 'symlink'] }).notNull().default('clone'),
  status: text('status', { enum: ['cloning', 'ready', 'error'] }).notNull().default('ready'),
  added_by: text('added_by').notNull().references(() => users.id),
  created_at: integer('created_at').notNull().default(sql`(unixepoch())`),
}, (table) => [
  index('idx_repos_project').on(table.project_id),
  uniqueIndex('idx_repos_project_name').on(table.project_id, table.name),
])

// ─── Project Members ─────────────────────────────────────────────────────────

export const projectMembers = sqliteTable('project_members', {
  project_id: text('project_id').notNull().references(() => projects.id),
  user_id: text('user_id').notNull().references(() => users.id),
  role_override: text('role_override', { enum: ['pm', 'dev', 'techlead', 'viewer'] }),
  created_at: integer('created_at').notNull().default(sql`(unixepoch())`),
}, (table) => [
  primaryKey({ columns: [table.project_id, table.user_id] }),
])

// ─── Captures ────────────────────────────────────────────────────────────────

export const captures = sqliteTable('captures', {
  id: text('id').primaryKey(),
  project_id: text('project_id').notNull().references(() => projects.id),
  user_id: text('user_id').notNull().references(() => users.id),
  text: text('text').notNull(),
  status: text('status', { enum: ['pending', 'triaged', 'deferred', 'dismissed'] }).notNull().default('pending'),
  triage_result: text('triage_result'),
  attachments: text('attachments').notNull().default('[]'), // JSON: [{filename, mimeType, url}]
  created_at: integer('created_at').notNull().default(sql`(unixepoch())`),
  triaged_at: integer('triaged_at'),
  triaged_by: text('triaged_by').references(() => users.id),
}, (table) => [
  index('idx_captures_project_status').on(table.project_id, table.status),
])

// ─── Epics ───────────────────────────────────────────────────────────────────

export const epics = sqliteTable('epics', {
  id: text('id').primaryKey(),
  project_id: text('project_id').notNull().references(() => projects.id),
  title: text('title').notNull().default(''),
  description: text('description').notNull().default(''),
  priority: integer('priority').notNull().default(2),
  type: text('type', { enum: ['feature', 'bug', 'task', 'epic', 'spike'] }).notNull().default('task'),
  labels: text('labels').notNull().default('[]'),
  assignee: text('assignee'),
  git_branches: text('git_branches').notNull().default('[]'),
  ui_status: text('ui_status', { enum: ['blocked', 'ready', 'in_progress', 'in_review', 'done', 'cancelled'] }).notNull().default('blocked'),
  scope_analysis: text('scope_analysis'),
  split_proposal: text('split_proposal'),
  created_at: integer('created_at').notNull().default(sql`(unixepoch())`),
  updated_at: integer('updated_at').notNull().default(sql`(unixepoch())`),
}, (table) => [
  index('idx_epics_project').on(table.project_id),
])

// ─── Sessions ────────────────────────────────────────────────────────────────

export const sessions = sqliteTable('sessions', {
  id: text('id').primaryKey(),
  project_id: text('project_id').notNull().references(() => projects.id),
  epic_id: text('epic_id').references(() => epics.id),
  user_id: text('user_id').notNull().references(() => users.id),
  name: text('name'),
  claude_session_id: text('claude_session_id'),
  agent_mail_name: text('agent_mail_name'),
  model: text('model').notNull().default('sonnet'),
  status: text('status', {
    enum: ['queued', 'running', 'waiting_input', 'idle', 'validation_failed', 'completed', 'failed', 'cancelled', 'detached'],
  }).notNull().default('queued'),
  permission_mode: text('permission_mode', {
    enum: ['default', 'plan', 'acceptEdits', 'bypassPermissions'],
  }).notNull().default('default'),
  prompt: text('prompt').notNull(),
  target_dir: text('target_dir'),
  worktree_path: text('worktree_path'),
  worktree_branch: text('worktree_branch'),
  workflow_nodes: text('workflow_nodes'), // JSON: WorkflowNode[]
  pid: integer('pid'),
  exit_code: integer('exit_code'),
  pr_url: text('pr_url'),
  pr_status: text('pr_status', { enum: ['pending_review', 'changes_requested', 'approved', 'merged'] }),
  input_tokens_used: integer('input_tokens_used').notNull().default(0),
  output_tokens_used: integer('output_tokens_used').notNull().default(0),
  tool_calls_used: integer('tool_calls_used').notNull().default(0),
  started_at: integer('started_at'),
  finished_at: integer('finished_at'),
  created_at: integer('created_at').notNull().default(sql`(unixepoch())`),
}, (table) => [
  index('idx_sessions_project_status').on(table.project_id, table.status),
  index('idx_sessions_epic').on(table.epic_id),
])

// ─── Session Events ──────────────────────────────────────────────────────────

export const sessionEvents = sqliteTable('session_events', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  session_id: text('session_id').notNull().references(() => sessions.id),
  event_type: text('event_type', {
    enum: ['system', 'assistant', 'tool_use', 'tool_result', 'result', 'error'],
  }).notNull(),
  data: text('data').notNull(),
  created_at: integer('created_at').notNull().default(sql`(unixepoch())`),
}, (table) => [
  index('idx_events_session').on(table.session_id),
])

// ─── Agent Queue ─────────────────────────────────────────────────────────────

export const agentQueue = sqliteTable('agent_queue', {
  id: text('id').primaryKey(),
  project_id: text('project_id').notNull().references(() => projects.id),
  epic_id: text('epic_id').notNull().references(() => epics.id),
  user_id: text('user_id').notNull().references(() => users.id),
  priority: integer('priority').notNull().default(2),
  prompt: text('prompt').notNull(),
  model: text('model').notNull().default('sonnet'),
  status: text('status', { enum: ['queued', 'picked', 'cancelled'] }).notNull().default('queued'),
  position: integer('position').notNull(),
  created_at: integer('created_at').notNull().default(sql`(unixepoch())`),
  picked_at: integer('picked_at'),
}, (table) => [
  index('idx_queue_project_status').on(table.project_id, table.status, table.priority, table.position),
])

// ─── Knowledge Rules ─────────────────────────────────────────────────────────

export const knowledgeRules = sqliteTable('knowledge_rules', {
  id: text('id').primaryKey(),
  project_id: text('project_id').notNull().references(() => projects.id),
  rule_text: text('rule_text').notNull(),
  category: text('category', { enum: ['coding', 'security', 'testing', 'architecture', 'general'] }).notNull().default('general'),
  confidence: real('confidence').notNull().default(0.5),
  maturity: text('maturity', { enum: ['candidate', 'established', 'proven', 'deprecated'] }).notNull().default('candidate'),
  source: text('source', { enum: ['manual', 'auto'] }).notNull().default('manual'),
  source_session_id: text('source_session_id').references(() => sessions.id),
  approved_by: text('approved_by').references(() => users.id),
  helpful_count: integer('helpful_count').notNull().default(0),
  harmful_count: integer('harmful_count').notNull().default(0),
  last_validated_at: integer('last_validated_at'),
  created_at: integer('created_at').notNull().default(sql`(unixepoch())`),
  updated_at: integer('updated_at').notNull().default(sql`(unixepoch())`),
}, (table) => [
  index('idx_rules_project_category').on(table.project_id, table.category),
])

// ─── Webhook Configs ─────────────────────────────────────────────────────────

export const webhookConfigs = sqliteTable('webhook_configs', {
  id: text('id').primaryKey(),
  project_id: text('project_id').notNull().references(() => projects.id),
  type: text('type', { enum: ['slack', 'discord', 'telegram'] }).notNull(),
  url: text('url').notNull(),
  events: text('events').notNull().default('["session_complete","pr_ready","pr_merged"]'),
  enabled: integer('enabled').notNull().default(1),
  created_at: integer('created_at').notNull().default(sql`(unixepoch())`),
})

// ─── Notifications ───────────────────────────────────────────────────────────

export const notifications = sqliteTable('notifications', {
  id: text('id').primaryKey(),
  user_id: text('user_id').notNull().references(() => users.id),
  project_id: text('project_id').notNull().references(() => projects.id),
  type: text('type', {
    enum: ['agent_complete', 'pr_ready', 'review_needed', 'question_waiting', 'merge_complete'],
  }).notNull(),
  title: text('title').notNull(),
  body: text('body'),
  link: text('link'),
  read: integer('read').notNull().default(0),
  created_at: integer('created_at').notNull().default(sql`(unixepoch())`),
}, (table) => [
  index('idx_notifications_user_read').on(table.user_id, table.read),
])

// ─── Activity Log ────────────────────────────────────────────────────────────

export const activityLog = sqliteTable('activity_log', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  project_id: text('project_id').notNull().references(() => projects.id),
  user_id: text('user_id').references(() => users.id),
  action: text('action', {
    enum: [
      'capture_created',
      'epic_created',
      'session_started',
      'session_completed',
      'session_failed',
      'pr_created',
      'pr_merged',
      'rule_created',
      'bead_status_changed',
    ],
  }).notNull(),
  details: text('details'),
  created_at: integer('created_at').notNull().default(sql`(unixepoch())`),
}, (table) => [
  index('idx_activity_project').on(table.project_id, table.created_at),
])

// ─── Session Audit Log ──────────────────────────────────────────────────────

export const sessionAuditLog = sqliteTable('session_audit_log', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  session_id: text('session_id').notNull().references(() => sessions.id),
  tool_name: text('tool_name').notNull(),
  tool_input_summary: text('tool_input_summary'),
  policy_result: text('policy_result', { enum: ['allow', 'ask', 'block'] }).notNull(),
  user_decision: text('user_decision'),
  created_at: integer('created_at').notNull().default(sql`(unixepoch())`),
}, (table) => [
  index('idx_audit_session').on(table.session_id, table.created_at),
])
