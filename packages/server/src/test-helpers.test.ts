import { describe, it, expect } from 'vitest'
import { createTestDb } from './db/test-db.js'
import { seedTestUser, seedTestProject } from './test-helpers.js'
import * as schema from './db/schema.js'

describe('seedTestUser', () => {
  it('should insert a user and return it with correct fields', () => {
    const { db } = createTestDb()
    const user = seedTestUser(db)

    expect(user.id).toBeDefined()
    expect(user.name).toBeDefined()
    expect(user.email).toBeDefined()
    expect(user.role).toBe('pm')

    // Verify it actually exists in DB
    const found = db.select().from(schema.users).all()
    expect(found).toHaveLength(1)
    expect(found[0].id).toBe(user.id)
  })

  it('should allow overriding user fields', () => {
    const { db } = createTestDb()
    const user = seedTestUser(db, { name: 'Lập trình viên', role: 'dev' })

    expect(user.name).toBe('Lập trình viên')
    expect(user.role).toBe('dev')
  })
})

describe('seedTestProject', () => {
  it('should insert a project and return it', () => {
    const { db } = createTestDb()
    const project = seedTestProject(db)

    expect(project.id).toBeDefined()
    expect(project.name).toBeDefined()
    expect(project.slug).toBeDefined()
    expect(project.project_root).toBeDefined()

    // Verify it actually exists in DB
    const found = db.select().from(schema.projects).all()
    expect(found).toHaveLength(1)
    expect(found[0].id).toBe(project.id)
  })

  it('should allow overriding project fields', () => {
    const { db } = createTestDb()
    const project = seedTestProject(db, { name: 'Dự án tuỳ chỉnh' })

    expect(project.name).toBe('Dự án tuỳ chỉnh')
  })
})
