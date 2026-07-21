# Agent Test Server

External agent test server for the study MVP.

## Features

- Connects to backend relay (`/agent/ws`) as `role=agent`
- Supports protocol actions:
  - `session.start`
  - `snapshot.get`
  - `tool.call`
  - `agent.message`
  - `session.end`
- Exposes a WebSocket remote-control panel for manual testing

## Run

```bash
npm run dev --workspace=apps/agent-test
```

or

```bash
npm run build --workspace=apps/agent-test
npm run start --workspace=apps/agent-test
```

## Environment

```bash
AGENT_TEST_PORT=3400
AGENT_RELAY_URL=ws://localhost:3000/agent/ws
AGENT_SESSION_ID=default
```

## HTTP Endpoints

- `GET /health`
- `GET /` (web remote UI)
- `GET /control/ws` (browser control websocket)

Open `http://localhost:3400` for the web panel.
