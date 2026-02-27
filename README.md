# 🎬 Tuning Movie

A Movie Ticket Booking System

## 📋 Overview

Tuning Movie is a full-stack web application for booking movie tickets.

### Key Features

- Browse movie listings
- Select theaters
- Choose showtimes
- Pick seats
- Select ticket types (Adult, Youth, Senior)
- Manage and confirm bookings

### Tech Stack

**Frontend**
- React 19
- TypeScript
- Vite
- Tailwind CSS 4
- Zustand (state management)
- React Router DOM

**Backend**
- Fastify
- TypeScript
- Drizzle ORM
- SQLite

## 🚀 Quick Start

### Prerequisites

Before you begin, ensure you have the following installed:

- [Node.js](https://nodejs.org/) 18 or higher
- npm (comes with Node.js)

### Installation and Setup

#### 1. Clone the Repository

```bash
git clone <repository-url>
cd tuning-movie
```

#### 2. Install Dependencies

```bash
npm install
```

This command will automatically install all dependencies for the root and app workspaces (frontend, backend, agent-test).

#### 3. Initialize the Database

Initialize the backend database and create sample data:

```bash
npm run dev:backend
```

The database will be created automatically on first run.
Once the server starts successfully, press `Ctrl+C` to stop it and proceed to the next step.

To add sample data:

```bash
cd apps/backend
npm run db:seed
cd ../..
```

#### 4. Configure LLM Provider

Copy and edit the root `.env` file. Set your API keys and choose which model to enable:

```bash
# OpenAI
OPENAI_API_KEY=sk-...
AGENT_OPENAI_MODEL=gpt-5.2
AGENT_ENABLE_OPENAI=true

# Gemini
GEMINI_API_KEY=...
AGENT_GEMINI_MODEL=gemini-2.5-flash
AGENT_ENABLE_GEMINI=false
```

Set one provider to `true` and the other to `false`. You can also switch models at runtime from the frontend UI when the agent is ON.

#### 5. Start Development Servers

The project uses an orchestrator that starts services in the right order (backend first, then the rest after health check passes). Logs are prefixed with service labels (`[backend]`, `[frontend]`, etc.).

| Command | Services | Use case |
|---------|----------|----------|
| `npm run dev` | backend + frontend + agent (v1) + monitor | **Default** &mdash; full stack with AI agent and monitoring dashboard |
| `npm run dev:stack:agent` | backend + frontend + agent (v1) | AI agent without monitor |
| `npm run dev:stack:agent-v2` | backend + frontend + agent (v2) + monitor | Experimental agent version |
| `npm run dev:stack:system` | backend + frontend | UI/API dev only, no agent |
| `npm run dev:stack:all` | backend + frontend + agent-test | Manual testing with test console |

You can also run any service individually:

```bash
npm run dev:backend      # Backend only
npm run dev:frontend     # Frontend only
npm run dev:agent        # Agent v1 only
npm run dev:agent-v2     # Agent v2 only
npm run dev:monitor      # Monitor dashboard only
npm run dev:agent-test   # Agent test console only
```

#### 6. Open in Browser

- Frontend: http://localhost:5173
- Backend API: http://localhost:3000
- Agent Monitor: http://localhost:5174 (when running with monitor)
- Agent Test Console: http://localhost:3400 (when running `dev:stack:all` or `dev:agent-test`)

## 📁 Project Structure

```
tuning-movie/
├── apps/
│   ├── frontend/                  # React chat-style booking UI
│   ├── backend/                   # Fastify REST API + SQLite + WebSocket relay
│   ├── tuning-agent-typescript/   # AI agent v1 (LLM planner + prompts)
│   ├── tuning-agent-v2/           # AI agent v2 (experimental fork of v1)
│   ├── agent-monitor/             # Real-time agent monitoring dashboard
│   └── agent-test/                # Manual agent test console
├── scripts/
│   ├── dev-orchestrator.mjs       # Multi-service dev runner
│   ├── run-tuning-agent-typescript.sh
│   └── run-tuning-agent-v2.sh
├── docs/                          # Project documentation
├── .env                           # Shared environment config
├── package.json                   # Monorepo root
└── README.md
```

The two agent workspaces (`tuning-agent-typescript` and `tuning-agent-v2`) are independent copies. All LLM calls, prompts, and planning logic live inside each agent's `src/llm/` and `src/core/planner.ts`. You can modify v2 freely without affecting the original.

## 🛠️ Development

### Available Scripts

**Root Level**
```bash
# Dev stacks (orchestrated)
npm run dev                      # Default: backend + frontend + agent v1 + monitor
npm run dev:stack:system         # backend + frontend only
npm run dev:stack:agent          # backend + frontend + agent v1
npm run dev:stack:agent-monitor  # backend + frontend + agent v1 + monitor
npm run dev:stack:agent-v2       # backend + frontend + agent v2
npm run dev:stack:agent-v2-monitor # backend + frontend + agent v2 + monitor
npm run dev:stack:all            # backend + frontend + agent-test

# Individual services
npm run dev:backend              # Backend only
npm run dev:frontend             # Frontend only
npm run dev:agent                # Agent v1 only
npm run dev:agent-v2             # Agent v2 only
npm run dev:monitor              # Monitor dashboard only
npm run dev:agent-test           # Agent test console only

# Build
npm run build                    # Build all workspaces
npm run build:backend
npm run build:frontend
npm run build:agent              # Build agent v1
npm run build:agent-v2           # Build agent v2
npm run build:monitor
npm run build:agent-test
```

**Backend (apps/backend)**
```bash
npm run dev              # Start dev server (hot reload)
npm run build            # Compile TypeScript
npm run start            # Start production server
npm run db:generate      # Generate Drizzle migrations
npm run db:push          # Push database schema
npm run db:seed          # Seed sample data
npm run db:studio        # Run Drizzle Studio
```

**Frontend (apps/frontend)**
```bash
npm run dev              # Start dev server
npm run build            # Production build
npm run preview          # Preview production build
npm run lint             # Run ESLint
```

### Database Management

To visually manage and inspect the database schema:

```bash
cd apps/backend
npm run db:studio
```

Drizzle Studio will automatically open in your browser.

## 🌐 API Endpoints

### Movies
- `GET /movies` - Get all movies
- `GET /movies/:id` - Get a specific movie

### Theaters
- `GET /theaters` - Get all theaters
- `GET /theaters/movie/:movieId` - Get theaters showing a specific movie
- `GET /theaters/:id` - Get a specific theater

### Showings
- `GET /showings?movieId=&theaterId=&date=` - Get showings
- `GET /showings/dates?movieId=&theaterId=` - Get available dates for showings
- `GET /showings/times?movieId=&theaterId=&date=` - Get showings for a specific movie, theater, and date
- `GET /showings/:id` - Get a specific showing

### Seats
- `GET /seats/:showingId` - Get seats for a specific showing

### Ticket Types
- `GET /ticket-types` - Get available ticket types

### Bookings
- `POST /bookings` - Create a booking
- `GET /bookings/:id` - Get a booking
- `DELETE /bookings/:id` - Cancel a booking

## 🔧 Environment Variables

### Frontend

To change the API URL for the frontend, create a `.env` file:

```bash
# apps/frontend/.env
VITE_API_URL=http://localhost:3000
VITE_AGENT_WS_URL=ws://localhost:3000/agent/ws
VITE_AGENT_SESSION_ID=default
```

Use the same session id as `apps/agent-test/.env` (`AGENT_SESSION_ID`).
For isolated runs, use a unique value (example: `sync-dev-1`) instead of `default`.

### Backend

To configure backend runtime settings:

```bash
# apps/backend/.env
PORT=3000
DATABASE_URL=tuning-movie.db
AGENT_RELAY_LOG_ENABLED=false
```

The backend loads `apps/backend/.env` automatically at startup and maps keys into `process.env`.

```bash
PORT=3000 DATABASE_URL=tuning-movie.db npm run dev:backend
```

### Agent Test Server

```bash
# apps/agent-test/.env (optional)
AGENT_TEST_PORT=3400
AGENT_RELAY_URL=ws://localhost:3000/agent/ws
AGENT_SESSION_ID=default
```

## 🚢 Server Deployment (Podman)

This repository now includes production deployment files matching your existing server pattern (`npm run dev` equivalent runtime):

- `docker-compose.yml`
- `deploy/nginx/*`
- `deploy/scripts/setup-podman.sh`
- `deploy/scripts/deploy-podman.sh`
- `DEPLOYMENT.md`

Deployed services:
- `backend` (Fastify + SQLite + main frontend)
- `agent` (`apps/tuning-agent-typescript`)
- `nginx` (public routing + `/agent-monitor/` + `/monitor-api/*`)

Note: monitor routes are localhost-only by default for security.

For full instructions, see `DEPLOYMENT.md`.

`AGENT_SESSION_ID` must match frontend `VITE_AGENT_SESSION_ID`.

## 🤖 External Agent (Study MVP)

The prototype supports an external agent server through a WebSocket protocol.

- Transport: single WebSocket endpoint (`/agent/ws`)
- Read scope: `uiSpec`, `messageHistory`, `toolSchema`
- Write scope: `tool.call`, `agent.message`
- `toolSchema` is filtered by current stage/state (e.g. no `prev` at first stage)
- User chat input is forwarded to the agent via `user.message`
- Excluded from external snapshots: `backendData`
- Session end behavior: reset state (study logs are optional and off by default)

See the canonical spec: [`docs/external-agent-protocol.md`](./docs/external-agent-protocol.md)

For manual relay testing without frontend DevTool, run:

```bash
npm run dev:agent-test
```

Then open `http://localhost:3400`.

### Agent Test Console Usage (Recommended Flow)

1. Start all services:
```bash
npm run dev:all
```
2. Open frontend (`http://localhost:5173`) and agent test console (`http://localhost:3400`).
3. In frontend, wait until a stage UI is visible (movie list).
4. In agent test console, verify:
   - `Relay Connected = yes`
   - `Relay Joined = yes`
   - `UISpec = detected`
5. Run `select` from Interaction tab (for movie stage, use `itemId: "m1"` etc.).
6. Confirm `UI Spec.state.selected` appears in agent test console.

Sync behavior:
- `state.updated` is the authoritative push update for external sync.
- `tool.result` may include an immediate `uiSpec` for state-changing tools.
- For tools that do not immediately return a spec (for example `next`, `prev`, `postMessage`), rely on the next `state.updated`.

## 📚 Additional Documentation

For detailed implementation information, see the [docs](./docs/) directory:

- [Implementation Summary](./docs/implementation-summary.md)
- [Rendering Engine Design](./docs/rendering-engine-design.md)
- [External Agent Protocol (MVP)](./docs/external-agent-protocol.md)

## 🐛 Troubleshooting

### Port Already in Use

**Backend (Port 3000)**
```bash
# macOS/Linux
lsof -ti:3000 | xargs kill -9

# Windows
netstat -ano | findstr :3000
taskkill /PID <PID> /F
```

**Frontend (Port 5173)**
```bash
# macOS/Linux
lsof -ti:5173 | xargs kill -9

# Windows
netstat -ano | findstr :5173
taskkill /PID <PID> /F
```

### External Agent Timeout / Desync

If agent-test shows `Request timeout (tool.call, id=...)`:

1. Ensure only one backend/frontend/agent-test set is running.
2. Ensure only one active frontend tab is connected to `/agent/ws`.
3. Verify session ids match:
   - `apps/frontend/.env` -> `VITE_AGENT_SESSION_ID`
   - `apps/agent-test/.env` -> `AGENT_SESSION_ID`
4. Check relay status in agent-test (`connected`, `joined`, `hasSnapshot`).
5. Enable relay logs for diagnosis:
```bash
# apps/backend/.env
AGENT_RELAY_LOG_ENABLED=true
```
Then inspect:
```bash
tail -n 120 logs/study/<sessionId>.jsonl
```

### Reset Database

To completely reset the database:

```bash
cd apps/backend
rm -rf drizzle
rm tuning-movie.db
npm run db:push
npm run db:seed
```

## 📄 License

ISC

## 🤝 Contributing

Contributions are always welcome! Please feel free to submit issues or pull requests.
