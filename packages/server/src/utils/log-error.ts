/**
 * Log caught errors to stderr in non-production environments.
 * Call this inside every route catch block so errors appear in the terminal.
 */
export function logError(context: string, err: unknown): string {
  const message = err instanceof Error ? err.message : String(err)
  if (process.env.NODE_ENV !== 'production') {
    console.error(`[ERROR] ${context}:`, err instanceof Error ? err.stack : err)
  }
  return message
}
