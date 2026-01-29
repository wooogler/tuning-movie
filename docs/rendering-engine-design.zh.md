# 渲染引擎设计

受A2UI启发的基于React的声明式UI渲染引擎设计文档。

## 1. 架构概览

当前前端使用**Backend API → React JSX**直接渲染方式。
我们将其更改为经过中间表示（IR：Intermediate Representation）的3层结构。

```
┌──────────┐      ┌──────────────┐      ┌──────────────┐      ┌────────────┐
│ Backend  │ ───> │  Converter   │ ───> │   UI Spec    │ ───> │  Renderer  │
│   API    │ JSON │ (API → Spec) │      │ (IR: JSON)   │      │ (Spec →    │
│          │      │              │      │              │      │  React)    │
└──────────┘      └──────────────┘      └──────────────┘      └────────────┘
  保持现状           新增                  中间表示值            新增
```

### 各层的职责

| 层 | 位置 | 职责 |
|--------|------|------|
| **Backend API** | `apps/backend` | 数据提供（无变化） |
| **Converter** | `apps/frontend/src/converter/` | API响应 → UI Spec 转换 |
| **UI Spec** | TypeScript类型 | 声明式中间表示（JSON结构） |
| **Renderer** | `apps/frontend/src/renderer/` | UI Spec → React组件渲染 |

### 当前 vs 变更后的数据流

**当前（直接渲染）：**
```
MovieStagePage: api.getMovies() → movies.map(m => <div>...</div>)
```

**变更后（经由IR）：**
```
MovieStagePage: api.getMovies() → convertMovieStage(movies) → <SpecRenderer spec={spec} />
```

---

## 2. UI Spec格式

采用A2UI的核心设计，但针对React进行简化。

### 2.1 设计原则

- **扁平组件列表**：像A2UI一样，使用ID引用而不是树嵌套（邻接表）
- **结构/数据/状态分离**：`components`（布局）↔ `dataModel`（服务器数据）↔ `state`（UI状态）
- **数据绑定**：使用JSON Pointer路径引用数据（`/movies/0/title`）
- **状态绑定**：使用`$state/`前缀引用UI状态（`$state/selectedMovieId`）
- **领域特定组件**：通用组件 + 电影预订专用组件

> **与A2UI的区别**：A2UI将所有数据放在一个`dataModel`中。
> 我们明确地将来自服务器的数据（`dataModel`）和来自客户端交互的状态（`state`）分离。
> 这种分离在以后单独跟踪状态变化或将其传递给外部系统时非常有用。

### 2.2 Spec类型定义

```typescript
// UI Spec的顶层结构
interface UISpec {
  surface: string;           // 屏幕标识符（例如："movie_select"）
  components: Component[];   // 扁平组件列表
  dataModel: Record<string, unknown>; // 数据
  actions?: ActionMap;       // 事件处理器映射
}

// 组件定义
interface Component {
  id: string;                // 唯一ID（root必需）
  type: string;              // 组件类型名称
  children?: string[];       // 子组件ID数组
  child?: string;            // 单个子组件（Card等）
  props?: Record<string, unknown>; // 静态属性
  data?: DataBinding;        // 数据绑定
}

// 数据绑定
type DataBinding =
  | { path: string }                    // 绝对路径："/movies/0/title"
  | { each: string; template: string }; // 迭代：each="/movies", template="movie_card_tpl"

// 操作映射
interface ActionMap {
  [actionName: string]: {
    type: 'navigate' | 'store' | 'api';
    payload: Record<string, unknown>;
  };
}
```

### 2.3 实际示例：电影选择阶段

**Backend API响应：**
```json
{
  "movies": [
    { "id": "m1", "title": "Dune: Part Two", "posterUrl": "...", "genre": ["Sci-Fi"], "duration": 166, "rating": "PG-13" },
    { "id": "m2", "title": "Oppenheimer", "posterUrl": "...", "genre": ["Drama"], "duration": 180, "rating": "R" }
  ]
}
```

