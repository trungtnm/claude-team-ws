# Dependencies & Package Setup — claude-team-ws

## Monorepo Structure

```
claude-team-ws/
├── package.json              # Root workspace config
├── pnpm-workspace.yaml       # pnpm workspace declaration
├── packages/
│   ├── client/package.json   # Frontend SPA
│   └── server/package.json   # Backend API
└── tsconfig.base.json        # Shared TS config
```

### `pnpm-workspace.yaml`

```yaml
packages:
  - 'packages/*'
```

---

## Root `package.json`

```json
{
  "name": "claude-team-ws",
  "private": true,
  "scripts": {
    "dev": "concurrently \"pnpm --filter server dev\" \"pnpm --filter client dev\"",
    "build": "pnpm --filter server build && pnpm --filter client build",
    "start:server": "pnpm --filter server start",
    "db:generate": "pnpm --filter server db:generate",
    "db:migrate": "pnpm --filter server db:migrate",
    "docker:up": "cd docker && docker compose up -d",
    "docker:down": "cd docker && docker compose down",
    "docker:logs": "cd docker && docker compose logs -f"
  },
  "devDependencies": {
    "concurrently": "^9.0.0",
    "typescript": "^5.6.0"
  },
  "engines": {
    "node": ">=20.0.0",
    "pnpm": ">=9.0.0"
  }
}
```

---

## Server `packages/server/package.json`

```json
{
  "name": "@ctw/server",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsup src/index.ts --format esm --dts",
    "start": "node dist/index.js",
    "db:generate": "drizzle-kit generate",
    "db:migrate": "drizzle-kit migrate",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "express": "^5.0.0",
    "socket.io": "^4.8.0",
    "drizzle-orm": "^0.38.0",
    "better-sqlite3": "^11.7.0",
    "jsonwebtoken": "^9.0.0",
    "cookie-parser": "^1.4.0",
    "cors": "^2.8.0",
    "helmet": "^8.0.0",
    "morgan": "^1.10.0",
    "nanoid": "^5.0.0",
    "zod": "^3.24.0",
    "date-fns": "^4.1.0",
    "slug": "^10.0.0"
  },
  "devDependencies": {
    "@types/express": "^5.0.0",
    "@types/better-sqlite3": "^7.6.0",
    "@types/cookie-parser": "^1.4.0",
    "@types/cors": "^2.8.0",
    "@types/jsonwebtoken": "^9.0.0",
    "@types/morgan": "^1.9.0",
    "drizzle-kit": "^0.30.0",
    "tsx": "^4.19.0",
    "tsup": "^8.3.0",
    "vitest": "^2.1.0"
  }
}
```

### Server Dependencies Explained

| Package | Purpose | Tại sao |
|---------|---------|---------|
| `express@5` | HTTP server + API routes | Mature, stable, Express 5 có async error handling |
| `socket.io` | WebSocket server | Bidirectional real-time (agent stream + user input) |
| `drizzle-orm` + `better-sqlite3` | Database ORM | Type-safe queries, lightweight, no external DB service |
| `jsonwebtoken` | JWT cho session cookies | Stateless auth tokens |
| `cookie-parser` | Parse session cookies | Express middleware |
| `cors` | CORS headers | Vite dev server chạy port khác |
| `helmet` | Security headers | Production hardening |
| `morgan` | HTTP request logging | Debug + audit |
| `nanoid` | Generate short unique IDs | Cho captures, notifications |
| `zod` | Request validation | Type-safe API input validation |
| `date-fns` | Date utilities | Format timestamps |
| `slug` | URL-safe slugify | Epic branch names |

---

## Client `packages/client/package.json`

