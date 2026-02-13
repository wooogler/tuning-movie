# External Agent Protocol (MVP v0.2)

Status: Canonical specification for the study prototype.

This document defines how an external agent server connects to the host UI system and interacts with the movie-booking workflow.

## 1. Prototype Scope

### In scope
- Single participant session at a time.
- External agent can read:
  - `uiSpec`
  - `messageHistory`
  - `toolSchema`
- External agent can perform:
  - `tool.call`
  - `agent.message` (display/log only)
- External agent receives participant input through `user.message`.
- Host saves session logs, then resets state when the session ends.

### Out of scope
- Multi-user concurrency control.
- Revision locking.
- Code editing.
- Direct access to backend raw payloads (`backendData`).

## 2. Transport

- One WebSocket connection.
- Endpoint: `/agent/ws`.
- All packets are JSON with a common envelope.

## 3. Envelope

```json
{
  "v": "mvp-0.2",
  "type": "tool.call",
  "id": "req-003",
  "payload": {}
}
```

Fields:
- `v` (string): protocol version, always `mvp-0.2`.
- `type` (string): message type.
- `id` (string, optional): request identifier from sender.
- `replyTo` (string, optional): request id being answered.
- `payload` (object): type-specific body.

## 4. Message Types

### 4.0 Connection Handshake

Both host (frontend) and external agent must join a relay session first.

#### `relay.join`

```json
{
  "v": "mvp-0.2",
  "type": "relay.join",
  "id": "join-001",
  "payload": {
    "role": "agent",
    "sessionId": "default"
  }
}
```

#### `relay.joined`

```json
{
  "v": "mvp-0.2",
  "type": "relay.joined",
  "replyTo": "join-001",
  "payload": {
    "role": "agent",
    "sessionId": "default"
  }
}
```

### 4.1 Client -> Host

#### `session.start`
Starts a study session.

```json
{
  "v": "mvp-0.2",
  "type": "session.start",
  "id": "req-001",
  "payload": {
    "studyId": "pilot-01",
    "participantId": "P07"
  }
}
```

#### `snapshot.get`
Requests the current visible state.

```json
{
  "v": "mvp-0.2",
  "type": "snapshot.get",
  "id": "req-002",
  "payload": {}
}
```

#### `tool.call`
Executes one UI tool. `reason` is required.

```json
{
  "v": "mvp-0.2",
  "type": "tool.call",
  "id": "req-003",
  "payload": {
    "toolName": "select",
    "params": { "itemId": "m1" },
    "reason": "Pick the first available movie option to continue the flow."
  }
}
```

#### `agent.message`
Posts an agent-visible explanation to the host chat timeline. This is not a tool call.

```json
{
  "v": "mvp-0.2",
  "type": "agent.message",
  "id": "req-004",
  "payload": {
    "text": "I will choose a date next to narrow available showtimes."
  }
}
```

#### `session.end`
Ends the session, flushes logs, resets UI state.

```json
{
  "v": "mvp-0.2",
  "type": "session.end",
  "id": "req-999",
  "payload": {
    "reason": "study-complete"
  }
}
```

### 4.2 Host -> Client

#### `session.started`

```json
{
  "v": "mvp-0.2",
  "type": "session.started",
  "replyTo": "req-001",
  "payload": {
    "sessionId": "s-20260213-001"
  }
}
```

#### `snapshot.state`
Contains only allowed read surfaces.

```json
{
  "v": "mvp-0.2",
  "type": "snapshot.state",
  "replyTo": "req-002",
  "payload": {
    "sessionId": "s-20260213-001",
    "uiSpec": {},
    "messageHistory": [],
    "toolSchema": []
  }
}
```

#### `tool.result`

```json
{
  "v": "mvp-0.2",
  "type": "tool.result",
  "replyTo": "req-003",
  "payload": {
    "ok": true,
    "toolName": "select",
    "uiSpec": {},
    "messageHistory": []
  }
}
```

#### `state.updated`
Push event when the host state changes (user action, stage load, tool application).

```json
{
  "v": "mvp-0.2",
  "type": "state.updated",
  "payload": {
    "source": "user",
    "uiSpec": {},
    "messageHistory": []
  }
}
```

#### `user.message`
Forwarded user text input from the host chat input to the external agent.

```json
{
  "v": "mvp-0.2",
  "type": "user.message",
  "payload": {
    "text": "I prefer evening showtimes.",
    "stage": "time"
  }
}
```

#### `session.ended`

```json
{
  "v": "mvp-0.2",
  "type": "session.ended",
  "replyTo": "req-999",
  "payload": {
    "sessionId": "s-20260213-001",
    "logFile": "logs/study/s-20260213-001.jsonl",
    "stateReset": true
  }
}
```

#### `error`

```json
{
  "v": "mvp-0.2",
  "type": "error",
  "replyTo": "req-003",
  "payload": {
    "code": "INVALID_PARAMS",
    "message": "setQuantity requires quantity >= 0"
  }
}
```

## 5. Error Codes

- `INVALID_MESSAGE`
- `SESSION_NOT_ACTIVE`
- `UNKNOWN_TOOL`
- `INVALID_PARAMS`
- `NO_ACTIVE_SPEC`
- `TOOL_EXECUTION_FAILED`

## 6. Logging (Study Requirement)

Persist as JSONL; one event per line.

```json
{
  "sessionId": "s-20260213-001",
  "eventIndex": 12,
  "timestamp": "2026-02-13T10:22:17.123Z",
  "direction": "in",
  "type": "tool.call",
  "payload": {
    "toolName": "select",
    "params": { "itemId": "m1" },
    "reason": "Pick the first available movie option to continue the flow."
  }
}
```

Required fields:
- `sessionId`
- `eventIndex`
- `timestamp`
- `direction` (`in` | `out` | `internal`)
- `type`
- `payload`

## 7. Implementation Mapping

Current host integration points:
- Tool schema source: `apps/frontend/src/agent/tools.ts`
- Tool execution entry: `apps/frontend/src/hooks/useToolHandler.ts`
- Visible state source (`uiSpec`): `apps/frontend/src/components/DevToolsContext.tsx`
- Chat state source (`messageHistory`): `apps/frontend/src/store/chatStore.ts`
- User input source (`user.message`): `apps/frontend/src/components/chat/ChatInput.tsx`

`backendData` from the devtools context must not be serialized to external snapshots in this MVP.
