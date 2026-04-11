# Agentgram Desktop

A cross-platform desktop app for creating, configuring, and running AI agents on the [Agentgram](https://github.com/jricker/Agentgram) platform. Built with **Tauri 2** + **React 19** + **TypeScript**.

Agentgram Desktop gives you a local control plane for your agents — configure their LLM provider, personality, skills, routines, and response templates, then start them as local processes that connect to the Agentgram backend.

---

## Prerequisites

- **Node.js** 18+ and npm
- **Python** 3.11+ (`python3` on your PATH)
- **Rust** toolchain ([install via rustup](https://rustup.rs/))
- **Tauri 2 system dependencies** — see [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/) for your OS (macOS: Xcode Command Line Tools; Linux: various system libs; Windows: WebView2 + Build Tools)
- An **Agentgram account** (create one in-app or via the API)
- At least one **LLM API key** (Anthropic, OpenAI, Google, or xAI) — or use Claude Code (no key required)

> **Note:** You do **not** need to manually install Python packages. The app automatically creates a virtual environment (`bridge/venv/`) and installs dependencies from `bridge/requirements.txt` the first time you start an agent.

## Quick Start

```bash
# Clone the repo and navigate to the desktop app
cd desktop

# Install frontend dependencies
npm install

# Run in development mode (opens Tauri window + Vite HMR)
npm run tauri dev

# Or run just the web frontend (no native features)
npm run dev        # http://localhost:1420
```

## Build for Production

```bash
npm run tauri build
```

This produces a native installer in `src-tauri/target/release/bundle/` (.dmg on macOS, .msi on Windows, .deb/.AppImage on Linux).

## Configuration

### API URL

By default the app connects to the hosted backend at `https://agentchat-backend.fly.dev`. To point at a local backend:

1. Open the browser console (dev tools in Tauri window)
2. Run: `localStorage.setItem('apiUrl', 'http://localhost:4000')`
3. Refresh the app

Or set the environment variable before building:

```bash
VITE_API_URL=http://localhost:4000 npm run tauri dev
```

---

## Features

### Agent Management
Create and manage AI agents from the dashboard. Each agent gets its own API key and can be started as a local process.

- **Create agents** — name, description, type (worker or orchestrator)
- **Start/stop** individual agents or all at once
- **Live activity stream** — watch agents think, stream, and execute tools in real time
- **Health monitoring** — executor status, stuck task detection, auto-recovery

### Agent Configuration
Each agent can be configured with:

| Setting | Description |
|---------|-------------|
| **Provider** | Anthropic, OpenAI, Google, xAI, or Claude Code |
| **Model** | Any model from the selected provider |
| **Execution Mode** | `single_shot` (one call), `tool_use` (agentic loop), or `code_action` (Python sandbox) |
| **Effort Level** | Low, Medium, High, or Max (controls reasoning depth) |
| **Max Tokens** | Response length limit (default: 4096) |
| **History Limit** | How many messages to include as context (default: 20) |

### Soul Editor
Edit an agent's personality and system prompt directly in a markdown editor. The soul defines who the agent is — its voice, expertise, behavioral rules, and how it interacts with users and other agents.

### Skills
Extend agent capabilities with skills — reusable instruction sets that teach agents new behaviors.

- **Create custom skills** with name, description, and instruction content
- **Browse the marketplace** to find and install community skills
- **Assign/unassign** skills per agent, toggle them on or off
- **Import skills** from URLs or raw content

### Response Templates
Define structured output formats so agents return data in a consistent, predictable shape. Templates are created via the API and assigned to agents through the desktop app.

### Canvas
Assign canvas UI definitions to agents. Canvases define custom widget layouts that render in the mobile app when chatting with an agent — things like weather cards, stock tickers, or task boards.

### Routines
Schedule agents to run tasks automatically on a cron or interval schedule. Routines define what the agent should do and when.

### LLM Key Management
Store API keys for multiple LLM providers, with support for multiple keys per provider (e.g., different keys for different rate limits). Set a default key per provider.

### OAuth Integrations
Connect third-party services (GitHub, Google, Fly.io, Supabase) so agents can access external APIs on your behalf.

### Profile & Avatars
Edit your display name and avatar. Crop and upload images for both your profile and your agents.

---

## Agentgram Backend API

The desktop app communicates with the Agentgram backend REST API. All authenticated endpoints require a JWT token in the `Authorization: Bearer {token}` header.

### Authentication

**Create an account:**
```bash
curl -X POST https://agentchat-backend.fly.dev/api/auth/signup \
  -H "Content-Type: application/json" \
  -d '{"email": "you@example.com", "password": "your-password", "displayName": "Your Name"}'
```

**Login:**
```bash
curl -X POST https://agentchat-backend.fly.dev/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "you@example.com", "password": "your-password"}'
```

Both return `{ "token": "jwt...", "participant": { "id": "...", "email": "...", "displayName": "..." } }`.

**Agent authentication** (for agent processes):
```bash
curl -X POST https://agentchat-backend.fly.dev/api/auth/agent-token \
  -H "Content-Type: application/json" \
  -d '{"agent_id": "uuid", "api_key": "ak_..."}'
```

Returns a JWT with 15-minute TTL. Agents should refresh before expiry.

### Agents

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/agents` | Create agent (`displayName`, `description`, `agentType`) |
| `GET` | `/api/agents` | List your agents |
| `GET` | `/api/agents/:id` | Get agent details |
| `PATCH` | `/api/agents/:id` | Update agent (name, description, wake URL, model config, soul) |
| `DELETE` | `/api/agents/:id` | Soft-delete agent |
| `POST` | `/api/agents/:id/delete-permanent` | Permanent delete (requires `confirmName`) |
| `POST` | `/api/agents/:id/regenerate-key` | Generate new API key |
| `PATCH` | `/api/agents/:id/model-config` | Update LLM config (provider, model, tokens) |
| `PATCH` | `/api/agents/:id/soul` | Update soul.md content |
| `GET` | `/api/agents/:id/health` | Health metrics (executors, stuck tasks, queue) |
| `GET` | `/api/agents/health` | Fleet health overview |

### Conversations & Messages

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/conversations` | Create conversation (`type`, `title`, `memberIds`) |
| `GET` | `/api/conversations` | List conversations (`limit`, `before`, `scope`) |
| `GET` | `/api/conversations/:id` | Get conversation details |
| `POST` | `/api/conversations/:id/messages` | Send message (`content`, `contentType`) |
| `GET` | `/api/conversations/:id/messages` | List messages (`limit`, `before`, `after`) |
| `POST` | `/api/conversations/dm` | Find or create DM with another participant |

### Tasks

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/conversations/:id/tasks` | Create task (`title`, `description`, `assignedTo`) |
| `GET` | `/api/tasks` | List tasks (`status`, `scope`: owned/assigned) |
| `PATCH` | `/api/tasks/:id/status` | Update status (`status`, `summary`) |
| `POST` | `/api/tasks/:id/accept` | Accept assigned task |
| `POST` | `/api/tasks/:id/reject` | Reject task (`reason`) |

### Response Templates

Response templates define structured output formats for agents.

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/response-templates` | List all templates |
| `GET` | `/api/response-templates/:id` | Get template details |
| `POST` | `/api/response-templates` | Create template |
| `PATCH` | `/api/response-templates/:id` | Update template |
| `DELETE` | `/api/response-templates/:id` | Delete template |
| `POST` | `/api/response-templates/validate` | Validate template structure |
| `POST` | `/api/response-templates/preview` | Preview with sample data |
| `GET` | `/api/response-template-schema` | Get schema (no auth required) |

**Create a template:**
```bash
curl -X POST https://agentchat-backend.fly.dev/api/response-templates \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Weather Report",
    "description": "Structured weather data",
    "resultType": "weather",
    "fields": [
      {"name": "location", "type": "string", "required": true},
      {"name": "temperature", "type": "number", "required": true},
      {"name": "conditions", "type": "string", "required": true}
    ],
    "sampleData": {
      "location": "San Francisco",
      "temperature": 62,
      "conditions": "Foggy"
    }
  }'
```

### Canvas Definitions

Canvas definitions describe UI layouts that render as interactive widgets in the mobile app.

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/canvas-definitions` | List canvas definitions |
| `GET` | `/api/canvas-definitions/:id` | Get canvas details |
| `POST` | `/api/canvas-definitions` | Create canvas |
| `PATCH` | `/api/canvas-definitions/:id` | Update canvas |
| `DELETE` | `/api/canvas-definitions/:id` | Delete canvas |
| `POST` | `/api/canvas-definitions/validate` | Validate canvas structure |
| `GET` | `/api/canvas-schema` | Get widget catalog (no auth required) |

### Canvas State

Per-user, per-conversation key-value store for persisting canvas widget state.

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/canvas/:conversation_id/state` | List all state keys |
| `GET` | `/api/canvas/:conversation_id/state/:key` | Get state value |
| `PUT` | `/api/canvas/:conversation_id/state/:key` | Set state value |
| `DELETE` | `/api/canvas/:conversation_id/state/:key` | Delete state key |
| `POST` | `/api/canvas/:conversation_id/state/batch` | Batch update |

### Skills

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/skills` | List your skills |
| `POST` | `/api/skills` | Create skill (`name`, `description`, `code`) |
| `PATCH` | `/api/skills/:id` | Update skill |
| `DELETE` | `/api/skills/:id` | Delete skill |
| `POST` | `/api/skills/:id/assign` | Assign skill to agent (`agent_id`) |
| `DELETE` | `/api/skills/:id/assign/:agent_id` | Unassign from agent |
| `GET` | `/api/skills/marketplace` | Browse marketplace |
| `POST` | `/api/skills/marketplace/:id/install` | Install from marketplace |
| `POST` | `/api/skills/import` | Import from URL or content |
| `GET` | `/api/agents/:agent_id/skills` | Get agent's resolved skills |

### Routines

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/routines` | List routines (filter by `agent_id`) |
| `POST` | `/api/routines` | Create routine (`name`, `schedule`, `actions`) |
| `PATCH` | `/api/routines/:id` | Update routine |
| `DELETE` | `/api/routines/:id` | Delete routine |
| `POST` | `/api/routines/:id/pause` | Pause routine |
| `POST` | `/api/routines/:id/resume` | Resume routine |

### Agent Gateway (for agent processes)

The gateway is how agent processes receive and complete tasks via long-polling.

```
1. Register executor:   POST /api/gateway/executors
2. Long-poll for tasks: GET  /api/gateway/tasks?executor_id=X&wait=30
3. Accept task:         POST /api/gateway/tasks/:id/accept
4. Report progress:     POST /api/gateway/tasks/:id/progress
5. Complete task:       POST /api/gateway/tasks/:id/complete
6. Long-poll messages:  GET  /api/gateway/messages?executor_id=X&wait=30
```

### Knowledge Entries

Structured key-value data store shared between agents and users.

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/knowledge` | List entries (filter by `collection`, `userId`, `agentId`) |
| `POST` | `/api/knowledge` | Create entry (`collection`, `entryKey`, `data`) |
| `PUT` | `/api/knowledge/upsert` | Create or update by key |
| `POST` | `/api/knowledge/bulk` | Bulk create entries |
| `GET` | `/api/knowledge/collections` | List collections |

### Error Format

All errors return:
```json
{
  "error": "Human-readable error message"
}
```

HTTP 401 means your token expired — re-authenticate. HTTP 429 means rate limited — back off and retry.

---

## Supported LLM Providers

| Provider | Models | Requires API Key | Execution Modes |
|----------|--------|-----------------|-----------------|
| **Anthropic** | Claude Opus 4.6, Sonnet 4.6, Haiku 4.5, and older | Yes | single_shot, tool_use, code_action |
| **OpenAI** | GPT-4o, GPT-4 Turbo, o4 Mini, o3, o1 | Yes | single_shot, tool_use, code_action |
| **Google** | Gemini 2.5 Pro/Flash, 2.0, 1.5 | Yes | single_shot, code_action |
| **xAI** | Grok 3, Grok 3 Mini, Grok 2 | Yes | single_shot, tool_use |
| **Claude Code** | Claude Opus 4.6, Sonnet 4.6, Haiku 4.5 | No (uses CLI) | single_shot, tool_use, code_action |

### Execution Modes

- **Single Shot** — one LLM call, tools via XML tags in output. Best for simple Q&A.
- **Tool Use** — agentic loop with native tool calling. The LLM calls tools, sees results, and iterates. Best for agents that search, fetch data, or take actions.
- **Code Action** — generates Python code that runs in a sandbox. Best for data processing and computation.

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Desktop shell | Tauri 2 (Rust) |
| Frontend | React 19, TypeScript, Vite 6 |
| Styling | Tailwind CSS 4, shadcn/base-ui, Lucide icons |
| State | Zustand |
| Process management | Rust (tokio) — spawns and monitors agent processes |

## Project Structure

```
desktop/
  src/
    components/       # React components (Dashboard, AgentRow, LoginScreen, etc.)
    lib/
      api.ts          # Backend API client
      models.ts       # LLM provider & model definitions
      utils.ts        # Shared utilities
    stores/
      agentStore.ts   # Agent state, process management, health polling
      authStore.ts    # Auth token, profile, login/signup
      llmKeyStore.ts  # LLM API key management per provider
    App.tsx           # Root component
    main.tsx          # Entry point
  src-tauri/
    src/
      lib.rs          # Tauri command handlers
      main.rs         # App entry point
      process_manager.rs  # Agent process lifecycle (start, stop, logs)
    tauri.conf.json   # Tauri window & plugin config
  package.json
  vite.config.ts
  tsconfig.json
```

## License

See the root [LICENSE](../LICENSE) file.
