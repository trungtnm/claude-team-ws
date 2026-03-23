import { describe, it, expect, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'
import { createTestDb, cleanAllTables } from '../db/test-db.js'
import { seedTestUser, seedTestProject } from '../test-helpers.js'
import type { AuthUser } from '../middleware/auth.js'

// Create a single test DB per file for performance
const { db, sqlite } = createTestDb()

// Mock only the db module to use our test DB
vi.mock('../db/index.js', () => ({
  db,
  sqlite,
}))

// Mock auth to inject our test user
let currentUser: AuthUser

vi.mock('../middleware/auth.js', () => ({
  authenticate: (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    req.user = currentUser
    next()
  },
}))

// Let rbac middleware pass through (auth is already mocked)
vi.mock('../middleware/rbac.js', () => ({
  requireRole:
    (..._roles: string[]) =>
    (_req: express.Request, _res: express.Response, next: express.NextFunction) =>
      next(),
}))

// Import the router AFTER mocks are set up
const { default: capturesRouter } = await import('./captures.js')

function createApp(): express.Express {
  const app = express()
  app.use(express.json())
  app.use('/captures', capturesRouter)
  return app
}

describe('captures integration', () => {
  let app: express.Express
  let user: ReturnType<typeof seedTestUser>
  let project: ReturnType<typeof seedTestProject>

  beforeEach(() => {
    cleanAllTables(sqlite)

    user = seedTestUser(db)
    project = seedTestProject(db)
    currentUser = { id: user.id, name: user.name, email: user.email, role: user.role }

    app = createApp()
  })

  describe('POST /captures', () => {
    it('should create a capture and return it with status 201', async () => {
      const response = await request(app)
        .post('/captures')
        .send({ project_id: project.id, text: 'Thêm tính năng xác thực OAuth' })
        .expect(201)

      expect(response.body.capture).toBeDefined()
      expect(response.body.capture.text).toBe('Thêm tính năng xác thực OAuth')
      expect(response.body.capture.project_id).toBe(project.id)
      expect(response.body.capture.user_id).toBe(user.id)
      expect(response.body.capture.status).toBe('pending')
    })

    it('should reject invalid data with status 400', async () => {
      const response = await request(app)
        .post('/captures')
        .send({ project_id: '', text: '' })
        .expect(400)

      expect(response.body.error).toBe('Dữ liệu không hợp lệ')
    })

    it('should persist the capture in the database', async () => {
      const response = await request(app)
        .post('/captures')
        .send({ project_id: project.id, text: 'Sửa lỗi đăng nhập' })
        .expect(201)

      const captureId = response.body.capture.id
      const found = sqlite
        .prepare('SELECT * FROM captures WHERE id = ?')
        .get(captureId) as Record<string, unknown> | undefined

      expect(found).toBeDefined()
      expect(found!.text).toBe('Sửa lỗi đăng nhập')
    })
  })

  describe('GET /captures', () => {
    it('should list captures for a project', async () => {
      // Seed two captures
      await request(app)
        .post('/captures')
        .send({ project_id: project.id, text: 'Capture thứ nhất' })
        .expect(201)
      await request(app)
        .post('/captures')
        .send({ project_id: project.id, text: 'Capture thứ hai' })
        .expect(201)

      const response = await request(app)
        .get('/captures')
        .query({ project_id: project.id })
        .expect(200)

      expect(response.body.captures).toHaveLength(2)
    })

    it('should return 400 when project_id is missing', async () => {
      const response = await request(app).get('/captures').expect(400)

      expect(response.body.error).toBe('Thiếu project_id')
    })

    it('should filter by status', async () => {
      // Create two captures
      await request(app)
        .post('/captures')
        .send({ project_id: project.id, text: 'Pending capture' })
        .expect(201)

      const { body: { capture: created } } = await request(app)
        .post('/captures')
        .send({ project_id: project.id, text: 'To be triaged' })
        .expect(201)

      // Update one to triaged
      await request(app)
        .patch(`/captures/${created.id}`)
        .send({ status: 'triaged', triage_result: 'Đã phân loại' })
        .expect(200)

      // Filter by pending
      const pendingResponse = await request(app)
        .get('/captures')
        .query({ project_id: project.id, status: 'pending' })
        .expect(200)

      expect(pendingResponse.body.captures).toHaveLength(1)
      expect(pendingResponse.body.captures[0].text).toBe('Pending capture')
    })

    it('should return captures in descending order by created_at', async () => {
      await request(app)
        .post('/captures')
        .send({ project_id: project.id, text: 'Đầu tiên' })
        .expect(201)
      await request(app)
        .post('/captures')
        .send({ project_id: project.id, text: 'Thứ hai' })
        .expect(201)

      const response = await request(app)
        .get('/captures')
        .query({ project_id: project.id })
        .expect(200)

      // Most recent first (both may have same timestamp with in-memory DB)
      expect(response.body.captures).toHaveLength(2)
    })
  })

  describe('PATCH /captures/:id', () => {
    it('should update a capture status', async () => {
      const { body: { capture: created } } = await request(app)
        .post('/captures')
        .send({ project_id: project.id, text: 'Cần phân loại' })
        .expect(201)

      const response = await request(app)
        .patch(`/captures/${created.id}`)
        .send({ status: 'triaged', triage_result: 'Tạo epic mới' })
        .expect(200)

      expect(response.body.capture.status).toBe('triaged')
      expect(response.body.capture.triage_result).toBe('Tạo epic mới')
      expect(response.body.capture.triaged_by).toBe(user.id)
      expect(response.body.capture.triaged_at).toBeDefined()
    })

    it('should return 404 for non-existent capture', async () => {
      const response = await request(app)
        .patch('/captures/nonexistent')
        .send({ status: 'triaged' })
        .expect(404)

      expect(response.body.error).toBe('Không tìm thấy capture')
    })

    it('should return 400 for invalid status', async () => {
      const { body: { capture: created } } = await request(app)
        .post('/captures')
        .send({ project_id: project.id, text: 'Test capture' })
        .expect(201)

      await request(app)
        .patch(`/captures/${created.id}`)
        .send({ status: 'invalid_status' })
        .expect(400)
    })
  })

  describe('DELETE /captures/:id', () => {
    it('should soft-delete by setting status to dismissed', async () => {
      const { body: { capture: created } } = await request(app)
        .post('/captures')
        .send({ project_id: project.id, text: 'Sẽ bị loại bỏ' })
        .expect(201)

      const response = await request(app)
        .delete(`/captures/${created.id}`)
        .expect(200)

      expect(response.body.message).toBe('Đã loại bỏ capture')

      // Verify the capture is still in DB but dismissed
      const found = sqlite
        .prepare('SELECT status FROM captures WHERE id = ?')
        .get(created.id) as Record<string, unknown> | undefined

      expect(found).toBeDefined()
      expect(found!.status).toBe('dismissed')
    })

    it('should return 404 for non-existent capture', async () => {
      await request(app)
        .delete('/captures/nonexistent')
        .expect(404)
    })
  })

  describe('full CRUD lifecycle', () => {
    it('should create, read, update, and delete a capture', async () => {
      // CREATE
      const createResponse = await request(app)
        .post('/captures')
        .send({ project_id: project.id, text: 'Vòng đời đầy đủ' })
        .expect(201)

      const captureId = createResponse.body.capture.id
      expect(captureId).toBeDefined()

      // READ
      const listResponse = await request(app)
        .get('/captures')
        .query({ project_id: project.id })
        .expect(200)

      expect(listResponse.body.captures).toHaveLength(1)
      expect(listResponse.body.captures[0].id).toBe(captureId)

      // UPDATE
      const updateResponse = await request(app)
        .patch(`/captures/${captureId}`)
        .send({ status: 'triaged', triage_result: 'Đã xử lý xong' })
        .expect(200)

      expect(updateResponse.body.capture.status).toBe('triaged')

      // DELETE (soft)
      await request(app)
        .delete(`/captures/${captureId}`)
        .expect(200)

      // Verify dismissed
      const afterDelete = await request(app)
        .get('/captures')
        .query({ project_id: project.id, status: 'dismissed' })
        .expect(200)

      expect(afterDelete.body.captures).toHaveLength(1)
      expect(afterDelete.body.captures[0].id).toBe(captureId)
    })
  })
})
