import { Router } from 'express'
import type { Request, Response } from 'express'
import jwt from 'jsonwebtoken'
import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { db } from '../db/index.js'
import * as schema from '../db/schema.js'
import { authenticate } from '../middleware/auth.js'

const router = Router()

const loginSchema = z.object({
  email: z.string().email(),
  api_key: z.string().min(1),
})

router.post('/login', async (req: Request, res: Response): Promise<void> => {
  try {
    const parsed = loginSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: 'Dữ liệu đăng nhập không hợp lệ', details: parsed.error.issues })
      return
    }

    const { email, api_key: apiKey } = parsed.data

    const user = db
      .select({
        id: schema.users.id,
        name: schema.users.name,
        email: schema.users.email,
        role: schema.users.role,
      })
      .from(schema.users)
      .where(eq(schema.users.email, email))
      .get()

    if (!user) {
      res.status(401).json({ error: 'Email hoặc API key không đúng' })
      return
    }

    // Verify api_key matches
    const userWithKey = db
      .select({ api_key: schema.users.api_key })
      .from(schema.users)
      .where(eq(schema.users.id, user.id))
      .get()

    if (userWithKey?.api_key !== apiKey) {
      res.status(401).json({ error: 'Email hoặc API key không đúng' })
      return
    }

    const jwtSecret = process.env.JWT_SECRET
    if (!jwtSecret) {
      res.status(500).json({ error: 'JWT_SECRET chưa được cấu hình' })
      return
    }

    const token = jwt.sign({ userId: user.id }, jwtSecret, { expiresIn: '7d' })

    res.cookie('ctw_session', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    })

    res.json({ user })
  } catch (error) {
    console.error('Đăng nhập thất bại:', error)
    res.status(500).json({ error: 'Lỗi máy chủ nội bộ' })
  }
})

router.get('/me', authenticate, (req: Request, res: Response): void => {
  res.json({ user: req.user })
})

router.post('/logout', (_req: Request, res: Response): void => {
  res.clearCookie('ctw_session')
  res.json({ message: 'Đã đăng xuất' })
})

export default router
