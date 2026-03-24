/**
 * Seed script — runs migrations then creates default users and project if they don't exist.
 * Run: npx tsx src/db/seed.ts
 * Also exported for programmatic use (e.g., called from index.ts on first boot).
 */
import { nanoid } from 'nanoid'
import { eq } from 'drizzle-orm'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { fileURLToPath } from 'url'
import { dirname, resolve } from 'path'
import { db, sqlite } from './index.js'
import { users, projects, projectMembers } from './schema.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

const DEFAULT_USERS = [
  { id: 'usr_admin',  name: 'Trung Tran',    email: 'trung@team.local',  role: 'techlead' as const, api_key: `ctw-${nanoid(16)}` },
  { id: 'usr_pm',     name: 'Minh Nguyen',   email: 'minh@team.local',   role: 'pm'       as const, api_key: `ctw-${nanoid(16)}` },
  { id: 'usr_dev1',   name: 'Hoa Le',        email: 'hoa@team.local',    role: 'dev'      as const, api_key: `ctw-${nanoid(16)}` },
  { id: 'usr_dev2',   name: 'Khoa Pham',     email: 'khoa@team.local',   role: 'dev'      as const, api_key: `ctw-${nanoid(16)}` },
  { id: 'usr_viewer', name: 'Lan Vo',        email: 'lan@team.local',    role: 'viewer'   as const, api_key: `ctw-${nanoid(16)}` },
]

const DEFAULT_PROJECT = {
  id: 'proj_default',
  name: 'Claude Team Workspace',
  slug: 'default',
  project_root: process.cwd(),
}

export function seed(): void {
  // Run migrations first to ensure tables exist
  const migrationsFolder = resolve(__dirname, '../../drizzle/migrations')
  migrate(db, { migrationsFolder })

  const now = Math.floor(Date.now() / 1000)

  for (const u of DEFAULT_USERS) {
    const existing = db.select().from(users).where(eq(users.id, u.id)).get()
    if (!existing) {
      db.insert(users).values({ ...u, created_at: now, updated_at: now }).run()
      console.log(`  Seeded user: ${u.name} <${u.email}> (${u.role})`)
    }
  }

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

// Run directly: npx tsx src/db/seed.ts
if (process.argv[1]?.endsWith('seed.ts') || process.argv[1]?.endsWith('seed.js')) {
  console.log('Seeding database...')
  seed()
  sqlite.close()
  console.log('Done.')
}
