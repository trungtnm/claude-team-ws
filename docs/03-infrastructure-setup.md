# Infrastructure Setup — claude-team-ws

## Host Requirements

**Mac Mini** (Apple Silicon recommended):
- macOS 14+ (Sonoma)
- Node.js 20+ (via nvm)
- pnpm 9+
- Docker Desktop for Mac
- Git 2.40+
- GitHub CLI (`gh`) authenticated

### Required CLI Tools (native on host)

| Tool | Install | Verify |
|------|---------|--------|
| `claude` | `npm install -g @anthropic-ai/claude-code` | `claude --version` |
| `br` | `cargo install beads_rust` hoặc download binary | `br --version` |
| `bv` | `cargo install beads_viewer` hoặc download binary | `bv --version` |
| `cass` | Download binary từ releases | `cass --version` |
| `gh` | `brew install gh` | `gh --version` |
| `node` | `nvm install 20` | `node --version` |
| `pnpm` | `npm install -g pnpm` | `pnpm --version` |
| `docker` | Docker Desktop | `docker --version` |
| `pm2` | `npm install -g pm2` | `pm2 --version` |
| `cloudflared` | `brew install cloudflared` | `cloudflared --version` |

### Claude CLI Authentication

Claude Code phải được authenticate trên host trước:
```bash
claude auth login
# hoặc set ANTHROPIC_AUTH_TOKEN trong .env
```

### GitHub CLI Authentication

```bash
gh auth login
# Choose: GitHub.com → HTTPS → Login with browser
```

---

## Docker Compose Setup

### `docker/docker-compose.yml`

```yaml
version: '3.8'

services:
  # ─── MCP Agent Mail ──────────────────────────────────
  agent-mail:
    build:
      context: ./agent-mail
      dockerfile: Dockerfile
    container_name: ctw-agent-mail
    ports:
      - "127.0.0.1:8765:8765"
    volumes:
      - agent-mail-data:/app/data
    environment:
      - MCP_HTTP_TOKEN=${MCP_AGENT_MAIL_TOKEN}
      - MCP_AGENT_MAIL_DB_PATH=/app/data/agent_mail.db
      - MCP_AGENT_MAIL_ARCHIVE_PATH=/app/data/archive
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8765/health"]
      interval: 30s
      timeout: 5s
      retries: 3
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"

  # ─── CM Memory Server ────────────────────────────────
  cm-memory:
    build:
      context: ./cm
      dockerfile: Dockerfile
    container_name: ctw-cm-memory
    ports:
      - "127.0.0.1:9900:9900"
    volumes:
      - cm-data:/root/.cass-memory
      # Mount project .cass/ for project-level rules
      - ${PROJECT_ROOT:-.}/.cass:/workspace/.cass
    environment:
      - ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}
      - CM_PORT=9900
      - CM_WORKSPACE=/workspace
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:9900/health"]
      interval: 30s
      timeout: 5s
      retries: 3
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"

volumes:
  agent-mail-data:
    driver: local
  cm-data:
    driver: local
```

### `docker/agent-mail/Dockerfile`

```dockerfile
FROM python:3.13-slim

WORKDIR /app

# Install mcp-agent-mail
RUN pip install --no-cache-dir mcp-agent-mail

# Create data directory
RUN mkdir -p /app/data/archive

EXPOSE 8765

CMD ["python", "-m", "mcp_agent_mail.cli", "serve-http", "--host", "0.0.0.0", "--port", "8765"]
```

### `docker/cm/Dockerfile`

```dockerfile
FROM oven/bun:latest

WORKDIR /app

# Install cm globally
RUN bun install -g cass-memory

# Create directories
RUN mkdir -p /root/.cass-memory /workspace/.cass

EXPOSE 9900

CMD ["cm", "serve", "--port", "9900", "--host", "0.0.0.0"]
```

### Docker Commands

```bash
# Start infrastructure
cd docker && docker compose up -d

# Check status
docker compose ps
docker compose logs -f agent-mail
docker compose logs -f cm-memory

# Restart
docker compose restart

# Stop
docker compose down

# Reset data (DESTRUCTIVE)
docker compose down -v
```

---

## Environment Configuration

### `.env.example`

