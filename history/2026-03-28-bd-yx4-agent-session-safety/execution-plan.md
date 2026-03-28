# Execution Plan — Agent Session Safety

**Epic**: bd-yx4
**Design**: docs/plans/2026-03-28-agent-session-safety-design.md
**Beads**: 7 tasks across 2 tracks

## Dependency Graph

```
                    ┌─→ ctw-yh1 (command policy) ──→ bd-aww (audit log)
ctw-12w (DB schema) ├─→ ctw-09s (perm gating) ────→ bd-4pk (settings UI)
                    └─→ ctw-nvu (cost caps)

bd-g4c (env hardening) — independent
```

## Track 1: BlueLake — Backend Safety Core

**Agent**: BlueLake
**File scope**: `packages/server/src/services/session-runner.ts`, `packages/server/src/db/**`

| Order | Bead | Title | Priority | Est |
|-------|------|-------|----------|-----|
| 1 | ctw-12w | Add safety_mode and command policy config to projects table | P1 | 30m |
| 2 | ctw-yh1 | Implement command policy engine in canUseTool | P1 | 2h |
| 3 | bd-aww | Add session audit log table for tool call tracking | P2 | 1h |
| 4 | ctw-nvu | Implement session cost caps and tool call rate limiting | P2 | 1.5h |

**Critical path**: ctw-12w → ctw-yh1 → bd-aww (longest chain)

**Entry point**: ctw-12w (DB schema — no blockers)

## Track 2: GreenCastle — Auth Gating + UI

**Agent**: GreenCastle
**File scope**: `packages/server/src/middleware/**`, `packages/server/src/routes/projects.ts`, `packages/server/src/routes/sessions.ts`, `packages/client/src/components/settings/**`, `packages/client/src/components/agents/**`

| Order | Bead | Title | Priority | Est |
|-------|------|-------|----------|-----|
| 1 | bd-g4c | Harden buildSessionEnv — filter sensitive env vars | P1 | 30m |
| 2 | ctw-09s | Implement permission mode gating by role | P1 | 1h |
| 3 | bd-4pk | Safety settings UI in project settings page | P2 | 1.5h |

**Note**: ctw-09s depends on ctw-12w (Track 1, step 1). GreenCastle starts with bd-g4c (independent), then waits for ctw-12w before proceeding to ctw-09s.

**Entry point**: bd-g4c (env hardening — no blockers)

## Cross-Track Dependencies

| From (must complete) | To (blocked) | Reason |
|---------------------|--------------|--------|
| ctw-12w (Track 1) | ctw-09s (Track 2) | Permission gating needs safety_mode column |
| ctw-12w (Track 1) | bd-4pk (Track 2) | Settings UI needs safety columns to exist |

## File Scope Boundaries

| Track | Exclusive files | Shared files |
|-------|----------------|--------------|
| BlueLake | session-runner.ts, db/schema.ts, db/migrations/ | projects.ts (read safety_mode) |
| GreenCastle | middleware/auth.ts, settings/safety-tab.tsx | routes/sessions.ts (permission check), routes/projects.ts (PATCH handler) |

**Overlap resolution**: Both tracks touch `routes/sessions.ts` — BlueLake for canUseTool integration, GreenCastle for permission gating in POST /. Sequence: BlueLake's ctw-yh1 (step 2) before GreenCastle's ctw-09s (step 2) to avoid merge conflicts.

## Implementation Order (Recommended)

### Wave 1 (Parallel start)
- BlueLake: ctw-12w (DB schema)
- GreenCastle: bd-g4c (env hardening)

### Wave 2 (After ctw-12w completes)
- BlueLake: ctw-yh1 (command policy)
- GreenCastle: ctw-09s (permission gating)

### Wave 3 (After Wave 2)
- BlueLake: bd-aww (audit log) + ctw-nvu (cost caps) — parallel
- GreenCastle: bd-4pk (settings UI)

## Validation Checklist

After all beads complete:
- [ ] Run full test suite: `pnpm test && pnpm test:integration`
- [ ] Manual test: create session with bypassPermissions as dev user (Mode B) → verify downgrade
- [ ] Manual test: agent tries `rm -rf /` → verify hard-block
- [ ] Manual test: agent tries `git push` → verify pause-and-ask in UI
- [ ] Manual test: session exceeds token limit → verify abort
- [ ] Check audit log for all tool calls in test session
