import { nanoid } from 'nanoid'
import { eq } from 'drizzle-orm'
import { createHash } from 'crypto'
import { db, sqlite } from './index.js'
import { users, projects, projectMembers } from './schema.js'

/** Hash API key with SHA-256 for secure storage */
function hashKey(key: string): string {
  return createHash('sha256').update(key).digest('hex')
}

// Admin key: random per seed unless CTW_E2E_API_KEY is explicitly set for E2E tests
const adminApiKey = process.env.CTW_E2E_API_KEY || `ctw-${nanoid(16)}`

// Bot API key: stable via env var or random per seed
const botApiKey = process.env.CTW_BOT_API_KEY || `ctw-bot-${nanoid(16)}`

// Generate plaintext keys for display, store hashed versions
const userKeys: Array<{ id: string; plaintext: string }> = []
function makeUser(id: string, name: string, email: string, role: 'techlead' | 'pm' | 'dev' | 'viewer', plaintextKey: string) {
  userKeys.push({ id, plaintext: plaintextKey })
  return { id, name, email, role, api_key: hashKey(plaintextKey) }
}

const DEFAULT_USERS = [
  makeUser('usr_admin', 'Trung Tran', 'trung@team.local', 'techlead', adminApiKey),
  makeUser('usr_pm', 'Minh Nguyen', 'minh@team.local', 'pm', `ctw-${nanoid(16)}`),
  makeUser('usr_dev1', 'Hoa Le', 'hoa@team.local', 'dev', `ctw-${nanoid(16)}`),
  makeUser('usr_dev2', 'Khoa Pham', 'khoa@team.local', 'dev', `ctw-${nanoid(16)}`),
  makeUser('usr_viewer', 'Lan Vo', 'lan@team.local', 'viewer', `ctw-${nanoid(16)}`),
  makeUser('usr_bot', 'Agent Bot', 'bot@system.local', 'dev', botApiKey),
]

const DEFAULT_PROJECT = {
  id: 'proj_default',
  name: 'Claude Team Workspace',
  slug: 'default',
  project_root: process.cwd(),
}

