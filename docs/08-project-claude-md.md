# CLAUDE.md (for the claude-team-ws project)

This is the CLAUDE.md template to be placed at the root of the `claude-team-ws` project.

---

```markdown
# CLAUDE.md — claude-team-ws

## The Project

Semi-Auto Epic-Driven Dev Workspace. Web app for the dev team to manage Epics, spawn Claude Code agents, review PRs.

## Stack

- **Frontend**: Vite + React 19 + Tailwind CSS 4 + shadcn/ui + Zustand + TanStack Query
- **Backend**: Express 5 + Socket.IO 4 + Drizzle ORM + SQLite (better-sqlite3)
- **Infrastructure**: Docker Compose (Agent Mail + CM) + PM2 + Cloudflare Tunnel
- **CLI integrations**: claude, br, bv, cass, gh, git

## Monorepo Structure

- `packages/client/` — Vite React SPA
- `packages/server/` — Express API server
- `docker/` — Docker Compose + Dockerfiles

## Commands

```bash
pnpm dev          # Start both client (5173) and server (3000)
pnpm build        # Build for production
pnpm docker:up    # Start Agent Mail + CM containers
pnpm docker:down  # Stop containers
pnpm db:generate  # Generate Drizzle migrations
pnpm db:migrate   # Run migrations
```

## Code Conventions

### TypeScript
- Strict mode enabled
- ES modules (type: "module")
- Use `zod` for all API request validation
- Return types explicit on exported functions

### API Routes
- Express Router per resource: `routes/beads.ts`, `routes/sessions.ts`
- All mutations emit Socket.IO events to relevant rooms
- Use RBAC middleware: `requireRole('pm', 'techlead')`
- CLI wrappers in `services/` use `execFile` (never `exec`)

### Frontend
- Pages in `pages/` directory, components in `components/`
- Use TanStack Query for all server state (no local fetch)
- Zustand only for UI state (sidebar open, active filters)
- Socket.IO events invalidate TanStack Query keys

### Database
- Drizzle ORM for all queries
- SQLite with WAL mode
- Beads Rust (br) is source of truth for issues — NEVER duplicate in app SQLite
- `br sync --flush-only` after every br mutation

### Naming
- Files: kebab-case (`agent-manager.ts`, `epic-card.tsx`)
- Components: PascalCase (`EpicCard`, `AgentStream`)
- Variables/functions: camelCase
- DB columns: snake_case
- API routes: kebab-case paths (`/api/projects/:id/agent-queue`)

## Vietnamese Language

All Vietnamese text must use full diacritical marks:
- Correct: `Tạo phiên làm việc`
- Incorrect: `Tao phien lam viec`

## Testing

- Vitest for unit tests
- Integration tests for API routes
- Test files co-located: `service.test.ts` next to `service.ts`
```
