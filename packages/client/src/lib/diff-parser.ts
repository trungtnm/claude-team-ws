import type { PrFile } from '@/types'

interface GitHubFile {
  filename: string
  additions: number
  deletions: number
  patch?: string
}

/**
 * Parse a unified diff hunk into old (left) and new (right) content.
 * Handles lines starting with ' ' (context), '-' (removed), '+' (added).
 */
function parseHunkToSides(patch: string): { oldCode: string; newCode: string } {
  const lines = patch.split('\n')
  const oldLines: string[] = []
  const newLines: string[] = []

  for (const line of lines) {
    // Skip hunk headers
    if (line.startsWith('@@')) continue
    // Skip "No newline at end of file" markers
    if (line.startsWith('\\ No newline')) continue

    if (line.startsWith('-')) {
      oldLines.push(line.slice(1))
    } else if (line.startsWith('+')) {
      newLines.push(line.slice(1))
    } else {
      // Context line (starts with ' ' or is the raw content)
      const content = line.startsWith(' ') ? line.slice(1) : line
      oldLines.push(content)
      newLines.push(content)
    }
  }

  return {
    oldCode: oldLines.join('\n'),
    newCode: newLines.join('\n'),
  }
}

/**
 * Transform GitHub PR files array into our PrFile format.
 * Each GitHub file has a `patch` field with the unified diff.
 */
export function transformGitHubFiles(files: GitHubFile[]): PrFile[] {
  return files.map((file) => {
    const { oldCode, newCode } = file.patch
      ? parseHunkToSides(file.patch)
      : { oldCode: '', newCode: '' }

    return {
      path: file.filename,
      additions: file.additions,
      deletions: file.deletions,
      oldCode,
      newCode,
    }
  })
}

/**
 * Parse a full `gh pr diff` output into per-file PrFile objects.
 * Splits by `diff --git` headers and extracts filenames and hunks.
 */
export function parsePrDiff(rawDiff: string): PrFile[] {
  if (!rawDiff) return []

  const fileSections = rawDiff.split(/^diff --git /m).filter(Boolean)
  const files: PrFile[] = []

  for (const section of fileSections) {
    const lines = section.split('\n')

    // Extract filename from "a/path b/path" header
    const headerMatch = lines[0]?.match(/a\/(.+?)\s+b\/(.+)/)
    if (!headerMatch) continue

    const path = headerMatch[2]

    // Find the start of the first hunk
    const hunkStart = lines.findIndex((l) => l.startsWith('@@'))
    if (hunkStart === -1) {
      files.push({ path, additions: 0, deletions: 0, oldCode: '', newCode: '' })
      continue
    }

    const hunkContent = lines.slice(hunkStart).join('\n')
    const { oldCode, newCode } = parseHunkToSides(hunkContent)

    // Count additions/deletions
    let additions = 0
    let deletions = 0
    for (const line of lines.slice(hunkStart)) {
      if (line.startsWith('+') && !line.startsWith('+++')) additions++
      if (line.startsWith('-') && !line.startsWith('---')) deletions++
    }

    files.push({ path, additions, deletions, oldCode, newCode })
  }

  return files
}