function ensureTables(): void {
  // Create all tables if they don't exist — idempotent
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT UNIQUE,
      role TEXT NOT NULL DEFAULT 'dev', api_key TEXT UNIQUE, avatar_url TEXT,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()), updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
    CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
    CREATE INDEX IF NOT EXISTS idx_users_api_key ON users(api_key);

    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, slug TEXT NOT NULL UNIQUE,
      project_root TEXT NOT NULL UNIQUE, max_concurrent_agents INTEGER NOT NULL DEFAULT 3,
      ask_question_mode TEXT NOT NULL DEFAULT 'hybrid', picture_url TEXT,
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
    CREATE INDEX IF NOT EXISTS idx_repos_project ON repos(project_id);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_repos_project_name ON repos(project_id, name);

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
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      triaged_at INTEGER, triaged_by TEXT REFERENCES users(id)
    );
    CREATE INDEX IF NOT EXISTS idx_captures_project_status ON captures(project_id, status);

    CREATE TABLE IF NOT EXISTS epics (
      id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id),
      bead_epic_id TEXT NOT NULL, git_branches TEXT NOT NULL DEFAULT '[]',
      ui_status TEXT NOT NULL DEFAULT 'blocked', scope_analysis TEXT, split_proposal TEXT,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()), updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
    CREATE INDEX IF NOT EXISTS idx_epics_project ON epics(project_id);
    CREATE INDEX IF NOT EXISTS idx_epics_bead ON epics(bead_epic_id);

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id),
      epic_id TEXT REFERENCES epics(id), user_id TEXT NOT NULL REFERENCES users(id),
      name TEXT, claude_session_id TEXT, agent_mail_name TEXT, model TEXT NOT NULL DEFAULT 'sonnet',
      status TEXT NOT NULL DEFAULT 'queued', prompt TEXT NOT NULL,
      pid INTEGER, exit_code INTEGER, pr_url TEXT, pr_status TEXT,
      started_at INTEGER, finished_at INTEGER,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
    CREATE INDEX IF NOT EXISTS idx_sessions_project_status ON sessions(project_id, status);
    CREATE INDEX IF NOT EXISTS idx_sessions_epic ON sessions(epic_id);

    CREATE TABLE IF NOT EXISTS session_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL REFERENCES sessions(id),
      event_type TEXT NOT NULL, data TEXT NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
    CREATE INDEX IF NOT EXISTS idx_events_session ON session_events(session_id);

    CREATE TABLE IF NOT EXISTS agent_queue (
      id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id),
      epic_id TEXT NOT NULL REFERENCES epics(id), user_id TEXT NOT NULL REFERENCES users(id),
      priority INTEGER NOT NULL DEFAULT 2, prompt TEXT NOT NULL,
      model TEXT NOT NULL DEFAULT 'sonnet', status TEXT NOT NULL DEFAULT 'queued',
      position INTEGER NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()), picked_at INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_queue_project_status ON agent_queue(project_id, status, priority, position);

    CREATE TABLE IF NOT EXISTS knowledge_rules (
      id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id),
      rule_text TEXT NOT NULL, category TEXT NOT NULL DEFAULT 'general',
      confidence REAL NOT NULL DEFAULT 0.5, maturity TEXT NOT NULL DEFAULT 'candidate',
      source TEXT NOT NULL DEFAULT 'manual', source_session_id TEXT REFERENCES sessions(id),
      approved_by TEXT REFERENCES users(id), helpful_count INTEGER NOT NULL DEFAULT 0,
      harmful_count INTEGER NOT NULL DEFAULT 0, last_validated_at INTEGER,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()), updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
    CREATE INDEX IF NOT EXISTS idx_rules_project_category ON knowledge_rules(project_id, category);

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
    CREATE INDEX IF NOT EXISTS idx_notifications_user_read ON notifications(user_id, read);

    CREATE TABLE IF NOT EXISTS activity_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id TEXT NOT NULL REFERENCES projects(id),
      user_id TEXT REFERENCES users(id), action TEXT NOT NULL, details TEXT,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
    CREATE INDEX IF NOT EXISTS idx_activity_project ON activity_log(project_id, created_at);
  `)
}

export function seed(): void {
  // Ensure all tables exist (idempotent)
  ensureTables()

  const now = Math.floor(Date.now() / 1000)

  // Seed users (API keys are stored as SHA-256 hashes)
  for (const u of DEFAULT_USERS) {
    const existing = db.select().from(users).where(eq(users.id, u.id)).get()
    if (!existing) {
      db.insert(users).values({ ...u, created_at: now, updated_at: now }).run()
      const keyInfo = userKeys.find(k => k.id === u.id)
      console.log(`  Seeded user: ${u.name} <${u.email}> (${u.role})`)
      if (keyInfo && (u.id === 'usr_admin' || u.id === 'usr_bot')) {
        console.log(`    API key: ${keyInfo.plaintext} (save this — stored as hash, not recoverable)`)
      }
    }
  }

  // Seed default project
  const existingProject = db.select().from(projects).where(eq(projects.id, DEFAULT_PROJECT.id)).get()
  if (!existingProject) {
    db.insert(projects).values({ ...DEFAULT_PROJECT, created_at: now, updated_at: now }).run()
    console.log(`  Seeded project: ${DEFAULT_PROJECT.name}`)

    // Add all users as project members
    for (const u of DEFAULT_USERS) {
      db.insert(projectMembers).values({
        project_id: DEFAULT_PROJECT.id,
        user_id: u.id,
        created_at: now,
      }).run()
    }
    console.log(`  Added ${DEFAULT_USERS.length} members to default project`)
  }
}

// Allow running as standalone script
if (process.argv[1]?.endsWith('seed.ts') || process.argv[1]?.endsWith('seed.js')) {
  console.log('Seeding database...')
  seed()
  sqlite.close()
  console.log('Done.')
}
