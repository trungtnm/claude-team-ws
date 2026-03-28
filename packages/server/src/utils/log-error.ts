/**
 * Log caught errors to stderr and return a safe message for the client.
 * In production, internal details are hidden; in dev, the real message is returned.
 */
export function logError(context: string, err: unknown): string {
  const message = err instanceof Error ? err.message : String(err)
  console.error(`[ERROR] ${context}:`, err instanceof Error ? err.stack : err)
  if (process.env.NODE_ENV === 'production') {
    return 'An internal error occurred'
  }
  return message
}
