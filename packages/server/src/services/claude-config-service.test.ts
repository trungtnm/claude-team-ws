import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { randomBytes } from 'crypto'
import { ClaudeConfigService, ConflictError } from './claude-config-service.js'

function createTempDir(): string {
  const dir = join(tmpdir(), `claude-config-test-${randomBytes(6).toString('hex')}`)
  mkdirSync(dir, { recursive: true })
  return dir
}

describe('ClaudeConfigService', () => {
  let tempDir: string
  let service: ClaudeConfigService

  beforeEach(() => {
    tempDir = createTempDir()
    service = new ClaudeConfigService(tempDir)
  })

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true })
  })

  // ── CLAUDE.md ────────────────────────────────────────────────────────

  describe('CLAUDE.md', () => {
    it('returns null when CLAUDE.md does not exist', () => {
      expect(service.getClaudeMd()).toBeNull()
    })

    it('reads CLAUDE.md from repo root', () => {
      writeFileSync(join(tempDir, 'CLAUDE.md'), '# Project\nRules here')
      const result = service.getClaudeMd()
      expect(result).not.toBeNull()
      expect(result!.content).toBe('# Project\nRules here')
      expect(result!.mtime).toBeTypeOf('number')
    })

    it('writes CLAUDE.md to repo root', () => {
      service.putClaudeMd('# New content')
      const content = readFileSync(join(tempDir, 'CLAUDE.md'), 'utf-8')
      expect(content).toBe('# New content')
    })

    it('throws ConflictError on stale mtime', () => {
      writeFileSync(join(tempDir, 'CLAUDE.md'), 'original')

      // Use a fake past mtime to simulate stale read
      expect(() => service.putClaudeMd('my update', 1000))
        .toThrow(ConflictError)
    })

    it('allows write when mtime matches', () => {
      writeFileSync(join(tempDir, 'CLAUDE.md'), 'original')
      const file = service.getClaudeMd()!

      // Write with correct mtime — should not throw
      service.putClaudeMd('updated', file.mtime)
      expect(service.getClaudeMd()!.content).toBe('updated')
    })
  })

  // ── Skills ───────────────────────────────────────────────────────────

  describe('Skills', () => {
    it('returns empty array when skills dir does not exist', () => {
      expect(service.listSkills()).toEqual([])
    })

    it('lists skills with parsed frontmatter', () => {
      const skillContent = `---
name: test-skill
description: A test skill
triggers:
  - test
  - testing
---

# Test Skill

Do testing things.`

      const skillDir = join(tempDir, '.claude', 'skills', 'test-skill')
      mkdirSync(skillDir, { recursive: true })
      writeFileSync(join(skillDir, 'SKILL.md'), skillContent)

      const skills = service.listSkills()
      expect(skills).toHaveLength(1)
      expect(skills[0].name).toBe('test-skill')
      expect(skills[0].description).toBe('A test skill')
      expect(skills[0].triggers).toEqual(['test', 'testing'])
    })

    it('creates a new skill', () => {
      service.putSkill('my-skill', '---\nname: my-skill\n---\n# Content')
      const skill = service.getSkill('my-skill')
      expect(skill).not.toBeNull()
      expect(skill!.content).toContain('my-skill')
    })

    it('deletes a skill', () => {
      service.putSkill('to-delete', '# Delete me')
      expect(service.getSkill('to-delete')).not.toBeNull()

      service.deleteSkill('to-delete')
      expect(service.getSkill('to-delete')).toBeNull()
    })

    it('rejects invalid skill names', () => {
      expect(() => service.putSkill('../escape', 'bad')).toThrow('Invalid config item name')
      expect(() => service.putSkill('has/slash', 'bad')).toThrow('Invalid config item name')
      expect(() => service.putSkill('UPPER', 'bad')).toThrow('Invalid config item name')
    })

    it('allows kebab-case names with numbers', () => {
      service.putSkill('my-skill-2', '# content')
      expect(service.getSkill('my-skill-2')).not.toBeNull()
    })
  })

  // ── Agents ───────────────────────────────────────────────────────────

  describe('Agents', () => {
    it('returns empty array when agents dir does not exist', () => {
      expect(service.listAgents()).toEqual([])
    })

    it('lists agents with parsed frontmatter', () => {
      const agentContent = `---
name: code-reviewer
description: Reviews code for quality
model: opus
---

Review code carefully.`

      mkdirSync(join(tempDir, '.claude', 'agents'), { recursive: true })
      writeFileSync(join(tempDir, '.claude', 'agents', 'code-reviewer.md'), agentContent)

      const agents = service.listAgents()
      expect(agents).toHaveLength(1)
      expect(agents[0].name).toBe('code-reviewer')
      expect(agents[0].description).toBe('Reviews code for quality')
      expect(agents[0].model).toBe('opus')
    })

    it('creates and reads an agent', () => {
      service.putAgent('worker', '---\nname: worker\n---\nDo work')
      const agent = service.getAgent('worker')
      expect(agent).not.toBeNull()
      expect(agent!.content).toContain('worker')
    })

    it('deletes an agent', () => {
      service.putAgent('temp', '# temp')
      service.deleteAgent('temp')
      expect(service.getAgent('temp')).toBeNull()
    })
  })

  // ── Commands ─────────────────────────────────────────────────────────

  describe('Commands', () => {
    it('CRUD cycle works', () => {
      expect(service.listCommands()).toEqual([])

      service.putCommand('deploy', '---\nname: deploy\ndescription: Deploy to prod\n---\nSteps...')
      const cmds = service.listCommands()
      expect(cmds).toHaveLength(1)
      expect(cmds[0].name).toBe('deploy')

      const cmd = service.getCommand('deploy')
      expect(cmd).not.toBeNull()

      service.deleteCommand('deploy')
      expect(service.getCommand('deploy')).toBeNull()
    })
  })

  // ── Rules ────────────────────────────────────────────────────────────

  describe('Rules', () => {
    it('CRUD cycle works', () => {
      expect(service.listRules()).toEqual([])

      service.putRule('api-conventions', '# API Conventions\n\nAlways use REST.')
      const rules = service.listRules()
      expect(rules).toHaveLength(1)
      expect(rules[0].name).toBe('api-conventions')

      const rule = service.getRule('api-conventions')
      expect(rule!.content).toContain('API Conventions')

      service.deleteRule('api-conventions')
      expect(service.getRule('api-conventions')).toBeNull()
    })

    it('description is first non-empty line (truncated)', () => {
      service.putRule('long-rule', '\n# My Long Rule Title That Goes On And On\n\nMore content here.')
      const rules = service.listRules()
      expect(rules[0].description).toBe('# My Long Rule Title That Goes On And On')
    })
  })

  // ── Settings ─────────────────────────────────────────────────────────

  describe('Settings', () => {
    it('returns null when settings.json does not exist', () => {
      expect(service.getSettings()).toBeNull()
    })

    it('reads and parses settings.json', () => {
      mkdirSync(join(tempDir, '.claude'), { recursive: true })
      writeFileSync(join(tempDir, '.claude', 'settings.json'), '{"permissions":{"allow":["Bash"]}}')
      const settings = service.getSettings()
      expect(settings).toEqual({ permissions: { allow: ['Bash'] } })
    })
  })

  // ── Conflict Detection ───────────────────────────────────────────────

  describe('Conflict Detection', () => {
    it('ConflictError includes current content and mtime', () => {
      service.putSkill('conflict-test', 'original content')

      // Use a fake past mtime to guarantee conflict
      try {
        service.putSkill('conflict-test', 'my update', 1000)
        expect.fail('Should have thrown ConflictError')
      } catch (err) {
        expect(err).toBeInstanceOf(ConflictError)
        const conflict = err as ConflictError
        expect(conflict.currentContent).toBe('original content')
        expect(conflict.currentMtime).toBeTypeOf('number')
        expect(conflict.currentMtime).toBeGreaterThan(1000)
      }
    })

    it('skips mtime check when expectedMtime is not provided', () => {
      service.putSkill('no-check', 'original')
      // Write again without mtime — should always succeed
      service.putSkill('no-check', 'updated')
      expect(service.getSkill('no-check')!.content).toBe('updated')
    })
  })

  // ── Path Validation ──────────────────────────────────────────────────

  describe('Path Validation', () => {
    const invalidNames = ['..', '../etc', 'a/b', 'A-upper', 'has space', '.hidden', '-starts-dash']

    for (const name of invalidNames) {
      it(`rejects invalid name: "${name}"`, () => {
        expect(() => service.getSkill(name)).toThrow()
      })
    }

    const validNames = ['my-skill', 'skill-2', 'a', 'test-123']

    for (const name of validNames) {
      it(`accepts valid name: "${name}"`, () => {
        // Should not throw (may return null for non-existent)
        expect(() => service.getSkill(name)).not.toThrow()
      })
    }
  })
})
