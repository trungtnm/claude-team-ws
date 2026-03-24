import Database from 'better-sqlite3'
import type BetterSqlite3 from 'better-sqlite3'
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import * as schema from './schema.js'
import { mkdirSync, existsSync } from 'fs'
import { dirname } from 'path'

const dbPath = process.env.DATABASE_PATH || './data/workspace.db'

// Ensure the data directory exists
const dbDir = dirname(dbPath)
if (!existsSync(dbDir)) {
  mkdirSync(dbDir, { recursive: true })
}

const sqlite: BetterSqlite3.Database = new Database(dbPath)

// WAL mode: concurrent reads while a write is in progress
sqlite.pragma('journal_mode = WAL')

// Increase cache for read performance (64MB)
sqlite.pragma('cache_size = -64000')

// Enforce foreign keys
sqlite.pragma('foreign_keys = ON')

// Sync mode: NORMAL is safe enough for WAL (faster than FULL)
sqlite.pragma('synchronous = NORMAL')

export const db: BetterSQLite3Database<typeof schema> = drizzle(sqlite, { schema })

export { sqlite }
