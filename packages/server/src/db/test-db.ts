import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { readFileSync, readdirSync } from 'fs'
import { join } from 'path'
import * as schema from './schema.js'

/**
 * Tạo cơ sở dữ liệu SQLite in-memory cho integration tests.
 * Mỗi lần gọi tạo một DB riêng biệt, không ảnh hưởng đến DB chính.
 */
export function createTestDb() {
  const sqlite = new Database(':memory:')
  sqlite.pragma('foreign_keys = ON')

  // Apply migrations from SQL files
  const migrationsDir = join(import.meta.dirname, '../../drizzle/migrations')
  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort()

  for (const file of files) {
    const sql = readFileSync(join(migrationsDir, file), 'utf-8')
    // Drizzle migration files use "--> statement-breakpoint" as separator
    const statements = sql.split('--> statement-breakpoint')
    for (const statement of statements) {
      const trimmed = statement.trim()
      if (trimmed) {
        sqlite.exec(trimmed)
      }
    }
  }

  const db = drizzle(sqlite, { schema })
  return { db, sqlite }
}

/**
 * Xoá tất cả dữ liệu từ mọi bảng theo thứ tự FK đúng.
 * Dùng trong beforeEach() để đảm bảo test isolation.
 */
export function cleanAllTables(sqlite: InstanceType<typeof Database>): void {
  // Delete in reverse FK dependency order (children before parents)
  const tablesInOrder = [
    'activity_log',
    'notifications',
    'webhook_configs',
    'knowledge_rules',
    'session_events',
    'agent_queue',
    'sessions',
    'epics',
    'captures',
    'repos',
    'project_members',
    'projects',
    'users',
  ]

  for (const table of tablesInOrder) {
    sqlite.exec(`DELETE FROM ${table}`)
  }
}
