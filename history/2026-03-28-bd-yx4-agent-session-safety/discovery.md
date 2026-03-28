# Discovery Report — Agent Session Safety

## Current State

### canUseTool (session-runner.ts:459-468)
- Auto-approves ALL tools except AskUserQuestion
- No command filtering, no filesystem checks, no rate limiting
- AskUserQuestion has full pause-and-ask UX via Socket.IO (working)

### Environment (session-runner.ts:916-941)
- Passes: PATH, HOME, USER, SHELL, LANG, TERM, NODE_ENV, ANTHROPIC_API_KEY, CTW_API_KEY, CTW_SERVER_URL, CTW_PROJECT_ID
- No filtering of sensitive vars — ANTHROPIC_API_KEY exposed to agent
- User's personal CTW_API_KEY passed (or bot key for system sessions)

### Permission Modes (schema.ts:114-116)
- Stored per-session: default/plan/acceptEdits/bypassPermissions
- Applied at SDK level via permissionMode + allowDangerouslySkipPermissions
- Changeable via POST /:sessionId/permission-mode (takes effect on resume)
- No role-based gating — any project member can use bypassPermissions

### Project Settings (schema.ts:22-32)
- Settings inline in projects table: max_concurrent_agents, ask_question_mode
- No safety_mode or policy configuration columns
- PATCH /api/projects/:projectId for updates

### Activity Logging (schema.ts:214-237)
- Logs: capture/epic/session lifecycle, PR events, bead changes
- Does NOT log individual tool calls or command executions
- JSON details field, indexed by (project_id, created_at)

### Rate Limiting (middleware/rate-limit.ts)
- Global: 500 req/min per IP
- Auth: 10 attempts/15 min for login
- Disabled in test/dev (NODE_ENV check)
- No per-session or per-tool rate limiting

### Socket.IO Events (socket-manager.ts, session-runner.ts)
- session:question event for AskUserQuestion — carries text, options, context
- session:lifecycle for status transitions
- Rooms: project:<id>, session:<id>, user:<id>
- Existing pause-and-ask UX can be reused for dangerous command approval

### Integration Tests (sessions.integration.test.ts)
- createTestDb() for isolated in-memory DB
- Mock auth middleware, real DB + routes
- insertSession() helper with overrides
- Pattern: vi.mock services, supertest requests, cleanup in beforeEach

## Key Patterns to Reuse
1. AskUserQuestion pause-and-ask flow → reuse for dangerous command approval
2. Project settings inline in projects table → add safety columns there
3. activity_log → extend for tool call auditing (or new table)
4. express-rate-limit → extend pattern for per-session tool rate limiting
5. requireRole middleware → reuse for permission mode gating
