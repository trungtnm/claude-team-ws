import Database, { type Database as DatabaseType } from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { mkdirSync, existsSync } from 'fs'
import { dirname } from 'path'
import * as schema from './schema.js'

const dbPath = process.env.DATABASE_PATH || './data/workspace.db'
const dbDir = dirname(dbPath)

if (!existsSync(dbDir)) {
  mkdirSync(dbDir, { recursive: true })
}

const sqlite: DatabaseType = new Database(dbPath)

// WAL mode: concurrent reads while a write is in progress
sqlite.pragma('journal_mode = WAL')
// Increase cache for read performance (64MB)
sqlite.pragma('cache_size = -64000')
// Enforce foreign keys
sqlite.pragma('foreign_keys = ON')
// Sync mode: NORMAL is safe enough for WAL (faster than FULL)
sqlite.pragma('synchronous = NORMAL')

export const db = drizzle(sqlite, { schema })
export { sqlite }
