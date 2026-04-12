import Database, { type Database as DatabaseType } from 'better-sqlite3'
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import * as schema from './schema.js'

/**
 * Create an in-memory SQLite database with the full schema.
 * Each call returns an isolated DB instance for test isolation.
 */
export function createTestDb(): { db: BetterSQLite3Database<typeof schema>; sqlite: DatabaseType } {
  const sqlite = new Database(':memory:')
  sqlite.pragma('journal_mode = WAL')
  sqlite.pragma('foreign_keys = ON')

  // Create all tables
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT UNIQUE,
      role TEXT NOT NULL DEFAULT 'dev', api_key TEXT UNIQUE, avatar_url TEXT,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()), updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, slug TEXT NOT NULL UNIQUE,
      project_root TEXT NOT NULL UNIQUE, max_concurrent_agents INTEGER NOT NULL DEFAULT 3,
      ask_question_mode TEXT NOT NULL DEFAULT 'hybrid',
      safety_mode TEXT NOT NULL DEFAULT 'a', command_policy TEXT,
      max_session_input_tokens INTEGER, max_session_output_tokens INTEGER, max_session_tool_calls INTEGER,
      worktree_merge_strategy TEXT NOT NULL DEFAULT 'leave',
      picture_url TEXT,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()), updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
    CREATE TABLE IF NOT EXISTS repos (
      id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id),
      name TEXT NOT NULL, git_url TEXT, path TEXT NOT NULL,
      default_branch TEXT NOT NULL DEFAULT 'main',
      link_mode TEXT NOT NULL DEFAULT 'clone', status TEXT NOT NULL DEFAULT 'ready',
      added_by TEXT NOT NULL REFERENCES users(id),
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
    CREATE TABLE IF NOT EXISTS project_members (
      project_id TEXT NOT NULL REFERENCES projects(id),
      user_id TEXT NOT NULL REFERENCES users(id),
      role_override TEXT, created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      PRIMARY KEY (project_id, user_id)
    );
    CREATE TABLE IF NOT EXISTS captures (
      id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id),
      user_id TEXT NOT NULL REFERENCES users(id), text TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending', triage_result TEXT,
      attachments TEXT NOT NULL DEFAULT '[]',
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      triaged_at INTEGER, triaged_by TEXT REFERENCES users(id)
    );
    CREATE TABLE IF NOT EXISTS epics (
      id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id),
      title TEXT NOT NULL DEFAULT '', description TEXT NOT NULL DEFAULT '',
      priority INTEGER NOT NULL DEFAULT 2, type TEXT NOT NULL DEFAULT 'task',
      labels TEXT NOT NULL DEFAULT '[]', assignee TEXT,
      git_branches TEXT NOT NULL DEFAULT '[]',
      ui_status TEXT NOT NULL DEFAULT 'blocked', scope_analysis TEXT, split_proposal TEXT,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()), updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id),
      epic_id TEXT REFERENCES epics(id), user_id TEXT NOT NULL REFERENCES users(id),
      name TEXT, claude_session_id TEXT, agent_mail_name TEXT, model TEXT NOT NULL DEFAULT 'sonnet',
      status TEXT NOT NULL DEFAULT 'queued',
      permission_mode TEXT NOT NULL DEFAULT 'default',
      prompt TEXT NOT NULL, target_dir TEXT,
      worktree_path TEXT, worktree_branch TEXT, workflow_nodes TEXT,
      pid INTEGER, exit_code INTEGER, pr_url TEXT, pr_status TEXT,
      input_tokens_used INTEGER NOT NULL DEFAULT 0,
      output_tokens_used INTEGER NOT NULL DEFAULT 0,
      tool_calls_used INTEGER NOT NULL DEFAULT 0,
      started_at INTEGER, finished_at INTEGER,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
    CREATE TABLE IF NOT EXISTS session_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL REFERENCES sessions(id),
      event_type TEXT NOT NULL, data TEXT NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
    CREATE TABLE IF NOT EXISTS agent_queue (
      id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id),
      epic_id TEXT NOT NULL REFERENCES epics(id), user_id TEXT NOT NULL REFERENCES users(id),
      priority INTEGER NOT NULL DEFAULT 2, prompt TEXT NOT NULL,
      model TEXT NOT NULL DEFAULT 'sonnet', status TEXT NOT NULL DEFAULT 'queued',
      position INTEGER NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()), picked_at INTEGER
    );
    CREATE TABLE IF NOT EXISTS knowledge_rules (
      id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id),
      rule_text TEXT NOT NULL, category TEXT NOT NULL DEFAULT 'general',
      confidence REAL NOT NULL DEFAULT 0.5, maturity TEXT NOT NULL DEFAULT 'candidate',
      source TEXT NOT NULL DEFAULT 'manual', source_session_id TEXT REFERENCES sessions(id),
      approved_by TEXT REFERENCES users(id), helpful_count INTEGER NOT NULL DEFAULT 0,
      harmful_count INTEGER NOT NULL DEFAULT 0, last_validated_at INTEGER,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()), updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
    CREATE TABLE IF NOT EXISTS webhook_configs (
      id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id),
      type TEXT NOT NULL, url TEXT NOT NULL,
      events TEXT NOT NULL DEFAULT '["session_complete","pr_ready","pr_merged"]',
      enabled INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id),
      project_id TEXT NOT NULL REFERENCES projects(id),
      type TEXT NOT NULL, title TEXT NOT NULL, body TEXT, link TEXT,
      read INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
    CREATE TABLE IF NOT EXISTS session_audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL REFERENCES sessions(id),
      tool_name TEXT NOT NULL,
      tool_input_summary TEXT,
      policy_result TEXT NOT NULL DEFAULT 'allow',
      user_decision TEXT,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
    CREATE TABLE IF NOT EXISTS activity_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id TEXT NOT NULL REFERENCES projects(id),
      user_id TEXT REFERENCES users(id), action TEXT NOT NULL, details TEXT,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
  `)

  const db = drizzle(sqlite, { schema })
  return { db, sqlite }
}

/** Seed test data: a user, project, and project membership */
export function seedTestData(db: BetterSQLite3Database<typeof schema>) {
  const now = Math.floor(Date.now() / 1000)

  db.insert(schema.users).values({
    id: 'usr_test_pm',
    name: 'Test PM',
    email: 'pm@test.local',
    role: 'pm',
    api_key: 'test-api-key-pm',
    created_at: now,
    updated_at: now,
  }).run()

  db.insert(schema.users).values({
    id: 'usr_test_dev',
    name: 'Test Dev',
    email: 'dev@test.local',
    role: 'dev',
    api_key: 'test-api-key-dev',
    created_at: now,
    updated_at: now,
  }).run()

  db.insert(schema.users).values({
    id: 'usr_test_viewer',
    name: 'Test Viewer',
    email: 'viewer@test.local',
    role: 'viewer',
    api_key: 'test-api-key-viewer',
    created_at: now,
    updated_at: now,
  }).run()

  db.insert(schema.projects).values({
    id: 'proj_test',
    name: 'Test Project',
    slug: 'test',
    project_root: '/tmp/test-project',
    created_at: now,
    updated_at: now,
  }).run()

  // Add PM and dev as project members
  db.insert(schema.projectMembers).values({ project_id: 'proj_test', user_id: 'usr_test_pm', created_at: now }).run()
  db.insert(schema.projectMembers).values({ project_id: 'proj_test', user_id: 'usr_test_dev', created_at: now }).run()
  db.insert(schema.projectMembers).values({ project_id: 'proj_test', user_id: 'usr_test_viewer', created_at: now }).run()
}

/** Delete all rows from all tables (for beforeEach cleanup) */
export function cleanAllTables(db: BetterSQLite3Database<typeof schema>) {
  // Order matters due to foreign keys
  db.delete(schema.activityLog).run()
  db.delete(schema.notifications).run()
  db.delete(schema.sessionAuditLog).run()
  db.delete(schema.sessionEvents).run()
  db.delete(schema.agentQueue).run()
  db.delete(schema.sessions).run()
  db.delete(schema.epics).run()
  db.delete(schema.captures).run()
  db.delete(schema.knowledgeRules).run()
  db.delete(schema.webhookConfigs).run()
  db.delete(schema.repos).run()
  db.delete(schema.projectMembers).run()
  db.delete(schema.projects).run()
  db.delete(schema.users).run()
}
