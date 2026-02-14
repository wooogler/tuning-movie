# 外部 Agent 协议（MVP v0.2）

状态：研究原型的规范协议。

本文档定义外部 Agent 服务如何连接 host UI 系统，并与电影订票流程交互。

## 1. 原型范围

### 范围内
- 单参与者会话。
- 外部 Agent 可读取：
  - `uiSpec`
  - `messageHistory`
  - `toolSchema`
- 外部 Agent 可执行：
  - `tool.call`
  - `agent.message`（仅展示/记录）
- Host 将用户输入通过 `user.message` 转发给外部 Agent。
- 会话结束时 Host 写日志并重置状态。

### 范围外
- 多用户并发控制
- 修订锁
- 代码编辑
- 直接访问后端原始数据（`backendData`）

## 2. 传输

- 单一 WebSocket 连接
- 端点：`/agent/ws`
- 全部报文为 JSON envelope

## 3. Envelope

```json
{
  "v": "mvp-0.2",
  "type": "tool.call",
  "id": "req-003",
  "payload": {}
}
```

字段说明：
- `v`（string）：协议版本，固定 `mvp-0.2`
- `type`（string）：消息类型
- `id`（string，可选）：发送方请求 id
- `replyTo`（string，可选）：响应对应的请求 id
- `payload`（object）：类型对应的内容

## 4. 消息类型

### 4.0 连接握手

Host（frontend）与外部 Agent 都必须先加入 relay session。

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

```json
{
  "v": "mvp-0.2",
  "type": "snapshot.get",
  "id": "req-002",
  "payload": {}
}
```

#### `tool.call`

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

用于确认工具执行。
对于会立即变更状态的工具，host 可选返回即时 `uiSpec`。
外部同步仍以 `state.updated` 为准。

```json
{
  "v": "mvp-0.2",
  "type": "tool.result",
  "replyTo": "req-003",
  "payload": {
    "ok": true,
    "toolName": "select",
    "uiSpec": {}
  }
}
```

说明：
- `payload.uiSpec` 是可选字段。
- `next`、`prev`、`postMessage` 可能只返回 `ok`，不返回 `uiSpec`；应消费后续 `state.updated`。

#### `state.updated`

```json
{
  "v": "mvp-0.2",
  "type": "state.updated",
  "payload": {
    "source": "host",
    "uiSpec": {},
    "messageHistory": [],
    "toolSchema": []
  }
}
```

#### `user.message`

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

### 4.3 同步规则

- 将 `state.updated` 作为权威外部同步事件。
- 将 `tool.result` 作为执行确认（`ok` / `error`）与可选快速 `uiSpec`。
- 在重连或状态疑似陈旧时，使用 `snapshot.get` / `snapshot.state` 显式重同步。

## 5. 错误码

- `INVALID_MESSAGE`
- `SESSION_NOT_ACTIVE`
- `UNKNOWN_TOOL`
- `INVALID_PARAMS`
- `NO_ACTIVE_SPEC`
- `TOOL_EXECUTION_FAILED`

## 6. 日志（研究要求）

按 JSONL 持久化，每行一个事件。

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

必填字段：
- `sessionId`
- `eventIndex`
- `timestamp`
- `direction`（`in` | `out` | `internal`）
- `type`
- `payload`

## 7. 实现映射

当前 host 关键位置：
- 工具 schema 定义：`apps/frontend/src/agent/tools.ts`
- 分阶段工具 schema 过滤：`apps/frontend/src/pages/ChatPage.tsx`
- 工具 schema 执行约束：`apps/frontend/src/hooks/useAgentBridge.ts`
- 工具执行入口：`apps/frontend/src/hooks/useToolHandler.ts`
- 即时工具结果 spec 返回：`apps/frontend/src/hooks/useToolHandler.ts` -> `apps/frontend/src/hooks/useAgentBridge.ts`
- React 开发态 StrictMode websocket 生命周期防护：`apps/frontend/src/hooks/useAgentBridge.ts`
- 可见状态来源（`uiSpec`）：`apps/frontend/src/components/DevToolsContext.tsx`
- 聊天状态来源（`messageHistory`）：`apps/frontend/src/store/chatStore.ts`
- 用户输入来源（`user.message`）：`apps/frontend/src/components/chat/ChatInput.tsx`

MVP 中 `backendData` 不得序列化到外部快照。
