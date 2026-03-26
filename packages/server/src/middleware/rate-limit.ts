import rateLimit from 'express-rate-limit'
import type { RequestHandler } from 'express'

const isTest = process.env.NODE_ENV === 'test'

const noop: RequestHandler = (_req, _res, next) => next()

/**
 * Global API rate limiter — applied to all routes.
 * 100 requests per minute per IP. Disabled in test environment.
 */
export const globalLimiter: RequestHandler = isTest
  ? noop
  : rateLimit({
      windowMs: 60 * 1000,
      limit: 100,
      standardHeaders: 'draft-7',
      legacyHeaders: false,
      message: { error: 'Too many requests, please try again later' },
    })

/**
 * Strict rate limiter for auth endpoints (login, token refresh).
 * 10 attempts per 15 minutes per IP to prevent brute-force. Disabled in test environment.
 */
export const authLimiter: RequestHandler = isTest
  ? noop
  : rateLimit({
      windowMs: 15 * 60 * 1000,
      limit: 10,
      standardHeaders: 'draft-7',
      legacyHeaders: false,
      message: { error: 'Too many login attempts, please try again later' },
    })
