import Database from 'better-sqlite3'
import type BetterSqlite3 from 'better-sqlite3'
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import * as schema from './schema.js'

/**
 * Create an in-memory SQLite database with the full schema applied.
 * Used by integration tests for fast, isolated test runs.
 */
export function createTestDb(): { db: BetterSQLite3Database<typeof schema>; sqlite: BetterSqlite3.Database } {
  const sqlite: BetterSqlite3.Database = new Database(':memory:')

  sqlite.pragma('journal_mode = WAL')
  sqlite.pragma('foreign_keys = ON')

  const db = drizzle(sqlite, { schema })

  // Create all tables
  sqlite.exec(`
    CREATE TABLE users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT UNIQUE,
      role TEXT NOT NULL DEFAULT 'dev',
      api_key TEXT UNIQUE,
      avatar_url TEXT,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      project_root TEXT NOT NULL UNIQUE,
      max_concurrent_agents INTEGER NOT NULL DEFAULT 3,
      ask_question_mode TEXT NOT NULL DEFAULT 'hybrid',
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE repos (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id),
      name TEXT NOT NULL,
      git_url TEXT,
      path TEXT NOT NULL,
      default_branch TEXT NOT NULL DEFAULT 'main',
      link_mode TEXT NOT NULL DEFAULT 'clone',
      status TEXT NOT NULL DEFAULT 'ready',
      added_by TEXT NOT NULL REFERENCES users(id),
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      UNIQUE(project_id, name)
    );

    CREATE TABLE project_members (
      project_id TEXT NOT NULL REFERENCES projects(id),
      user_id TEXT NOT NULL REFERENCES users(id),
      role_override TEXT,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      PRIMARY KEY (project_id, user_id)
    );

    CREATE TABLE captures (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id),
      user_id TEXT NOT NULL REFERENCES users(id),
      text TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      triage_result TEXT,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      triaged_at INTEGER,
      triaged_by TEXT REFERENCES users(id)
    );

    CREATE TABLE epics (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id),
      bead_epic_id TEXT NOT NULL,
      git_branches TEXT NOT NULL DEFAULT '[]',
      ui_status TEXT NOT NULL DEFAULT 'blocked',
      scope_analysis TEXT,
      split_proposal TEXT,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE sessions (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id),
      epic_id TEXT REFERENCES epics(id),
      user_id TEXT NOT NULL REFERENCES users(id),
      claude_session_id TEXT,
      agent_mail_name TEXT,
      model TEXT NOT NULL DEFAULT 'sonnet',
      status TEXT NOT NULL DEFAULT 'queued',
      prompt TEXT NOT NULL,
      pid INTEGER,
      exit_code INTEGER,
      pr_url TEXT,
      pr_status TEXT,
      started_at INTEGER,
      finished_at INTEGER,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE session_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL REFERENCES sessions(id),
      event_type TEXT NOT NULL,
      data TEXT NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE agent_queue (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id),
      epic_id TEXT NOT NULL REFERENCES epics(id),
      user_id TEXT NOT NULL REFERENCES users(id),
      priority INTEGER NOT NULL DEFAULT 2,
      prompt TEXT NOT NULL,
      model TEXT NOT NULL DEFAULT 'sonnet',
      status TEXT NOT NULL DEFAULT 'queued',
      position INTEGER NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      picked_at INTEGER
    );

    CREATE TABLE knowledge_rules (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id),
      rule_text TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'general',
      confidence REAL NOT NULL DEFAULT 0.5,
      maturity TEXT NOT NULL DEFAULT 'candidate',
      source TEXT NOT NULL DEFAULT 'manual',
      source_session_id TEXT REFERENCES sessions(id),
      approved_by TEXT REFERENCES users(id),
      helpful_count INTEGER NOT NULL DEFAULT 0,
      harmful_count INTEGER NOT NULL DEFAULT 0,
      last_validated_at INTEGER,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE webhook_configs (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id),
      type TEXT NOT NULL,
      url TEXT NOT NULL,
      events TEXT NOT NULL DEFAULT '["session_complete","pr_ready","pr_merged"]',
      enabled INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE notifications (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      project_id TEXT NOT NULL REFERENCES projects(id),
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      body TEXT,
      link TEXT,
      read INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE activity_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id TEXT NOT NULL REFERENCES projects(id),
      user_id TEXT REFERENCES users(id),
      action TEXT NOT NULL,
      details TEXT,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    -- Indexes
    CREATE INDEX idx_users_email ON users(email);
    CREATE INDEX idx_users_api_key ON users(api_key);
    CREATE INDEX idx_repos_project ON repos(project_id);
    CREATE INDEX idx_captures_project_status ON captures(project_id, status);
    CREATE INDEX idx_epics_project ON epics(project_id);
    CREATE INDEX idx_epics_bead ON epics(bead_epic_id);
    CREATE INDEX idx_sessions_project_status ON sessions(project_id, status);
    CREATE INDEX idx_sessions_epic ON sessions(epic_id);
    CREATE INDEX idx_events_session ON session_events(session_id);
    CREATE INDEX idx_queue_project_status ON agent_queue(project_id, status, priority, position);
    CREATE INDEX idx_rules_project_category ON knowledge_rules(project_id, category);
    CREATE INDEX idx_notifications_user_read ON notifications(user_id, read);
    CREATE INDEX idx_activity_project ON activity_log(project_id, created_at);
  `)

  return { db, sqlite }
}

/**
 * Clean all data from all tables. Used in beforeEach() for test isolation.
 */
export function cleanAllTables(sqlite: BetterSqlite3.Database): void {
  sqlite.exec(`
    DELETE FROM activity_log;
    DELETE FROM notifications;
    DELETE FROM webhook_configs;
    DELETE FROM knowledge_rules;
    DELETE FROM agent_queue;
    DELETE FROM session_events;
    DELETE FROM sessions;
    DELETE FROM epics;
    DELETE FROM captures;
    DELETE FROM project_members;
    DELETE FROM repos;
    DELETE FROM projects;
    DELETE FROM users;
  `)
}
