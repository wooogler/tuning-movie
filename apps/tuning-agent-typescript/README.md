# Tuning Agent (TypeScript)

Dedicated workspace for implementing the external agent runtime.

This package is separated from `apps/agent-test`:
- `apps/agent-test`: manual relay/control panel tool
- `apps/tuning-agent-typescript`: actual agent runtime implementation

## Structure

```text
src/
  runtime/
    relayClient.ts
    eventBus.ts
  core/
    perception.ts
    planner.ts
    executor.ts
    verifier.ts
    memory.ts
  policies/
    retryPolicy.ts
    safetyPolicy.ts
  types.ts
  index.ts
```

## Run

```bash
npm run dev --workspace=apps/tuning-agent-typescript
```

or

```bash
npm run build --workspace=apps/tuning-agent-typescript
npm run start --workspace=apps/tuning-agent-typescript
```

## Environment

```bash
AGENT_RELAY_URL=ws://localhost:3000/agent/ws
AGENT_SESSION_ID=default
AGENT_STUDY_ID=pilot-01
AGENT_PARTICIPANT_ID=P01
OPENAI_API_KEY=<your_api_key>
AGENT_OPENAI_MODEL=gpt-5.2
AGENT_ENABLE_OPENAI=true
```

## Protocol

This runtime follows:
- `docs/external-agent-protocol.md`
- `docs/external-agent-implementation-draft.md`

## MVP Behavior

- Connects to relay and starts a session automatically.
- Requests snapshot and keeps planning on `snapshot.state`, `state.updated`, and `user.message`.
- Runs end-to-end flow with one action at a time:
  - `movie/theater/date/time`: select then next
  - `seat`: select at least one available seat then next
  - `ticket`: set quantity to match selected seat count then next
  - `confirm`: next (submit), then `session.end` after confirmation message
- Uses OpenAI Responses API (`/v1/responses`) for item selection when available; otherwise falls back to deterministic rules.
