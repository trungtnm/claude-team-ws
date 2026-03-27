# Approach: Hybrid Agent Auth

## Gap Analysis

| What Exists | What's Needed |
|-------------|---------------|
| User `api_key` field in DB, Bearer auth | Thread user's api_key to agent sessions |
| 5 human users seeded | Add `agent-bot` system user in seed |
| Agent SDK `query()` with basic options | Pass `env` option with CTW_* vars per session |
| `CTW_API_KEY` in .env.example | Differentiate user-key vs bot-key usage |

## Approach

**Single approach — low complexity, no alternatives needed:**

1. **Add `agent-bot` user** to seed with role `dev` (or new `system` role) and a dedicated API key
2. **Add `api_key` column** to users table lookup in session runner — fetch the starting user's api_key
3. **Pass `env` option** to Agent SDK `query()` with per-session CTW_* vars:
   - User-triggered: `CTW_API_KEY = user.api_key`
   - Background: `CTW_API_KEY = process.env.CTW_BOT_API_KEY`
4. **Add `CTW_BOT_API_KEY`** to `.env.example`

### Key Insight
The Agent SDK `query()` accepts an `env` option (confirmed in sdk.d.ts line 905). This means we can pass per-session environment variables without mutating `process.env` — no concurrency issues.

```typescript
const agentQuery = query({
  prompt,
  options: {
    ...existingOptions,
    env: {
      ...process.env,
      CTW_API_KEY: userApiKey,       // per-session
      CTW_SERVER_URL: serverUrl,
      CTW_PROJECT_ID: projectId,
    },
  },
})
```

## Risk Assessment

| Component | Risk | Rationale |
|-----------|------|-----------|
| Seed bot user | LOW | Pattern exists (just another INSERT) |
| Fetch user api_key in runner | LOW | DB query already used, just add column |
| Pass env to query() | LOW | SDK supports it natively (sdk.d.ts line 905) |
| Role enum change | MEDIUM | Adding 'system' to role enum requires migration |

## Decision: Skip `system` role

Adding a new role to the enum requires a migration and changes to `requireRole()` checks. Instead, give `agent-bot` the `dev` role — it needs to read/write captures but not merge PRs. Simpler, no migration needed.
