# 渲染引擎设计

本文档描述当前基于阶段的渲染架构，以及它如何支持 Agent 驱动的 UI 操作。

## 1. 设计目标

- 保持布局确定性，由阶段固定。
- 暴露机器可读的 UI 状态（`UISpec`）供 Agent 感知。
- 通过纯工具函数实现可控 UI 变换。
- 保持用户渲染逻辑与 Agent 决策逻辑分离。

## 2. 高层架构

```text
                         外部 Agent（可选）
                                  |
                             Tool 调用 / 说明
                                  |
Backend API -> ChatPage Loader -> UISpec 生成 -> Tool Handler -> Modifier 函数
                                                      |                    |
                                                      v                    v
                                                   UISpec ------------> Stage Renderer -> DOM
```

## 3. 阶段模型

流程固定为：

1. `movie`
2. `theater`
3. `date`
4. `time`
5. `seat`
6. `ticket`
7. `confirm`

渲染器由 `spec.stage` 选择；Agent 不生成任意布局。

## 4. UISpec 契约

`UISpec` 是 UI 与 Agent 共用的规范状态表示。

主要字段：
- `stage`, `title`, `description`
- `items`（源数据）
- `visibleItems`（显示派生数据）
- `state`（选择、数量、booking context）
- `modification`（filter/sort/highlight/augment）
- `display`（valueField + 组件类型）
- `meta`

来源：`apps/frontend/src/spec/types.ts`

## 5. 数据派生规则

`visibleItems` 由以下输入计算：
- 原始 `items`
- 当前 `modification`
- `display.valueField`

计算顺序：
1. Filter
2. Sort
3. Augment 文本替换
4. Disabled 标记推导

来源：`apps/frontend/src/spec/modifiers.ts`（`computeVisibleItems`, `refreshSpec`）

## 6. 工具执行管线

### 6.1 工具定义
工具 schema 定义在：
- `apps/frontend/src/agent/tools.ts`

### 6.2 工具分发
运行时分发实现在：
- `apps/frontend/src/hooks/useToolHandler.ts`

行为：
- 参数校验（如 augment 结构、quantity 约束）
- 应用确定性状态更新
- 对 `next` / `prev` 调用阶段导航
- 支持 `postMessage`（将 Agent 说明写入聊天）
- 同时更新 chat store 与 devtools context
- 对会变更状态的工具返回即时 `UISpec`

## 7. 渲染管线

阶段渲染栈：
- 编排：`apps/frontend/src/pages/ChatPage.tsx`
- 阶段渲染器：`apps/frontend/src/renderer/StageRenderer.tsx`
- 阶段组件：`apps/frontend/src/renderer/stages/*`

渲染器消费 `UISpec` 与回调（`onSelect`, `onToggle`, `onNext`, `onBack` 等）。

## 8. Agent 交互边界

当前实现使用 devtools context bridge：
- 通过 context 暴露 `uiSpec` 和工具调用入口
- `backendData` 仅用于调试，不对外

对于外部 Agent MVP：
- 暴露 `uiSpec`, `messageHistory`, `toolSchema`
- 不暴露 `backendData`
- 外部动作走同一工具管线
- 用户输入以 `user.message` 转发给 Agent
- 将 `state.updated` 作为权威同步信号
- 将 `tool.result` 用作执行确认（可选携带即时 `uiSpec`）

协议参考：
- `./external-agent-protocol.md`

## 9. 同步与稳定性说明

- `state.updated` 是外部状态推送的基准。
- `tool.result` 用于执行确认和可选快速状态返回。
- 重连或视图陈旧时用 `snapshot.get` / `snapshot.state` 显式重同步。
- `useAgentBridge` 仅关闭当前 effect 所属 websocket，减少 React 开发态 StrictMode 竞争影响。
- session-id 不一致或同一 session 多 host 会导致超时/不同步。

## 10. 该设计适配 MVP 的原因

- 确定性行为提高可复现实验性
- 阶段锁定 UI 降低失败面
- 工具级协议事件便于研究分析
- 架构可扩展到后续生产控制（锁、权限范围、多 session 路由）
