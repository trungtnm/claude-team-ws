import {
  readFileSync, writeFileSync, readdirSync, mkdirSync, rmSync, statSync, existsSync,
} from 'fs'
import { join, dirname } from 'path'

// ─── Types ─────────────────────────────────────────────────────────────────

export interface FileContent {
  content: string
  mtime: number
}

export interface SkillSummary {
  name: string
  description: string
  triggers: string[]
  mtime: number
}

export interface AgentSummary {
  name: string
  description: string
  model: string | null
  mtime: number
}

export interface ConfigItemSummary {
  name: string
  description: string
  mtime: number
}

export class ConflictError extends Error {
  constructor(
    message: string,
    public readonly currentContent: string,
    public readonly currentMtime: number,
  ) {
    super(message)
    this.name = 'ConflictError'
  }
}

// ─── Validation ────────────────────────────────────────────────────────────

const VALID_NAME = /^[a-z0-9][a-z0-9-]*$/

function validateName(name: string): void {
  if (!VALID_NAME.test(name) || name.includes('..')) {
    throw new Error(`Invalid config item name: "${name}". Must be kebab-case (a-z, 0-9, hyphens).`)
  }
}

// ─── Frontmatter Parsing ───────────────────────────────────────────────────

function parseFrontmatter(content: string): Record<string, unknown> {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/)
  if (!match) return {}

  const yaml = match[1]
  const result: Record<string, unknown> = {}

  for (const line of yaml.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue

    // Handle "key: value" lines
    const colonIdx = trimmed.indexOf(':')
    if (colonIdx === -1) continue

    const key = trimmed.slice(0, colonIdx).trim()
    let value: unknown = trimmed.slice(colonIdx + 1).trim()

    // Handle multiline string (>- or |)
    if (value === '>-' || value === '|' || value === '>') {
      // Skip multiline values — just store empty string
      value = ''
      continue
    }

    // Handle arrays (inline [a, b] or list items below)
    if (typeof value === 'string' && value.startsWith('[') && value.endsWith(']')) {
      value = value.slice(1, -1).split(',').map((s: string) => s.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean)
    }

    // Handle quoted strings
    if (typeof value === 'string' && value.startsWith('"') && value.endsWith('"')) {
      value = value.slice(1, -1)
    }
    if (typeof value === 'string' && value.startsWith("'") && value.endsWith("'")) {
      value = value.slice(1, -1)
    }

    result[key] = value
  }

  // Handle list items (- value) under array keys like triggers
  const lines = yaml.split('\n')
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const colonIdx = line.indexOf(':')
    if (colonIdx === -1) continue

    const key = line.slice(0, colonIdx).trim()
    const afterColon = line.slice(colonIdx + 1).trim()

    if (afterColon === '' || afterColon === '>-' || afterColon === '|' || afterColon === '>') {
      // Check for list items below
      const items: string[] = []
      let j = i + 1
      while (j < lines.length) {
        const nextLine = lines[j].trim()
        if (nextLine.startsWith('- ')) {
          items.push(nextLine.slice(2).trim().replace(/^['"]|['"]$/g, ''))
          j++
        } else if (nextLine === '' || nextLine.startsWith('#')) {
          j++
        } else {
          break
        }
      }

      if (items.length > 0) {
        result[key] = items
      } else if (afterColon === '>-' || afterColon === '>' || afterColon === '|') {
        // Collect multiline text
        const textLines: string[] = []
        let k = i + 1
        while (k < lines.length) {
          const nextLine = lines[k]
          if (nextLine.match(/^\s/) || nextLine.trim() === '') {
            textLines.push(nextLine.trimStart())
            k++
          } else {
            break
          }
        }
        result[key] = textLines.join(' ').trim()
      }
    }
  }

  return result
}

// ─── Service ───────────────────────────────────────────────────────────────

export class ClaudeConfigService {
  private readonly claudeDir: string

  constructor(basePath: string) {
    this.claudeDir = join(basePath, '.claude')
  }

  // ── CLAUDE.md ──────────────────────────────────────────────────────────

  getClaudeMd(): FileContent | null {
    // CLAUDE.md lives at the repo root (parent of .claude/)
    const repoRoot = dirname(this.claudeDir)
    const filepath = join(repoRoot, 'CLAUDE.md')
    return this.readFile(filepath)
  }

  putClaudeMd(content: string, expectedMtime?: number): void {
    const repoRoot = dirname(this.claudeDir)
    const filepath = join(repoRoot, 'CLAUDE.md')
    this.writeFile(filepath, content, expectedMtime)
  }

  // ── Skills ─────────────────────────────────────────────────────────────

  listSkills(): SkillSummary[] {
    const skillsDir = join(this.claudeDir, 'skills')
    if (!existsSync(skillsDir)) return []

    const entries = readdirSync(skillsDir, { withFileTypes: true })
    const skills: SkillSummary[] = []

    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      const skillFile = join(skillsDir, entry.name, 'SKILL.md')
      const file = this.readFile(skillFile)
      if (!file) continue

      const fm = parseFrontmatter(file.content)
      skills.push({
        name: (fm.name as string) ?? entry.name,
        description: (fm.description as string) ?? '',
        triggers: Array.isArray(fm.triggers) ? fm.triggers as string[] : [],
        mtime: file.mtime,
      })
    }

    return skills.sort((a, b) => a.name.localeCompare(b.name))
  }

  getSkill(name: string): FileContent | null {
    validateName(name)
    return this.readFile(join(this.claudeDir, 'skills', name, 'SKILL.md'))
  }

  putSkill(name: string, content: string, expectedMtime?: number): void {
    validateName(name)
    const filepath = join(this.claudeDir, 'skills', name, 'SKILL.md')
    mkdirSync(dirname(filepath), { recursive: true })
    this.writeFile(filepath, content, expectedMtime)
  }

  deleteSkill(name: string): void {
    validateName(name)
    const dir = join(this.claudeDir, 'skills', name)
    if (existsSync(dir)) {
      rmSync(dir, { recursive: true })
    }
  }

  // ── Agents ─────────────────────────────────────────────────────────────

  listAgents(): AgentSummary[] {
    return this.listMdDir('agents').map((item) => {
      const fm = parseFrontmatter(item.content)
      return {
        name: (fm.name as string) ?? item.name,
        description: (fm.description as string) ?? '',
        model: (fm.model as string) ?? null,
        mtime: item.mtime,
      }
    })
  }

  getAgent(name: string): FileContent | null {
    validateName(name)
    return this.readFile(join(this.claudeDir, 'agents', `${name}.md`))
  }

  putAgent(name: string, content: string, expectedMtime?: number): void {
    validateName(name)
    const filepath = join(this.claudeDir, 'agents', `${name}.md`)
    mkdirSync(dirname(filepath), { recursive: true })
    this.writeFile(filepath, content, expectedMtime)
  }

  deleteAgent(name: string): void {
    validateName(name)
    const filepath = join(this.claudeDir, 'agents', `${name}.md`)
    if (existsSync(filepath)) rmSync(filepath)
  }

  // ── Commands ───────────────────────────────────────────────────────────

  listCommands(): ConfigItemSummary[] {
    return this.listMdDir('commands').map((item) => {
      const fm = parseFrontmatter(item.content)
      return {
        name: (fm.name as string) ?? item.name,
        description: (fm.description as string) ?? '',
        mtime: item.mtime,
      }
    })
  }

  getCommand(name: string): FileContent | null {
    validateName(name)
    return this.readFile(join(this.claudeDir, 'commands', `${name}.md`))
  }

  putCommand(name: string, content: string, expectedMtime?: number): void {
    validateName(name)
    const filepath = join(this.claudeDir, 'commands', `${name}.md`)
    mkdirSync(dirname(filepath), { recursive: true })
    this.writeFile(filepath, content, expectedMtime)
  }

  deleteCommand(name: string): void {
    validateName(name)
    const filepath = join(this.claudeDir, 'commands', `${name}.md`)
    if (existsSync(filepath)) rmSync(filepath)
  }

  // ── Rules ──────────────────────────────────────────────────────────────

  listRules(): ConfigItemSummary[] {
    return this.listMdDir('rules').map((item) => ({
      name: item.name,
      description: item.content.split('\n').find((l) => l.trim().length > 0)?.slice(0, 100) ?? '',
      mtime: item.mtime,
    }))
  }

  getRule(name: string): FileContent | null {
    validateName(name)
    return this.readFile(join(this.claudeDir, 'rules', `${name}.md`))
  }

  putRule(name: string, content: string, expectedMtime?: number): void {
    validateName(name)
    const filepath = join(this.claudeDir, 'rules', `${name}.md`)
    mkdirSync(dirname(filepath), { recursive: true })
    this.writeFile(filepath, content, expectedMtime)
  }

  deleteRule(name: string): void {
    validateName(name)
    const filepath = join(this.claudeDir, 'rules', `${name}.md`)
    if (existsSync(filepath)) rmSync(filepath)
  }

  // ── Settings (read-only) ───────────────────────────────────────────────

  getSettings(): Record<string, unknown> | null {
    const filepath = join(this.claudeDir, 'settings.json')
    const file = this.readFile(filepath)
    if (!file) return null
    try {
      return JSON.parse(file.content) as Record<string, unknown>
    } catch {
      return null
    }
  }

  // ── Private helpers ────────────────────────────────────────────────────

  private readFile(filepath: string): FileContent | null {
    try {
      const stat = statSync(filepath)
      const content = readFileSync(filepath, 'utf-8')
      return { content, mtime: Math.floor(stat.mtimeMs) }
    } catch (err: unknown) {
      const code = (err as NodeJS.ErrnoException).code
      if (code === 'ENOENT') return null
      throw err
    }
  }

  private writeFile(filepath: string, content: string, expectedMtime?: number): void {
    if (expectedMtime !== undefined) {
      try {
        const stat = statSync(filepath, { throwIfNoEntry: false })
        if (stat && Math.floor(stat.mtimeMs) !== expectedMtime) {
          const currentContent = readFileSync(filepath, 'utf-8')
          throw new ConflictError(
            'File was modified since last read',
            currentContent,
            Math.floor(stat.mtimeMs),
          )
        }
      } catch (err) {
        if (err instanceof ConflictError) throw err
        // File deleted between stat and read — proceed with write
      }
    }

    mkdirSync(dirname(filepath), { recursive: true })
    writeFileSync(filepath, content, 'utf-8')
  }

  private listMdDir(subdir: string): Array<{ name: string; content: string; mtime: number }> {
    const dir = join(this.claudeDir, subdir)
    if (!existsSync(dir)) return []

    const entries = readdirSync(dir, { withFileTypes: true })
    const items: Array<{ name: string; content: string; mtime: number }> = []

    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith('.md')) continue
      const filepath = join(dir, entry.name)
      const file = this.readFile(filepath)
      if (!file) continue

      items.push({
        name: entry.name.replace(/\.md$/, ''),
        content: file.content,
        mtime: file.mtime,
      })
    }

    return items.sort((a, b) => a.name.localeCompare(b.name))
  }
}
