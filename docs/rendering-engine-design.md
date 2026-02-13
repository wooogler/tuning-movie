# Rendering Engine Design

This document describes the current stage-based rendering architecture and how it supports agent-driven UI manipulation.

## 1. Design Goals

- Keep layout deterministic and fixed by stage.
- Expose a machine-readable UI state (`UISpec`) for agent perception.
- Allow controlled UI transformation through pure tool functions.
- Keep user-facing rendering separate from agent decision logic.

## 2. High-Level Architecture

```text
                         External Agent (optional)
                                  |
                             Tool Calls / Notes
                                  |
Backend API -> ChatPage Loader -> UISpec Generator -> Tool Handler -> Modifier Functions
                                                      |                    |
                                                      v                    v
                                                   UISpec ------------> Stage Renderer -> DOM
```

## 3. Stage Model

The flow is fixed:

1. `movie`
2. `theater`
3. `date`
4. `time`
5. `seat`
6. `ticket`
7. `confirm`

The renderer is selected from `spec.stage`; the agent does not generate arbitrary layouts.

## 4. UISpec Contract

`UISpec` is the canonical state representation used by both UI and agent tooling.

Main fields:
- `stage`, `title`, `description`
- `items` (source data)
- `visibleItems` (derived data for display)
- `state` (selection, quantities, booking context)
- `modification` (filter/sort/highlight/augment)
- `display` (value field + component type)
- `meta`

Source: `apps/frontend/src/spec/types.ts`

## 5. Data Derivation Rules

`visibleItems` is computed from:
- original `items`
- active `modification`
- `display.valueField`

Computation order:
1. Filter
2. Sort
3. Augment value substitution
4. Disabled flag derivation

Source: `apps/frontend/src/spec/modifiers.ts` (`computeVisibleItems`, `refreshSpec`)

## 6. Tool Execution Pipeline

### 6.1 Tool definition
Tool schema is declared in:
- `apps/frontend/src/agent/tools.ts`

### 6.2 Tool dispatch
Runtime dispatch is implemented in:
- `apps/frontend/src/hooks/useToolHandler.ts`

Behavior:
- validates params (for example, augment payload shape, quantity constraints)
- applies deterministic state updates
- invokes stage navigation handlers for `next` / `prev`
- updates active spec in both chat store and devtools context

## 7. Rendering Pipeline

Stage rendering stack:
- orchestration: `apps/frontend/src/pages/ChatPage.tsx`
- stage renderer: `apps/frontend/src/renderer/StageRenderer.tsx`
- stage components: `apps/frontend/src/renderer/stages/*`

The renderer consumes `UISpec` and callback handlers (`onSelect`, `onToggle`, `onNext`, `onBack`, etc.).

## 8. Agent Interaction Boundaries

The current implementation uses a devtools context bridge:
- `uiSpec` and tool apply callback are available via context
- `backendData` exists for debugging but is internal

For external-agent MVP:
- expose `uiSpec`, `messageHistory`, `toolSchema`
- do not expose `backendData`
- process external actions through the same tool pipeline

Protocol reference:
- `./external-agent-protocol.md`

## 9. Why This Design Works for Study MVP

- deterministic behavior improves reproducibility
- stage-locked UI reduces policy surface and failure modes
- tool-level logging makes participant-session analysis straightforward
- architecture is extensible to production controls later (locks, auth scopes, multi-session routing)