**转换后的UI Spec：**
```json
{
  "surface": "movie_select",
  "components": [
    {
      "id": "root",
      "type": "Grid",
      "children": { "each": "/movies", "template": "movie_card_tpl" },
      "props": { "columns": { "sm": 2, "md": 3, "lg": 4 }, "gap": 6 }
    },
    {
      "id": "movie_card_tpl",
      "type": "MovieCard",
      "data": { "path": "." },
      "props": {
        "action": { "type": "navigate", "event": "selectMovie" }
      }
    }
  ],
  "dataModel": {
    "movies": [
      { "id": "m1", "title": "Dune: Part Two", "posterUrl": "...", "genre": ["Sci-Fi"], "duration": 166, "rating": "PG-13" },
      { "id": "m2", "title": "Oppenheimer", "posterUrl": "...", "genre": ["Drama"], "duration": 180, "rating": "R" }
    ]
  },
  "actions": {
    "selectMovie": {
      "type": "navigate",
      "payload": { "to": "/theater", "store": "movie" }
    }
  }
}
```

### 2.4 实际示例：座位选择阶段

```json
{
  "surface": "seat_select",
  "components": [
    {
      "id": "root",
      "type": "Column",
      "children": ["screen", "seat_map", "legend", "actions"],
      "props": { "align": "center", "gap": 6 }
    },
    {
      "id": "screen",
      "type": "ScreenIndicator"
    },
    {
      "id": "seat_map",
      "type": "SeatMap",
      "data": { "path": "/seats" },
      "props": {
        "action": { "type": "store", "event": "toggleSeat" }
      }
    },
    {
      "id": "legend",
      "type": "SeatLegend"
    },
    {
      "id": "actions",
      "type": "ActionBar",
      "props": {
        "back": { "to": "/time" },
        "next": { "to": "/tickets", "label": "Continue", "requires": "selectedSeats" }
      }
    }
  ],
  "dataModel": {
    "seats": [
      { "id": "s1-A1", "row": "A", "number": 1, "type": "standard", "status": "available" },
      { "id": "s1-A2", "row": "A", "number": 2, "type": "standard", "status": "occupied" }
    ],
    "selectedSeats": []
  }
}
```

---

## 3. 组件目录

### 3.1 通用布局组件

| 类型 | 描述 | 主要属性 |
|------|------|-----------|
| `Column` | 垂直布局 | `align`, `justify`, `gap` |
| `Row` | 水平布局 | `align`, `justify`, `gap` |
| `Grid` | 网格布局 | `columns`, `gap` |
| `Card` | 卡片容器 | `child`, `onClick` |
| `Text` | 文本显示 | `text`, `variant` (h1~h5, body, caption) |
| `Image` | 图像显示 | `src`, `alt`, `fit` |
| `Button` | 按钮 | `label`, `variant` (primary, secondary), `action` |
| `TextField` | 文本输入 | `label`, `value`, `placeholder` |

### 3.2 领域特定组件

| 类型 | 描述 | 绑定数据 |
|------|------|-------------|
| `MovieCard` | 海报 + 标题 + 类型 + 时长 | `Movie` |
| `TheaterCard` | 影院名称 + 位置 + 屏幕数 | `Theater` |
| `DatePicker` | 日期选择卡片网格 | `string[]` (dates) |
| `TimePicker` | 时间 + 屏幕 + 可用座位 | `Showing[]` |
| `SeatMap` | 座位布局（行/列网格） | `Seat[]` |
| `SeatLegend` | 座位类型图例 | （无，静态） |
| `ScreenIndicator` | "SCREEN"显示 | （无，静态） |
| `TicketCounter` | 票券类型 + 数量 +/- | `TicketType` |
| `BookingSummary` | 预订摘要信息 | 整个预订状态 |
| `ActionBar` | 返回/继续按钮 | `back`, `next` |
| `ConfirmForm` | 姓名 + 邮箱输入表单 | `customerName`, `customerEmail` |
| `BookingResult` | 预订完成屏幕 | `Booking` |

---

## 4. Converter层

为每个阶段编写**Backend API响应 → UI Spec**转换函数。

### 4.1 文件结构