```bash
# ─── Server ────────────────────────────────────
PORT=3000
NODE_ENV=development

# ─── Database ──────────────────────────────────
DATABASE_PATH=./data/workspace.db

# ─── Auth ──────────────────────────────────────
JWT_SECRET=change-me-to-random-string
# Seed admin user (chỉ dùng lần đầu)
ADMIN_NAME=Admin
ADMIN_EMAIL=admin@team.com
ADMIN_API_KEY=ctw_admin_change_me

# ─── Claude CLI ────────────────────────────────
# Nếu không dùng claude auth login
# ANTHROPIC_AUTH_TOKEN=sk-ant-...

# Default model cho agent sessions
DEFAULT_MODEL=sonnet

# ─── Agent Mail (Docker) ──────────────────────
AGENT_MAIL_URL=http://127.0.0.1:8765/mcp/
MCP_AGENT_MAIL_TOKEN=generate-random-token-here

# ─── CM Memory (Docker) ───────────────────────
CM_URL=http://127.0.0.1:9900
ANTHROPIC_API_KEY=sk-ant-...

# ─── Project ──────────────────────────────────
# Path to project root (nơi chứa .beads/ và repos/)
PROJECT_ROOT=/Users/team/myproject

# ─── Webhooks (optional) ──────────────────────
# SLACK_DEFAULT_WEBHOOK_URL=https://hooks.slack.com/services/...
# DISCORD_DEFAULT_WEBHOOK_URL=https://discord.com/api/webhooks/...

# ─── Cloudflare Tunnel (production) ───────────
# CLOUDFLARE_TUNNEL_TOKEN=...
```

---

## PM2 Production Setup

### `ecosystem.config.cjs`

```javascript
module.exports = {
  apps: [
    {
      name: 'ctw-server',
      script: 'pnpm',
      args: 'run start:server',
      cwd: __dirname,
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
      },
      instances: 1,          // Single instance (SQLite không hỗ trợ multi-process writes)
      autorestart: true,
      max_restarts: 10,
      max_memory_restart: '1G',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      error_file: './logs/server-error.log',
      out_file: './logs/server-out.log',
      merge_logs: true,
    }
  ]
};
```

### PM2 Commands

```bash
# Start
pm2 start ecosystem.config.cjs

# Logs
pm2 logs ctw-server

# Restart
pm2 restart ctw-server

# Stop
pm2 stop ctw-server

# Auto-start on boot
pm2 startup
pm2 save
```

---

## Cloudflare Tunnel + Zero Trust Setup

### Tại sao Cloudflare Zero Trust Access?

Workspace được public ra internet qua Tunnel. Thay vì tự code login/brute-force protection, dùng **Cloudflare Access** làm authentication gate ở lớp ngoài cùng:

- Chỉ email công ty / GitHub team members mới vào được
- MFA enforcement ở Cloudflare level
- DDoS protection built-in
- Express app bên trong chỉ lo role-based logic, không lo internet threats

**Auth flow:**
```
Browser → Cloudflare Access (email/GitHub login) → Cloudflare Tunnel → Express app (role check)
```

### Initial Setup (one time)

```bash
# Login to Cloudflare
cloudflared tunnel login

# Create tunnel
cloudflared tunnel create claude-team-ws

# Note the tunnel ID: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
```

### `cloudflared-config.yml`

```yaml
tunnel: <tunnel-id>
credentials-file: /Users/<user>/.cloudflared/<tunnel-id>.json

ingress:
  - hostname: workspace.yourdomain.com
    service: http://localhost:3000
    originRequest:
      noTLSVerify: true
  - service: http_status:404
```

### DNS Configuration

```bash
# Create DNS record
cloudflared tunnel route dns claude-team-ws workspace.yourdomain.com
```

### Zero Trust Access Policy (Cloudflare Dashboard)

1. Vào **Cloudflare Dashboard → Zero Trust → Access → Applications**
2. **Add Application** → Self-hosted
3. Configure:
   - **Application name**: Claude Team Workspace
   - **Application domain**: `workspace.yourdomain.com`
   - **Session duration**: 24 hours
