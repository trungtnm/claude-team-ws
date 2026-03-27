# Execution Plan: Hybrid Agent Auth

## Epic: ctw-2b2

## Track: Single (GreenCastle)

Sequential execution — 2 beads, both in `packages/server/`.

### Execution Order

| Step | Bead | Title | Files | Est. |
|------|------|-------|-------|------|
| 1 | ctw-mq6 | Seed agent-bot system user | `packages/server/src/db/seed.ts`, `.env.example` | 15m |
| 2 | bd-n5g | Thread user API key to sessions | `packages/server/src/services/session-runner.ts` | 30m |

### File Scope

```
packages/server/src/db/seed.ts
packages/server/src/services/session-runner.ts
.env.example
```

### Dependencies

```
ctw-mq6 (seed bot user)
  └── bd-n5g (thread API key) — needs bot user to exist for fallback
       └── ctw-2b2 (epic) — close when both done
```

### Verification

After implementation:
1. `pnpm db:migrate` — ensure seed runs cleanly
2. Start a user-triggered agent session → verify CTW_API_KEY = user's key in agent env
3. Verify bot user exists: `SELECT * FROM users WHERE id = 'usr_bot'`
4. Agent session can call `curl -H "Authorization: Bearer $CTW_API_KEY" $CTW_SERVER_URL/api/health` successfully
