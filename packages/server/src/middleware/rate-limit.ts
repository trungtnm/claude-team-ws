import rateLimit from 'express-rate-limit'

/**
 * Global API rate limiter — applied to all routes.
 * 100 requests per minute per IP.
 */
export const globalLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 100,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later' },
})

/**
 * Strict rate limiter for auth endpoints (login, token refresh).
 * 10 attempts per 15 minutes per IP to prevent brute-force.
 */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many login attempts, please try again later' },
})
