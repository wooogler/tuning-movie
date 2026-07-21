# 实现摘要

本文档是当前基于 React 的、可由 Agent 操作的电影订票 UI 实现快照。

外部服务集成细节请参见 `./external-agent-protocol.md`。

## 1. 系统目标

系统目标是：Agent 通过确定性工具操作 UI，同时用户可见布局仍由固定阶段驱动。

核心思路：

```text
Backend API -> 阶段数据加载 -> UISpec 生成 -> Modifier 函数 -> 阶段渲染器 -> DOM
                                  ^                                  |
                                  |----------------------------------|
                                      Agent 读取 UISpec 并调用工具
```

## 2. 前端架构

主要目录：

```text
apps/frontend/src/
  agent/        工具定义（schema）
  hooks/        工具分发与 relay bridge
  spec/         UISpec 类型、生成器、修改器
  renderer/     阶段渲染器与阶段组件
  pages/        ChatPage 编排与阶段切换
  store/        聊天/消息状态（Zustand）
  components/   DevTools 上下文与面板
```

## 3. UISpec 模型

`UISpec` 是面向 Agent 的状态对象。

关键字段：
- `stage`：当前阶段（`movie`, `theater`, `date`, `time`, `seat`, `ticket`, `confirm`）
- `items`：源数据
- `visibleItems`：派生显示列表
- `state`：已选项、数量、订票上下文
- `modification`：filter/sort/highlight/augment 状态
- `display`：渲染提示（`valueField`、组件类型）
- `meta`：阶段特定元数据

来源：`apps/frontend/src/spec/types.ts`

## 4. 确定性工具应用

所有工具效果都通过纯函数完成。

示例：
- `applyFilter`, `applySort`, `applyHighlight`, `applyAugment`
- `selectItem`, `toggleItem`, `setQuantity`, `clearModification`

来源：`apps/frontend/src/spec/modifiers.ts`

重要行为：
- `visibleItems` 由 `items + modification` 重新计算
- 选择逻辑会忽略禁用项
- 数量更新会校验（`整数且 >= 0`）

## 5. 工具面

工具分为两类：

- 修改类工具：变换当前阶段显示数据
  - `filter`, `sort`, `highlight`, `augment`, `clearModification`
- 交互类工具：驱动阶段流转
  - `select`, `setQuantity`, `next`, `prev`, `postMessage`

来源：`apps/frontend/src/agent/tools.ts`

## 6. 运行时工具分发

`useToolHandler` 是工具调用执行入口：

- 校验工具参数
- 调用 spec 修改函数或导航处理器
- 更新 store/context 中的 active spec
- 对会改变状态的工具返回即时 `UISpec`（`select`、`setQuantity`、修改类工具）
- 对不直接返回 spec 的动作返回 `null`（`next`、`prev`、`postMessage`）

来源：`apps/frontend/src/hooks/useToolHandler.ts`

## 7. 阶段编排

`ChatPage` 负责：
- 每个阶段的数据请求
- 每个阶段的 spec 生成
- 阶段间 booking context 投影
- next/back/confirm 流转

来源：`apps/frontend/src/pages/ChatPage.tsx`

## 8. DevTools Bridge 与同步规则

`useAgentBridge` 负责外部 relay 消息与同步。

Bridge 行为：
- `snapshot.get` 返回完整允许读取面：`uiSpec`、`messageHistory`、`toolSchema`
- `tool.call` 返回 `tool.result`，可选携带即时 `uiSpec`
- `state.updated` 是外部同步的权威事件
- 对 `next`、`prev`、`postMessage`，消费者应依赖后续 `state.updated`
- websocket 清理仅关闭当前 effect 创建的连接，降低开发态 StrictMode 的竞争影响

来源：`apps/frontend/src/hooks/useAgentBridge.ts`

## 9. 外部 Agent MVP 协议边界

规范文档：`./external-agent-protocol.md`

MVP 原则：
- 单一 WebSocket 通道
- 无并发/修订锁
- 外部只读：`uiSpec`、`messageHistory`、`toolSchema`
- `toolSchema` 按阶段生成，并在 host 侧执行时强制
- 外部可写：`tool.call` 与 `agent.message`
- host 将用户输入通过 `user.message` 转发给外部 agent
- session 结束触发日志落盘与状态重置

## 10. 已知约束

- 流程由阶段驱动，且刻意受限。
- 工具调用是确定性的，但后端加载是异步的。
- 原型优先保证研究稳定性，而非多用户生产能力。
- session-id 不一致，或同一 session 中有多个 frontend host，会导致超时/不同步。
