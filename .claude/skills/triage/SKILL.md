---
name: triage
description: >-
  Triage specific captures by ID via the REST API.
  Accepts comma-separated capture IDs (cap_xxx format).
  Outputs structured JSON for server rendering.
  Converts captures to epics, quick-fixes, or deferred items.
domain: project-management
role: specialist
triggers:
  - triage
  - captures
  - classify ideas
  - process captures
  - sort backlog
---

# Capture Triage Pipeline

Triages captures into structured, actionable work items. Fetches and updates captures via the **REST API**. Creates epics via the **Epics API**.

## Input

Accepts a comma-separated list of capture IDs (the `cap_xxx` database IDs):

```
/triage cap_abc123,cap_def456    — triage specific captures
/triage                          — triage ALL pending captures
```

## Configuration

The skill reads server connection details from environment variables. These MUST be set before the agent session starts:

```
CTW_SERVER_URL=http://localhost:3000    # Server base URL
CTW_API_KEY=ctw-dev-key-change-me       # API key for Bearer auth
CTW_PROJECT_ID=proj_xxx                 # Current project ID
```

The session runner is responsible for injecting these env vars when spawning the Claude Code agent.

## API Reference

All API calls use:
- Base URL: `$CTW_SERVER_URL` (from env)
- Auth header: `Authorization: Bearer $CTW_API_KEY` (from env)
- Project scope: `$CTW_PROJECT_ID` (from env)

### Fetch captures
```bash
curl -H "Authorization: Bearer $CTW_API_KEY" \
  "$CTW_SERVER_URL/api/projects/$CTW_PROJECT_ID/captures?status=pending"
# Response: { "captures": [{ "id": "cap_xxx", "text": "...", "status": "pending", ... }] }
```

### Update a capture (after triage)
```bash
curl -X PATCH -H "Authorization: Bearer $CTW_API_KEY" -H "Content-Type: application/json" \
  "$CTW_SERVER_URL/api/projects/$CTW_PROJECT_ID/captures/$CAPTURE_ID" \
  -d '{ "status": "triaged", "triage_result": "Created epic epic_xxx: Implement feature X" }'
```

### Create an epic
```bash
curl -X POST -H "Authorization: Bearer $CTW_API_KEY" -H "Content-Type: application/json" \
  "$CTW_SERVER_URL/api/projects/$CTW_PROJECT_ID/epics" \
  -d '{
    "title": "Epic title",
    "description": "## Context\n...\n## What to Change\n...\n## Acceptance Criteria\n...",
    "priority": 2,
    "type": "feature",
    "labels": ["from-capture"]
  }'
# Response: { "epic": { "id": "epic_xxx", "title": "...", ... } }
```

### Capture statuses
- `pending` — untriaged (default)
- `triaged` — processed, epic created or quick-fix noted
- `deferred` — valid but not urgent
- `dismissed` — out-of-scope

## Prerequisites

- Env vars `CTW_SERVER_URL`, `CTW_API_KEY`, and `CTW_PROJECT_ID` must be set
- Server must be running and reachable at `$CTW_SERVER_URL`

If no pending captures match the given IDs, output:
```json
{ "status": "nothing_to_triage", "results": [] }
```

## Triage Flow

### 0. Fetch Captures

Use the Captures API to fetch the target captures:
- If specific IDs provided: fetch each by listing pending captures and filtering by the given IDs
- If no IDs: fetch all pending captures via `GET /api/projects/:projectId/captures?status=pending`

### 1. Read and Understand

For each capture, read the `text` field. Briefly investigate the codebase for context — check the referenced file/module/feature and `git log --oneline -10` for recent activity.

### 2. Classify

| Classification | Criteria | Action |
|---------------|----------|--------|
| **quick-fix** | Can be done in <5 minutes, no design decisions | Create epic tagged quick-fix, update capture via API |
| **new-epic** | Substantial work requiring tracking | Discuss with user, create epic via API, update capture |
| **defer** | Valid but not urgent, no active epic for it | Update capture status to `deferred` via API |
| **out-of-scope** | Not relevant to current project goals | Update capture status to `dismissed` via API |

### 3. Execute

**quick-fix**: Create an epic tagged as quick-fix (do NOT implement — triage only produces plans, not code), then update the capture:
```bash
# Create epic via REST API
EPIC_RESPONSE=$(curl -s -X POST -H "Authorization: Bearer $CTW_API_KEY" -H "Content-Type: application/json" \
  "$CTW_SERVER_URL/api/projects/$CTW_PROJECT_ID/epics" \
  -d '{"title":"<fix title>","priority":3,"type":"bug","labels":["from-capture","quick-fix"],"description":"<what to fix and where>"}')

# Update capture
curl -X PATCH -H "Authorization: Bearer $CTW_API_KEY" -H "Content-Type: application/json" \
  "$CTW_SERVER_URL/api/projects/$CTW_PROJECT_ID/captures/$CAPTURE_ID" \
  -d '{ "status": "triaged", "triage_result": "quick-fix epic <epic-id>: <title>" }'
```

**new-epic**: A one-liner capture is NOT enough for an agent to work on. Before creating the epic, run a mini-discussion to enrich it:

1. **Investigate the codebase** — find relevant files, existing patterns, constraints
2. **Ask the user 1-3 targeted questions** — one at a time, multiple choice preferred:
   - What exactly should change? (scope)
   - What does success look like? (acceptance criteria)
   - Any constraints or preferences? (approach)
   Skip questions you can answer from the codebase investigation.
