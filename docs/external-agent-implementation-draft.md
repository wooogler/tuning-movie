# External Agent Implementation Draft (MVP v0.2)

Status: Draft for building an external agent runtime that follows `docs/external-agent-protocol.md`.

This draft describes an implementation blueprint for the architecture:

1. Context Perception
2. Action Planning
3. Action
4. Memory

It keeps the current protocol surface unchanged (`mvp-0.2`) and focuses on internal orchestration.

## 1. Goals and Boundaries

### Goals
- Build a reliable single-session external agent for the movie-booking workflow.
- Execute protocol actions safely: `session.start`, `snapshot.get`, `tool.call`, `agent.message`, `session.end`.
- Make each step explainable via explicit plan/action records.

### Non-goals (for this draft)
- Multi-session concurrency.
- Backend raw data usage outside exposed snapshot surfaces.
- Autonomous code changes in host app.

## 2. Component Model

### 2.1 Context Perception
Inputs:
- `snapshot.state`
- `state.updated`
- `user.message`

Responsibilities:
- Normalize host payloads into a stable internal view.
- Detect current stage and available tools from `toolSchema`.
- Extract user intent signals from the latest messages.

Output:
- `PerceivedContext` object (used by planner).

### 2.2 Action Planning
Inputs:
- `PerceivedContext`
- Memory summaries (recent actions, prior failures, active plan)

Responsibilities:
- Build/refresh `NavigationPlan`.
- Pick one immediate `ActionIntent` (MVP: one action at a time).
- Attach mandatory `reason` for `tool.call`.

Output:
- `PlannedAction` (`tool.call` or `agent.message` or `snapshot.get`).

### 2.3 Action
Inputs:
- `PlannedAction`

Responsibilities:
- Send protocol message to host.
- Wait for `tool.result` or `error`.
- Verify resulting state using `state.updated` (or explicit `snapshot.get` resync).

Output:
- `ActionOutcome` (`success`, `failed`, `replan-required`).

### 2.4 Memory
Responsibilities:
- Store conversation timeline summary.
- Store plan lineage (which plan produced which action).
- Store action history with result/error code.
- Store recent UI states for drift detection.

Memory layers:
- `WorkingMemory`: current session state and active plan.
- `EpisodicMemory`: append-only action/result log.
- `SemanticMemory` (optional in MVP): reusable heuristics (for example, fallback strategies per stage).

## 3. Protocol-to-Component Mapping

| Protocol message | Consumed by | Produced by | Purpose |
|---|---|---|---|
| `relay.joined` | Runtime | Runtime | Connection readiness |
| `session.started` | Runtime/Memory | Runtime | Session activation |
| `snapshot.state` | Perception/Memory | Runtime (`snapshot.get`) | Full resync |
| `state.updated` | Perception/Memory | Host | Canonical state change stream |
| `user.message` | Perception/Memory | Host | User intent update |
| `tool.result` | Action/Memory | Runtime (`tool.call`) | Execution acknowledgment |
| `error` | Action/Memory | Runtime | Failure classification |
| `session.ended` | Runtime/Memory | Runtime (`session.end`) | Finalization |

Rule:
- Treat `state.updated` as canonical UI truth.
- Use `snapshot.get` only as explicit recovery or initial sync.

## 4. Runtime State Model

```ts
type AgentPhase =
  | 'DISCONNECTED'
  | 'CONNECTED'
  | 'JOINED'
  | 'SESSION_ACTIVE'
  | 'WAITING_RESULT'
  | 'TERMINATING';

interface PerceivedContext {
  sessionId: string | null;
  stage: string | null;
  uiSpec: unknown | null;
  toolSchema: Array<{ name: string; params: unknown }>;
  lastUserMessage: { text: string; stage?: string } | null;
  messageHistoryTail: unknown[];
}

interface PlannedAction {
  type: 'tool.call' | 'agent.message' | 'snapshot.get' | 'session.end';
  reason: string;
  payload: Record<string, unknown>;
}

interface ActionOutcome {
  ok: boolean;
  code?: string;
  replan: boolean;
}
```

## 5. Main Control Loop

```text
on connect:
  send relay.join
  send session.start
  send snapshot.get

on snapshot.state or state.updated or user.message:
  context = perceive(event, memory)
  action = plan(context, memory)
  execute(action)

execute(action):
  send envelope(action)
  if action.type == tool.call:
    wait for tool.result or error
    if timeout/error: classify + replan
    else wait for next state.updated (bounded timeout)
    verify post-state and update memory
```

MVP scheduling policy:
- Single-flight actions only (no parallel `tool.call`).
- New planning is blocked while `WAITING_RESULT`.
- If no `state.updated` after successful `tool.result`, issue `snapshot.get`.

## 6. Planning Contract (Internal)

Planner output contract:

```ts
interface NavigationPlan {
  goal: string;
  currentStage: string | null;
  remainingSteps: string[];
  nextAction: PlannedAction;
  confidence: number; // 0.0 - 1.0
}
```

Planner constraints:
- Always choose from currently exposed `toolSchema`.
- `tool.call.payload.reason` is mandatory and concrete.
- Prefer minimal-progress actions (one reversible step at a time).
- If ambiguity is high, emit `agent.message` to ask/announce intent before acting.

## 7. Failure Handling and Recovery

### Error classification
- Protocol-level: `INVALID_MESSAGE`, `SESSION_NOT_ACTIVE`
- Tool-level: `UNKNOWN_TOOL`, `INVALID_PARAMS`, `TOOL_EXECUTION_FAILED`
- Runtime-level (agent internal): `TIMEOUT_RESULT`, `TIMEOUT_STATE_UPDATE`, `DESYNC_DETECTED`

### Recovery policy
1. `UNKNOWN_TOOL`: refresh with `snapshot.get`, rebuild plan from new `toolSchema`.
2. `INVALID_PARAMS`: adjust params once, retry once, then replan.
3. `TIMEOUT_STATE_UPDATE`: call `snapshot.get` and continue.
4. Repeated failures (>= 3 on same stage): send `agent.message` with blocking reason and stop autonomous actions.

## 8. Recommended Module Layout

```text
apps/agent-test/src/
  runtime/
    relayClient.ts        # ws, request/reply correlation, timeout
    eventBus.ts           # inbound event routing
  core/
    perception.ts         # snapshot/state/user message normalization
    planner.ts            # navigation + next action selection
    executor.ts           # tool.call / agent.message dispatch
    verifier.ts           # post-action state checks
    memory.ts             # working + episodic stores
  policies/
    retryPolicy.ts
    safetyPolicy.ts
  index.ts
```

## 9. Phased Implementation Plan

### Phase 1: Deterministic baseline
- Rule-based planner per stage.
- Basic retries and `snapshot.get` recovery.
- JSONL event log aligned with protocol doc.

### Phase 2: Policy hardening
- Safety checks before each action.
- Failure bucketing and stop conditions.
- Better verification (expected vs observed stage transitions).

### Phase 3: Smarter planning
- LLM-assisted action proposal under strict schema validation.
- Memory-driven adaptation from prior failure patterns.

## 10. Acceptance Criteria (MVP)

- Agent can complete an end-to-end booking flow in a single session without protocol violations.
- No `tool.call` is emitted with a tool missing from current `toolSchema`.
- Every `tool.call` contains non-empty `reason`.
- Agent recovers from transient state desync using `snapshot.get`.
- Session termination produces complete JSONL logs with required fields.
