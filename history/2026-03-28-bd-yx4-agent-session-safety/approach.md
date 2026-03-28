# Approach — Agent Session Safety

## Design Reference
Full design: `docs/plans/2026-03-28-agent-session-safety-design.md`

## Chosen Approach: Layered Defense (Medium Guardrails)

### Layer 1: Command Policy Engine
- Extend `makeCanUseTool` with three-tier policy (hard-block / pause-and-ask / allow)
- Reuse existing AskUserQuestion pause-and-ask UX for dangerous command approval
- Policy config stored in projects table, editable by TechLead
- Risk: LOW — extends existing canUseTool callback pattern

### Layer 2: Environment Hardening
- Filter buildSessionEnv to explicit allowlist
- Add secret file deny-list in canUseTool for Read tool
- Filesystem boundary check for Write/Edit tools
- Risk: LOW — simple string matching, no new infrastructure

### Layer 3: Session Guardrails
- Token usage tracking in ManagedSession (extract from SDK usage events)
- Tool call counter with rate limit thresholds
- New session_audit_log table for tool call logging
- Risk: MEDIUM — token tracking depends on SDK event format

### Permission Mode Gating
- Add safety_mode column to projects table ('a' or 'b')
- Enforce in session creation route + permission-mode change route
- Risk: LOW — simple role check

## Risk Map

| Component | Risk | Reason |
|-----------|------|--------|
| Command policy patterns (regex) | LOW | String matching, well-understood |
| Pause-and-ask for Bash tool | LOW | Reuses existing AskUserQuestion flow |
| Env var filtering | LOW | Modify one function |
| Secret file deny-list | LOW | Pattern matching in canUseTool |
| Permission mode gating | LOW | Add role check to existing route |
| Safety settings in projects table | LOW | Add columns, migration |
| Token usage tracking | MEDIUM | Depends on SDK assistant.message.usage format |
| Session audit log table | LOW | New table, simple inserts |
| Tool call rate limiting | MEDIUM | Need per-session counters, threshold logic |
| Settings UI for policy config | LOW | Follows existing project settings pattern |

## No HIGH Risk Items
All components extend existing patterns. No spikes needed.