3. **Create a rich epic** with enough context for an agent to work autonomously:
   ```bash
   curl -s -X POST -H "Authorization: Bearer $CTW_API_KEY" -H "Content-Type: application/json" \
     "$CTW_SERVER_URL/api/projects/$CTW_PROJECT_ID/epics" \
     -d '{
       "title": "<clear title>",
       "priority": <assessed 0-4>,
       "type": "<task|bug|feature>",
       "labels": ["from-capture"],
       "description": "## Context\n<Why this matters.>\n\n## What to Change\n<Specific files/behaviors.>\n\n## Acceptance Criteria\n- [ ] <criterion 1>\n- [ ] <criterion 2>\n\n## Technical Notes\n<Patterns, constraints, relevant files.>"
     }'
   ```
4. Update capture via API:
   ```bash
   curl -X PATCH -H "Authorization: Bearer $CTW_API_KEY" -H "Content-Type: application/json" \
     "$CTW_SERVER_URL/api/projects/$CTW_PROJECT_ID/captures/$CAPTURE_ID" \
     -d '{ "status": "triaged", "triage_result": "-> epic <epic-id>: <title>" }'
   ```

The epic description must be self-contained — a worker agent with zero prior context should be able to read it and start implementing without asking questions.

**defer**: Update capture status via API:
```bash
curl -X PATCH -H "Authorization: Bearer $CTW_API_KEY" -H "Content-Type: application/json" \
  "$CTW_SERVER_URL/api/projects/$CTW_PROJECT_ID/captures/$CAPTURE_ID" \
  -d '{ "status": "deferred" }'
```

**out-of-scope**: Update capture status via API:
```bash
curl -X PATCH -H "Authorization: Bearer $CTW_API_KEY" -H "Content-Type: application/json" \
  "$CTW_SERVER_URL/api/projects/$CTW_PROJECT_ID/captures/$CAPTURE_ID" \
  -d '{ "status": "dismissed", "triage_result": "out-of-scope: <reason>" }'
```

### 4. Structured Output

After processing all targeted captures, output a **structured JSON block** that the server can parse and render in the UI. This MUST be the final output, wrapped in a fenced code block:

````
```triage-result
{
  "status": "complete",
  "summary": {
    "quick_fixes": 1,
    "new_epics": 2,
    "deferred": 1,
    "out_of_scope": 0
  },
  "results": [
    {
      "capture_id": "cap_abc123",
      "capture_text": "fix typo in error message",
      "classification": "quick-fix",
      "action_taken": "Created quick-fix epic",
      "epic_id": "epic_abc123",
      "epic_title": "Fix typo in error message"
    },
    {
      "capture_id": "cap_def456",
      "capture_text": "implement project image upload",
      "classification": "new-epic",
      "action_taken": "Created epic with full description and acceptance criteria",
      "epic_id": "epic_def456",
      "epic_title": "Implement project image upload with R2 storage",
      "epic_priority": 2,
      "epic_type": "feature"
    }
  ],
  "epics_created": [
    {
      "id": "epic_abc123",
      "title": "Fix typo in error message",
      "priority": 3,
      "type": "bug",
      "labels": ["from-capture", "quick-fix"]
    },
    {
      "id": "epic_def456",
      "title": "Implement project image upload with R2 storage",
      "priority": 2,
      "type": "feature",
      "labels": ["from-capture"]
    }
  ]
}
```
````

**JSON Schema Notes:**
- `capture_id`: the database ID (format: `cap_xxx`) — NOT a positional index
- `classification`: one of `quick-fix`, `new-epic`, `defer`, `out-of-scope`
- `epic_id`: the epic ID if one was created; null otherwise
- `epics_created`: array of newly created epics with metadata

## Graceful Degradation

If the Captures API is unreachable: output `{ "status": "error", "message": "Cannot reach Captures API at $CTW_SERVER_URL" }` and stop.

If the Epics API fails when creating an epic: log the error in the result JSON and continue processing remaining captures.

If any of the required env vars (`CTW_SERVER_URL`, `CTW_API_KEY`, `CTW_PROJECT_ID`) are missing: output `{ "status": "error", "message": "Missing required env var: CTW_SERVER_URL | CTW_API_KEY | CTW_PROJECT_ID" }` and stop.

## Rules

- **NEVER modify code, create files, or make commits** — triage ONLY produces epics (plans) and updates capture statuses. All code changes happen later when a worker agent picks up the epic.
- **Process only targeted captures** — if IDs are provided, only triage those specific captures. If no IDs, fetch and process all pending captures.
- **Update captures via API after each action** — use PATCH to set status and triage_result so the UI reflects changes in real-time
- **Classify quickly, enrich thoroughly** — classification is fast (seconds), but new-epic enrichment takes time (1-3 questions). This is intentional: cheap captures in, rich epics out.
- **Epics must be agent-ready** — a worker agent reading the epic description should be able to start implementing without asking questions.
- **Quick-fixes earn their name** — if it takes more than 5 minutes, reclassify as new-epic
- **One question at a time** — when enriching new-epics, ask the user one question at a time, multiple choice preferred.
- **Always end with structured JSON** — the `triage-result` code block MUST be the last output so the server can parse it reliably.