```
apps/frontend/src/converter/
├── index.ts              # 统一导出
├── types.ts              # UISpec、Component、DataBinding类型
├── movieStage.ts         # convertMovieStage(movies) → UISpec
├── theaterStage.ts       # convertTheaterStage(theaters) → UISpec
├── dateStage.ts          # convertDateStage(dates) → UISpec
├── timeStage.ts          # convertTimeStage(showings) → UISpec
├── seatStage.ts          # convertSeatStage(seats) → UISpec
├── ticketStage.ts        # convertTicketStage(ticketTypes, selectedSeats) → UISpec
└── confirmStage.ts       # convertConfirmStage(bookingState) → UISpec
```

### 4.2 转换函数接口

```typescript
// converter/movieStage.ts
import type { Movie } from '../types';
import type { UISpec } from './types';

export function convertMovieStage(movies: Movie[]): UISpec {
  return {
    surface: 'movie_select',
    components: [
      {
        id: 'root',
        type: 'Grid',
        children: { each: '/movies', template: 'movie_card_tpl' },
        props: { columns: { sm: 2, md: 3, lg: 4 }, gap: 6 },
      },
      {
        id: 'movie_card_tpl',
        type: 'MovieCard',
        data: { path: '.' },
        props: { action: { type: 'navigate', event: 'selectMovie' } },
      },
    ],
    dataModel: { movies },
    actions: {
      selectMovie: {
        type: 'navigate',
        payload: { to: '/theater', store: 'movie' },
      },
    },
  };
}
```

---

## 5. Renderer引擎

接收UI Spec并将其渲染为React组件的引擎。

### 5.1 文件结构

```
apps/frontend/src/renderer/
├── index.ts              # <SpecRenderer /> 导出
├── SpecRenderer.tsx      # 主渲染器（spec → React tree）
├── resolveData.ts        # 数据绑定解析（JSON Pointer）
├── registry.ts           # 组件注册表
└── components/           # 渲染器用React组件
    ├── layout/
    │   ├── Column.tsx
    │   ├── Row.tsx
    │   ├── Grid.tsx
    │   └── Card.tsx
    ├── base/
    │   ├── Text.tsx
    │   ├── Image.tsx
    │   ├── Button.tsx
    │   └── TextField.tsx
    └── domain/
        ├── MovieCard.tsx
        ├── TheaterCard.tsx
        ├── DatePicker.tsx
        ├── TimePicker.tsx
        ├── SeatMap.tsx
        ├── SeatLegend.tsx
        ├── ScreenIndicator.tsx
        ├── TicketCounter.tsx
        ├── ActionBar.tsx
        ├── ConfirmForm.tsx
        └── BookingResult.tsx
```

### 5.2 核心：SpecRenderer

```typescript
// renderer/SpecRenderer.tsx
interface SpecRendererProps {
  spec: UISpec;
  onAction?: (actionName: string, data?: unknown) => void;
}

export function SpecRenderer({ spec, onAction }: SpecRendererProps) {
  const componentMap = new Map(spec.components.map(c => [c.id, c]));

  function renderComponent(id: string): ReactNode {
    const comp = componentMap.get(id);
    if (!comp) return null;

    // 解析数据绑定
    const resolvedData = comp.data
      ? resolveData(comp.data, spec.dataModel)
      : undefined;

    // 渲染子组件
    let renderedChildren: ReactNode = null;

    if (Array.isArray(comp.children)) {
      // 静态子组件：["child1", "child2"]
      renderedChildren = comp.children.map(childId => renderComponent(childId));
    } else if (comp.children && 'each' in comp.children) {
      // 迭代子组件：{ each: "/movies", template: "card_tpl" }
      const items = resolveData({ path: comp.children.each }, spec.dataModel) as unknown[];
      renderedChildren = items.map((item, i) =>
        renderComponent(comp.children.template, { ...spec.dataModel, _item: item, _index: i })
      );
    }

    // 在注册表中查找React组件
    const Component = registry.get(comp.type);
    if (!Component) {
      console.warn(`Unknown component type: ${comp.type}`);
      return null;
    }

    return (
      <Component
        key={id}
        data={resolvedData}
        onAction={onAction}
        {...comp.props}
      >
        {renderedChildren}
      </Component>
    );
  }

  return <>{renderComponent('root')}</>;
}
```

### 5.3 组件注册表

