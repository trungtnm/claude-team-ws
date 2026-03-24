/**
 * CASS (Coding Agent Session Search) CLI wrapper.
 * Indexes completed sessions and provides semantic search over past learnings.
 * Uses hybrid BM25 lexical + MiniLM vector search.
 */

import { execFile } from 'child_process'
import { promisify } from 'util'

const execFileAsync = promisify(execFile)

export const cassService = {
  /**
   * Search past sessions for relevant learnings.
   * Returns matched session excerpts ranked by relevance.
   *
   * @param query - Natural language search query
   * @param days - How far back to search (default: 30 days)
   * @param limit - Max results (default: 5)
   */
  async search(
    query: string,
    days = 30,
    limit = 5,
  ): Promise<Array<{ session: string; excerpt: string; score: number }>> {
    try {
      const { stdout } = await execFileAsync('cass', [
        'search',
        query,
        '--robot',
        '--days', String(days),
        '--limit', String(limit),
        '--json',
      ], { timeout: 15000 })

      const parsed = JSON.parse(stdout)
      if (Array.isArray(parsed)) {
        return parsed.map((r: { session?: string; excerpt?: string; score?: number }) => ({
          session: r.session ?? '',
          excerpt: r.excerpt ?? '',
          score: r.score ?? 0,
        }))
      }
      return []
    } catch (err) {
      console.warn(`CassService.search failed: ${(err as Error).message}`)
      return []
    }
  },

  /**
   * Index a completed session for future search.
   * Should be called after each agent session completes.
   */
  async index(): Promise<void> {
    try {
      await execFileAsync('cass', ['index'], { timeout: 30000 })
    } catch (err) {
      console.warn(`CassService.index failed: ${(err as Error).message}`)
    }
  },
}
