import { describe, it, expect } from 'vitest'
import { createTestDb, cleanAllTables } from './test-db.js'
import * as schema from './schema.js'

describe('createTestDb', () => {
  it('should create an in-memory SQLite database with drizzle', () => {
    const { db, sqlite } = createTestDb()
    expect(db).toBeDefined()
    expect(sqlite).toBeDefined()
  })

  it('should have foreign keys enabled', () => {
    const { sqlite } = createTestDb()
    const result = sqlite.pragma('foreign_keys') as Array<{ foreign_keys: number }>
    expect(result[0].foreign_keys).toBe(1)
  })

  it('should have all 13 tables from the schema', () => {
    const { sqlite } = createTestDb()
    const tables = sqlite
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
      .all() as Array<{ name: string }>

    const tableNames = tables.map((t) => t.name).sort()

    expect(tableNames).toContain('users')
    expect(tableNames).toContain('projects')
    expect(tableNames).toContain('repos')
    expect(tableNames).toContain('project_members')
    expect(tableNames).toContain('captures')
    expect(tableNames).toContain('epics')
    expect(tableNames).toContain('sessions')
    expect(tableNames).toContain('session_events')
    expect(tableNames).toContain('agent_queue')
    expect(tableNames).toContain('knowledge_rules')
    expect(tableNames).toContain('webhook_configs')
    expect(tableNames).toContain('notifications')
    expect(tableNames).toContain('activity_log')
  })

  it('should support inserting and querying data via drizzle', () => {
    const { db } = createTestDb()

    db.insert(schema.users)
      .values({
        id: 'test-user-1',
        name: 'Người dùng thử nghiệm',
        email: 'test@example.com',
        role: 'dev',
      })
      .run()

    const users = db.select().from(schema.users).all()
    expect(users).toHaveLength(1)
    expect(users[0].name).toBe('Người dùng thử nghiệm')
  })

  it('should enforce foreign key constraints', () => {
    const { db } = createTestDb()


    expect(() => {
      db.insert(schema.captures)
        .values({
          id: 'cap-1',
          project_id: 'nonexistent-project',
          user_id: 'nonexistent-user',
          text: 'Thử nghiệm',
          status: 'pending',
        })
        .run()
    }).toThrow()
  })
})

describe('cleanAllTables', () => {
  it('should delete all data from all tables', () => {
    const { db, sqlite } = createTestDb()


    // Insert a user
    db.insert(schema.users)
      .values({
        id: 'user-1',
        name: 'Test User',
        email: 'test@example.com',
        role: 'dev',
      })
      .run()

    // Insert a project
    db.insert(schema.projects)
      .values({
        id: 'proj-1',
        name: 'Dự án thử nghiệm',
        slug: 'test-project',
        project_root: '/tmp/test',
      })
      .run()

    // Verify data exists
    expect(db.select().from(schema.users).all()).toHaveLength(1)
    expect(db.select().from(schema.projects).all()).toHaveLength(1)

    // Clean all tables
    cleanAllTables(sqlite)

    // Verify all data is gone
    expect(db.select().from(schema.users).all()).toHaveLength(0)
    expect(db.select().from(schema.projects).all()).toHaveLength(0)
  })
})
