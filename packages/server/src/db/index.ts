import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { existsSync, mkdirSync } from 'fs'
import { dirname } from 'path'
import { nanoid } from 'nanoid'
import * as schema from './schema.js'

const dbPath = process.env.DATABASE_PATH || './data/workspace.db'

// Ensure data directory exists
const dbDir = dirname(dbPath)
if (!existsSync(dbDir)) {
  mkdirSync(dbDir, { recursive: true })
}

const sqlite: InstanceType<typeof Database> = new Database(dbPath)

// WAL mode: concurrent reads while 1 write is in progress
sqlite.pragma('journal_mode = WAL')
// 64MB cache for read performance
sqlite.pragma('cache_size = -64000')
// Enforce foreign keys
sqlite.pragma('foreign_keys = ON')
// NORMAL sync is safe enough for WAL (faster than FULL)
sqlite.pragma('synchronous = NORMAL')

export const db = drizzle(sqlite, { schema })

export function runMigrations(): void {
  migrate(db, { migrationsFolder: './drizzle/migrations' })
}

export function seedAdmin(): void {
  const adminEmail = process.env.ADMIN_EMAIL || 'admin@example.com'
  const adminApiKey = process.env.ADMIN_API_KEY || 'ctw-dev-key'

  const existing = sqlite.prepare('SELECT id FROM users WHERE email = ?').get(adminEmail)

  if (!existing) {
    db.insert(schema.users).values({
      id: nanoid(),
      name: 'Admin',
      email: adminEmail,
      role: 'pm',
      api_key: adminApiKey,
    }).run()
    console.log(`Seeded admin user: ${adminEmail}`)
  }
}

export { sqlite }
