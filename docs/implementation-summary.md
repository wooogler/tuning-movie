# Implementation Summary

This document is the current implementation snapshot of the React-based, agent-operable movie booking UI.

For external server integration details, see `./external-agent-protocol.md`.

## 1. System Intent

The system is designed so an agent can operate the UI through deterministic tools, while the UI layout remains fixed by stage.

Core idea:

```text
Backend API -> Stage Data Loader -> UISpec Generator -> Modifier Functions -> Stage Renderer -> DOM
                                      ^                                        |
                                      |----------------------------------------|
                                          Agent reads UISpec and calls tools
```

## 2. Frontend Architecture

Primary frontend folders:

```text
apps/frontend/src/
  agent/        Tool definitions (schema)
  hooks/        Tool dispatcher (tool -> state update/navigation)
  spec/         UISpec types, generators, modifiers
  renderer/     Stage renderer and stage-specific UI components
  pages/        ChatPage orchestration and stage transitions
  store/        Chat/message state (Zustand)
  components/   DevTools context and UI panels
```

## 3. UISpec Model

`UISpec` is the agent-facing state object.

Key parts:
- `stage`: current step (`movie`, `theater`, `date`, `time`, `seat`, `ticket`, `confirm`)
- `items`: source data
- `visibleItems`: derived display list
- `state`: selected item(s), quantities, booking context
- `modification`: filter/sort/highlight/augment state
- `display`: renderer hints (`valueField`, component type)
- `meta`: stage-specific metadata

Source: `apps/frontend/src/spec/types.ts`

## 4. Deterministic Tool Application

All tool effects are applied through pure modifier/selection functions.

Examples:
- `applyFilter`, `applySort`, `applyHighlight`, `applyAugment`
- `selectItem`, `toggleItem`, `setQuantity`, `clearModification`

Source: `apps/frontend/src/spec/modifiers.ts`

Important behavior:
- `visibleItems` is recomputed from `items + modification`
- selection ignores disabled items
- quantity updates are validated (`integer >= 0`)

## 5. Tool Surface

Tools are split into two classes:

- Modification tools: transform data shown in the current stage
  - `filter`, `sort`, `highlight`, `augment`, `clearModification`
- Interaction tools: drive stage progress
  - `select`, `setQuantity`, `next`, `prev`, `postMessage`

Source: `apps/frontend/src/agent/tools.ts`

## 6. Runtime Tool Dispatch

`useToolHandler` is the execution entrypoint for tool calls:

- validates tool parameters
- calls spec modifier functions or navigation handlers
- updates active spec in store/context
- returns immediate `UISpec` for state-changing tools (`select`, `setQuantity`, modification tools)
- returns `null` for non-spec actions (`next`, `prev`, `postMessage`)

Source: `apps/frontend/src/hooks/useToolHandler.ts`

## 7. Stage Orchestration

`ChatPage` manages:
- backend fetch per stage
- spec generation per stage
- booking context projection between stages
- next/back/confirm transitions

Source: `apps/frontend/src/pages/ChatPage.tsx`

## 8. DevTools Bridge (Current Internal Entry)

`DevToolsContext` stores:
- `uiSpec`
- `backendData` (internal debugging only)
- `onToolApply` callback registration and invocation

Source: `apps/frontend/src/components/DevToolsContext.tsx`

In MVP external integration, only `uiSpec` is exposed to external agents; `backendData` is not exposed.

## 9. External Agent MVP Contract

Canonical spec: `./external-agent-protocol.md`

MVP principles:
- one WebSocket channel
- no concurrency/revision lock
- external reads only: `uiSpec`, `messageHistory`, `toolSchema`
- `toolSchema` is generated per stage and enforced on host-side tool execution
- external writes: `tool.call` and `agent.message`
- host forwards participant chat input to external agent via `user.message`
- session end triggers log flush + state reset
- sync baseline is `state.updated`; `tool.result` is acknowledgement plus optional immediate `uiSpec`

Bridge behavior details:
- `snapshot.get` returns full allowed surfaces (`uiSpec`, `messageHistory`, `toolSchema`)
- `tool.call` response uses the immediate returned spec (when available) to reduce stale snapshot windows
- WebSocket cleanup in `useAgentBridge` closes only the effect-owned socket to avoid dev StrictMode race side effects

## 10. Known Constraints

- The flow is stage-driven and intentionally constrained.
- Tool calls are deterministic, but backend data loading is asynchronous.
- This prototype optimizes study reliability over multi-user production concerns.
- Session-id mismatch or multiple active frontend hosts in the same session can cause external timeouts/desync.
