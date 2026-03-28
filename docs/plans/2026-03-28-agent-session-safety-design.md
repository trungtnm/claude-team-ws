# Agent Session Safety — Design Doc

**Date**: 2026-03-28
**Status**: Draft
**Context**: The web UI allows authenticated users to spawn Claude Code sessions on a shared server. We need layered safety to prevent accidents without adding friction for a trusted team.

## Constraints

- **Audience**: Internal dev team, <10 people, trusted
- **Deployment**: Single shared server, real codebase
- **Complexity budget**: Medium — prevent accidents, not malicious actors
- **Existing tools**: `ubs` (pre-commit gate, globally installed), Agent SDK `canUseTool` callback

## Architecture: 4 Layers of Defense

```
┌─────────────────────────────────────────────────────┐
│  Layer 4 (Future): OS-Level Sandbox                 │
│  srt (Seatbelt/bubblewrap) or E2B (Firecracker)    │
├─────────────────────────────────────────────────────┤
│  Layer 3: Session Guardrails                        │
│  Cost caps, rate limits, timeout, audit log         │
├─────────────────────────────────────────────────────┤
│  Layer 2: Environment Hardening                     │
│  Env var filtering, fs scoping, secret deny-list    │
├─────────────────────────────────────────────────────┤
│  Layer 1: Command Policy Engine (canUseTool)        │
│  Hard-block, pause-and-ask, allow + ubs pre-commit  │
└─────────────────────────────────────────────────────┘
```

## Layer 1: Command Policy Engine

Replaces the current "auto-approve everything" `canUseTool` with a three-tier policy.

### Hard-Block (never execute, return error to agent)

| Category | Patterns |
|----------|----------|
| System destruction | `rm -rf /`, `rm -rf ~`, `rm -rf $HOME`, `mkfs`, `dd if=` targeting devices |
| System paths | Read/write to `/etc`, `/var`, `/usr/local/bin`, `/System` |
| Pipe-to-shell | `curl ... \| bash`, `wget ... \| sh`, `curl ... \| python` |
| Force push protected | `git push --force` to `main`/`master`/`production` |
| System control | `shutdown`, `reboot`, `kill -9 1`, `sudo` |
| Secret files | Read `.env*`, `*.pem`, `*.key`, `~/.ssh/*`, `~/.aws/*`, `~/.config/gcloud/*` |
| Docker escape | `docker run --privileged`, mounting `/var/run/docker.sock` |

### Pause-and-Ask (hold execution, prompt user in web UI)

| Category | Patterns |
|----------|----------|
| Recursive delete | Any `rm -rf` or `rm -r` command |
| Git push | `git push` (any branch) |
| Git destructive | `git reset --hard`, `git checkout .`, `git clean -f` |
| Publishing | `npm publish`, `docker push`, `gh release create` |
| Out-of-scope writes | Write/Edit to files outside `target_dir` |
| Package install | `npm install <pkg>`, `pip install <pkg>` (adding new deps) |

### Allow

Everything else — file reads, edits within project, grep, test runs, builds, git status/log/diff.

### Implementation

```typescript
// In session-runner.ts — makeCanUseTool()

private makeCanUseTool(managed: ManagedSession) {
  return async (toolName: string, input: Record<string, unknown>) => {
    if (toolName === 'AskUserQuestion') {
      return this.handleAskUserQuestion(managed, input)
    }

    // Apply command policy for Bash tool
    if (toolName === 'Bash') {
      const command = input.command as string ?? ''
      const policy = this.evaluateCommandPolicy(command, managed)

      if (policy === 'block') {
        // Return modified input that tells agent the command was blocked
        return {
          behavior: 'allow' as const,
          updatedInput: { ...input, command: `echo "BLOCKED: This command is not allowed by the session safety policy."` }
        }
      }

      if (policy === 'ask') {
        return this.handleDangerousCommand(managed, toolName, input)
      }
    }

    // Apply filesystem policy for Write/Edit
    if (toolName === 'Write' || toolName === 'Edit') {
      const filePath = input.file_path as string ?? ''
      if (this.isOutsideProjectDir(filePath, managed.targetDir)) {
        return this.handleDangerousCommand(managed, toolName, input)
      }
      if (this.isSecretFile(filePath)) {
        return {
          behavior: 'allow' as const,
          updatedInput: { ...input, file_path: '/dev/null' }
        }
      }
    }

    return { behavior: 'allow' as const, updatedInput: input }
  }
}
```

### Configuration

Policy lists are stored in project settings (DB), editable by TechLead via Settings UI:

```json
{
  "safety": {
    "hard_block_patterns": ["rm -rf /", "sudo", ...],
    "pause_ask_patterns": ["rm -rf", "git push", ...],
    "secret_file_patterns": [".env*", "*.pem", "*.key", ...],
    "custom_block_patterns": [],
    "custom_ask_patterns": []
  }
}
```

### ubs Integration

`ubs` is already installed as a global Claude Code pre-commit hook. It acts as a final gate — even if a command passes Layer 1, any committed code goes through `ubs` static analysis (18 detection categories, 8 languages). No additional integration needed.

## Layer 2: Environment Hardening

### Env Var Filtering

Current `buildSessionEnv()` passes `ANTHROPIC_API_KEY` and full `PATH` to the agent. Change to explicit allowlist:

```typescript
private buildSessionEnv(userId: string, projectId: string): Record<string, string | undefined> {
  return {
    // Minimal system env
    PATH: process.env.PATH,
    HOME: process.env.HOME,
    USER: process.env.USER,
    SHELL: '/bin/bash',
    LANG: process.env.LANG,
    TERM: 'xterm-256color',
    NODE_ENV: process.env.NODE_ENV,

    // Anthropic API key — required for Agent SDK
    // Note: SDK needs this to function. Cannot be removed.
    // Mitigated by: agent cannot read its own env vars if
    // secret file deny-list blocks access to /proc/self/environ
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,

    // App-specific (safe to expose)
    CTW_API_KEY: apiKey,
    CTW_SERVER_URL: `http://localhost:${process.env.PORT || 3000}`,
    CTW_PROJECT_ID: projectId,

    // Explicitly NOT passed:
    // - Database credentials
    // - JWT_SECRET
    // - ADMIN_API_KEY
    // - Cloud provider keys (AWS_*, GCP_*, CLOUDFLARE_*)
    // - Docker/registry credentials
  }
}
```

### Filesystem Scoping

- `cwd` is set to `target_dir` (already implemented)
- Hard-block reads/writes outside `target_dir` (Layer 1)
- Exception: `/tmp/ctw-attachments/` for file attachments

### Secret File Deny-List

Agent cannot read these patterns (enforced in `canUseTool` for Read tool):

```
.env, .env.*, .env.local, .env.production
*.pem, *.key, *.p12, *.pfx
credentials.json, service-account*.json
~/.ssh/*, ~/.aws/*, ~/.config/gcloud/*
data/workspace.db (direct DB access)
```

## Layer 3: Session Guardrails

### Cost Cap

```typescript
interface SessionLimits {
  max_input_tokens: number    // Default: 500_000
  max_output_tokens: number   // Default: 100_000
  max_tool_calls: number      // Default: 200 per session
  max_wall_clock_ms: number   // Default: 30 * 60 * 1000 (30 min active)
}
```

Tracked in `ManagedSession`. When exceeded:
- **Warning at 80%**: push event to UI — "Session approaching token limit (80%)"
- **Hard stop at 100%**: abort session, push event — "Session stopped: token limit reached"
- Configurable per-project in settings

### Tool Call Rate Limit

- **>30 calls/minute**: push warning event to UI
- **>60 calls/minute**: auto-pause, require user click to continue
- Prevents runaway loops (denial-of-wallet)

### Audit Log

Extend existing `activity_log` table or add `session_audit_log`:

```sql
CREATE TABLE session_audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL REFERENCES sessions(id),
  tool_name TEXT NOT NULL,
  tool_input_summary TEXT,     -- Redacted/truncated input (max 500 chars)
  policy_result TEXT NOT NULL,  -- 'allow', 'ask', 'block'
  user_decision TEXT,           -- 'approved', 'denied' (for ask), null (for allow/block)
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
```

Every tool call goes through the audit log before execution. Sensitive values (file contents, secrets) are redacted in `tool_input_summary`.

### Timeout

- Active session timeout: 30 min (configurable)
- Idle session cleanup: 24 hours (already planned in bead bd-u9f)
- Triage/background sessions: no active timeout, only idle cleanup

## Layer 4 (Future): OS-Level Sandbox

Not for initial implementation. Documented for when we need it.

### Option A: Anthropic sandbox-runtime (srt)

- Lightweight wrapper around Seatbelt (macOS) / bubblewrap (Linux)
- JSON config for fs/network policies
- No containers, minimal overhead
- Status: `anthropic-experimental` — may not be production-stable

### Option B: E2B Firecracker

- Ephemeral microVMs, 125ms boot, <5MB overhead
- Hardware-level isolation (KVM)
- Open source, purpose-built for AI agents
- Tradeoff: adds cloud dependency or self-host complexity

### When to upgrade to Layer 4

- If deployment moves to multi-tenant (untrusted users)
- If a security incident occurs despite Layers 1-3
- If regulatory/compliance requirements demand stronger isolation

## Permission Mode Gating

Configurable in project settings:

| Setting | Who can use `bypassPermissions` | Default |
|---------|-------------------------------|---------|
| **Mode A** | All authenticated users | Yes (default) |
| **Mode B** | TechLead role only | No |

Stored in `projects` table as `safety_mode` column (`'a'` or `'b'`).

When Mode B is active and a non-TechLead user requests `bypassPermissions`:
- Silently downgrade to `acceptEdits`
- Push info event: "Permission mode downgraded to acceptEdits (project safety policy)"

## Implementation Priority

### Phase 1 (Ship first)
1. Command Policy Engine in `canUseTool` — hard-block + pause-and-ask
2. Env var filtering in `buildSessionEnv()`
3. Secret file deny-list in Read tool filter
4. Permission mode gating (configurable A/B)

### Phase 2 (Follow-up)
5. Session cost caps + token tracking
6. Tool call rate limiting
7. Audit log table + writes
8. Settings UI for policy customization

### Phase 3 (Future)
9. OS-level sandbox evaluation (srt or E2B)
10. Network egress allowlisting

## Research References

- [Cursor: Agent sandboxing via Seatbelt/Landlock](https://cursor.com/blog/agent-sandboxing)
- [E2B: Firecracker microVMs for AI agents](https://e2b.dev/docs)
- [OWASP Top 10 for Agentic Applications 2026](https://genai.owasp.org/resource/owasp-top-10-for-agentic-applications-for-2026/)
- [OWASP AI Agent Security Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/AI_Agent_Security_Cheat_Sheet.html)
- [Anthropic sandbox-runtime (experimental)](https://github.com/anthropic-experimental/sandbox-runtime)
- [CVE-2025-53773: Copilot prompt injection via repo comments](https://nvd.nist.gov/vuln/detail/CVE-2025-53773)
- [CVE-2026-22708: Cursor sandbox bypass via shell builtins](https://www.pillar.security/blog/the-agent-security-paradox-when-trusted-commands-in-cursor-become-attack-vectors)