```typescript
// renderer/registry.ts
import type { ComponentType } from 'react';

const registry = new Map<string, ComponentType<any>>();

export function registerComponent(type: string, component: ComponentType<any>) {
  registry.set(type, component);
}

export function getComponent(type: string): ComponentType<any> | undefined {
  return registry.get(type);
}

// 初始注册
import { Grid } from './components/layout/Grid';
import { MovieCard } from './components/domain/MovieCard';
// ...

registerComponent('Grid', Grid);
registerComponent('MovieCard', MovieCard);
// ...
```

### 5.4 数据绑定解析

```typescript
// renderer/resolveData.ts

// JSON Pointer解析："/movies/0/title" → dataModel.movies[0].title
export function resolveData(
  binding: DataBinding,
  dataModel: Record<string, unknown>
): unknown {
  if ('path' in binding) {
    if (binding.path === '.') return dataModel;
    const segments = binding.path.replace(/^\//, '').split('/');
    let current: unknown = dataModel;
    for (const segment of segments) {
      if (current == null) return undefined;
      current = (current as Record<string, unknown>)[segment];
    }
    return current;
  }
  return undefined;
}
```

---

## 6. 变更后的Stage页面（使用示例）

```typescript
// pages/MovieStagePage.tsx（变更后）
export function MovieStagePage() {
  const navigate = useNavigate();
  const { setMovie } = useBookingStore();
  const [spec, setSpec] = useState<UISpec | null>(null);

  useEffect(() => {
    api.getMovies().then((data) => {
      setSpec(convertMovieStage(data.movies));
    });
  }, []);

  const handleAction = (action: string, data?: unknown) => {
    if (action === 'selectMovie') {
      setMovie(data as Movie);
      navigate('/theater');
    }
  };

  if (!spec) return <Layout title="Select Movie" step={1}><p>Loading...</p></Layout>;

  return (
    <Layout title="Select Movie" step={1}>
      <SpecRenderer spec={spec} onAction={handleAction} />
    </Layout>
  );
}
```

---

## 7. 实现顺序

### 阶段1：核心基础设施
1. `converter/types.ts` — UISpec、Component、DataBinding类型定义
2. `renderer/resolveData.ts` — JSON Pointer数据绑定解析
3. `renderer/registry.ts` — 组件注册表
4. `renderer/SpecRenderer.tsx` — 主渲染器

### 阶段2：通用组件
5. `Column`、`Row`、`Grid`、`Card`布局组件
6. `Text`、`Image`、`Button`、`TextField`基础组件

### 阶段3：领域组件 + Converter
7. `MovieCard` + `convertMovieStage` → 应用到MovieStagePage
8. `TheaterCard` + `convertTheaterStage` → 应用到TheaterStagePage
9. `DatePicker` + `convertDateStage` → 应用到DateStagePage
10. `TimePicker` + `convertTimeStage` → 应用到TimeStagePage
11. `SeatMap` + `SeatLegend` + `ScreenIndicator` + `convertSeatStage` → 应用到SeatStagePage
12. `TicketCounter` + `convertTicketStage` → 应用到TicketStagePage
13. `ConfirmForm` + `BookingResult` + `convertConfirmStage` → 应用到ConfirmPage
14. `ActionBar`、`BookingSummary` — 公共组件

### 阶段4：重构和改进
15. 从现有Stage页面中删除直接渲染代码
16. 扩展spec以支持错误/加载状态（可选）
17. 使用Storybook或单独工具预览spec → UI（可选）

---

## 8. 与A2UI的比较总结

| 项目 | A2UI | 我们的实现 |
|------|------|----------|
| 框架 | Lit（Web Components） | React |
| 消息传输 | 服务器 → 客户端流式传输 | 前端内部转换 |
| 组件结构 | 扁平列表 + ID引用 | 相同 |
| 数据绑定 | JSON Pointer（`/path`） | 相同 |
| 结构/数据分离 | `updateComponents` / `updateDataModel` | `components` / `dataModel` |
| 组件目录 | 通用18个 + 自定义目录 | 通用8个 + 领域11个 |
| 可扩展性 | 自定义目录 + 注册表 | 注册表模式 |
| 复杂度 | 高（流式传输，Surface管理） | 低（同步转换） |
