# Discovery: Hybrid Agent Auth

## Current State

### User System
- **Schema**: `users` table with `id`, `name`, `email`, `role`, `api_key`, `avatar_url`, timestamps
- **Roles**: `pm`, `dev`, `techlead`, `viewer` — no `system` role
- **Seed**: 5 human users (usr_admin, usr_pm, usr_dev1, usr_dev2, usr_viewer). No bot/system user.
- **API key**: unique, indexed, nullable TEXT field. Looked up via `findUser({ apiKey })`

### Auth Flow
1. Bearer token → lookup by `api_key` → set `req.user`
2. JWT cookie fallback → lookup by `userId` → set `req.user`
3. Role check via `requireRole()` middleware

### Session Runner
- Uses `@anthropic-ai/claude-agent-sdk` `query()` — NOT child_process spawn
- Options passed: `model`, `cwd`, `permissionMode`, `abortController`, `systemPrompt`, `canUseTool`
- **No env vars injected** into agent sessions
- Agent SDK inherits parent process env vars (Node.js default behavior)
- Session stores `user_id` of the creating user

### Environment
- `CTW_SERVER_URL`, `CTW_API_KEY`, `CTW_PROJECT_ID` already in `.env.example`
- `CTW_E2E_API_KEY` used for seed admin key

## Gaps
1. No `system` role or bot user in schema/seed
2. Session runner doesn't set `CTW_API_KEY` per-session (user's key vs bot key)
3. Agent SDK `query()` inherits parent env — need to set env vars BEFORE calling query, or use process.env mutation
4. No mechanism to pass user-specific API key to the agent subprocess