4. **Add Policy**:
   - **Policy name**: Team Members Only
   - **Action**: Allow
   - **Include rules** (chọn 1 hoặc nhiều):
     - **Emails**: `dev1@company.com`, `dev2@company.com`, ...
     - **Email domains**: `@company.com` (cho phép toàn bộ domain)
     - **GitHub organization**: `your-org-name`
   - **Require**: Multi-factor authentication (optional nhưng recommended)
5. **Save**

### Identity Providers (optional)

Mặc định Cloudflare gửi OTP qua email. Có thể thêm:
- **GitHub**: Team members login bằng GitHub account
- **Google Workspace**: Login bằng company Google account
- **SAML/OIDC**: Integrate với company SSO

Setup tại: **Zero Trust → Settings → Authentication → Login methods**

### Express App: Trust Cloudflare Headers

Khi Cloudflare Access đã xác thực user, nó gửi JWT trong header `Cf-Access-Jwt-Assertion`. Express app có thể:

```typescript
// middleware/cloudflare-auth.ts
import jwt from 'jsonwebtoken'

// Cloudflare Access team domain public key
const CF_ACCESS_CERTS_URL = 'https://<team-name>.cloudflareaccess.com/cdn-cgi/access/certs'

export async function cloudflareAuth(req, res, next) {
  const cfJwt = req.headers['cf-access-jwt-assertion']

  if (process.env.NODE_ENV === 'development' && !cfJwt) {
    // Development: skip Cloudflare auth
    return next()
  }

  if (!cfJwt) {
    return res.status(401).json({ error: 'Cloudflare Access required' })
  }

  try {
    // Verify JWT with Cloudflare public keys
    const decoded = await verifyCfAccessToken(cfJwt)
    // decoded.email is the authenticated user's email
    req.cfEmail = decoded.email
    next()
  } catch (e) {
    return res.status(401).json({ error: 'Invalid Cloudflare Access token' })
  }
}
```

**Kết hợp**: Cloudflare Access xác thực identity (email) → Express app map email → user record → role check.

### Run Tunnel

```bash
# Development (no Access policy needed)
cloudflared tunnel run claude-team-ws

# Production (as service, with Access policy active)
sudo cloudflared service install
sudo launchctl start com.cloudflare.cloudflared
```

---

## Workspace Project Layout (Runtime)

Khi tạo project trong workspace, cấu trúc target repo(s):

```
/Users/team/myproject/           # PROJECT_ROOT
├── .beads/                      # Shared Beads DB (br init)
│   ├── beads.db
│   ├── beads.db-wal
│   ├── issues.jsonl             # Git-tracked export
│   └── config.yaml
├── .cass/                       # Project-level CM rules
│   ├── config.json
│   ├── playbook.yaml            # Project rules (managed by TechLead via UI)
│   └── traumas.jsonl
├── repos/
│   ├── frontend/                # git repo
│   │   ├── .git/
│   │   ├── src/
│   │   └── ...
│   ├── backend/                 # git repo
│   │   ├── .git/
│   │   ├── src/
│   │   └── ...
│   └── mobile/                  # git repo
│       ├── .git/
│       └── ...
└── .ccu/                        # Session state (gitignored)
    ├── CAPTURES.md
    ├── EVIDENCE.md
    └── DECISIONS.md
```

### Initialize Project

```bash
# 1. Init beads
cd /Users/team/myproject
br init

# 2. Init CM project rules
mkdir -p .cass
echo '{}' > .cass/config.json
touch .cass/playbook.yaml

# 3. Verify
br stats --json    # Should return empty stats
br --version       # Confirm br is accessible
```

---

## Full Startup Sequence

```bash
# 1. Start Docker services
cd /path/to/claude-team-ws/docker
docker compose up -d

# 2. Verify Docker services
curl -s http://127.0.0.1:8765/health   # Agent Mail
curl -s http://127.0.0.1:9900/health   # CM Memory

# 3. Start workspace app
cd /path/to/claude-team-ws
pnpm install
pnpm run build
pm2 start ecosystem.config.cjs

# 4. Verify workspace app
curl -s http://localhost:3000/api/auth/me  # Should return 401

# 5. Start Cloudflare Tunnel (production)
cloudflared tunnel run claude-team-ws

# 6. Access
open https://workspace.yourdomain.com
```

### Shutdown Sequence

```bash
pm2 stop ctw-server
cd docker && docker compose stop
# cloudflared will stop with the tunnel service
```