```json
{
  "name": "@ctw/client",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "react-router-dom": "^7.1.0",
    "socket.io-client": "^4.8.0",
    "@tanstack/react-query": "^5.62.0",
    "zustand": "^5.0.0",

    "@dnd-kit/core": "^6.3.0",
    "@dnd-kit/sortable": "^10.0.0",
    "@dnd-kit/utilities": "^3.2.0",

    "@xyflow/react": "^12.4.0",
    "@dagrejs/dagre": "^1.1.0",

    "react-diff-viewer-continued": "^4.0.0",

    "lucide-react": "^0.469.0",
    "date-fns": "^4.1.0",
    "clsx": "^2.1.0",
    "tailwind-merge": "^2.6.0",

    "@radix-ui/react-avatar": "^1.1.0",
    "@radix-ui/react-dialog": "^1.1.0",
    "@radix-ui/react-dropdown-menu": "^2.1.0",
    "@radix-ui/react-scroll-area": "^1.2.0",
    "@radix-ui/react-select": "^2.1.0",
    "@radix-ui/react-separator": "^1.1.0",
    "@radix-ui/react-slot": "^1.1.0",
    "@radix-ui/react-tabs": "^1.1.0",
    "@radix-ui/react-toast": "^1.2.0",
    "@radix-ui/react-tooltip": "^1.1.0",
    "class-variance-authority": "^0.7.0",
    "sonner": "^1.7.0"
  },
  "devDependencies": {
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "@vitejs/plugin-react": "^4.3.0",
    "autoprefixer": "^10.4.0",
    "postcss": "^8.4.0",
    "tailwindcss": "^4.0.0",
    "vite": "^6.0.0"
  }
}
```

### Client Dependencies Explained

| Package | Purpose |
|---------|---------|
| **Core** | |
| `react@19` + `react-dom` | UI framework |
| `react-router-dom@7` | Client-side routing |
| `socket.io-client` | WebSocket client (match server) |
| `@tanstack/react-query` | Server state management + caching |
| `zustand` | Local client state (UI state, selections) |
| **Kanban** | |
| `@dnd-kit/*` | Drag-and-drop cho Epic cards |
| **Graph** | |
| `@xyflow/react` | Interactive dependency DAG |
| `@dagrejs/dagre` | Auto-layout algorithm cho DAG |
| **Review** | |
| `react-diff-viewer-continued` | Git diff rendering trong PR review |
| **UI** | |
| `@radix-ui/*` | Headless UI primitives (shadcn/ui base) |
| `class-variance-authority` | Variant-based component styling |
| `lucide-react` | Icons |
| `sonner` | Toast notifications |
| `clsx` + `tailwind-merge` | className utilities |
| `date-fns` | Date formatting |

---

## Shared TypeScript Config

### `tsconfig.base.json`

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  }
}
```

---

## External CLI Dependencies (Host)

Không qua npm. Phải cài sẵn trên host.

| Tool | Binary Path | Version Check |
|------|------------|---------------|
| `claude` | `~/.local/bin/claude` | `claude --version` |
| `br` | `/opt/homebrew/bin/br` hoặc `~/.local/bin/br` | `br --version` |
| `bv` | `/opt/homebrew/bin/bv` hoặc `~/.local/bin/bv` | `bv --version` |
| `cass` | `~/.local/bin/cass` | `cass --version` |
| `gh` | `/opt/homebrew/bin/gh` | `gh --version` |
| `git` | `/usr/bin/git` | `git --version` |

### Health Check on Startup

Server verify tất cả CLI tools có sẵn khi start:

```typescript
async function verifyCliTools(): Promise<void> {
  const tools = ['claude', 'br', 'bv', 'cass', 'gh', 'git']
  const missing: string[] = []

  for (const tool of tools) {
    try {
      await execFile('which', [tool])
    } catch {
      missing.push(tool)
    }
  }

  if (missing.length > 0) {
    console.error(`Missing CLI tools: ${missing.join(', ')}`)
    console.error('Install them before starting the workspace.')
    process.exit(1)
  }

  // Also verify Docker services
  try {
    await fetch(config.agentMailUrl)
  } catch {
    console.warn('⚠ Agent Mail not reachable. Multi-agent coordination disabled.')
  }

  try {
    await fetch(`${config.cmUrl}/health`)
  } catch {
    console.warn('⚠ CM Memory not reachable. Team rules disabled.')
  }
}
```

---

## Vite Config

### `packages/client/vite.config.ts`

```typescript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
      '/socket.io': {
        target: 'http://localhost:3000',
        ws: true,
      },
    },
  },
  build: {
    outDir: '../../dist/client',
    emptyOutDir: true,
  },
})
```

---

## Drizzle Config

### `packages/server/drizzle.config.ts`

```typescript
import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './drizzle/migrations',
  dialect: 'sqlite',
  dbCredentials: {
    url: process.env.DATABASE_PATH || './data/workspace.db',
  },
})
```
