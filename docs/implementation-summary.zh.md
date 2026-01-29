# 渲染引擎实现摘要

## 架构概览

```
Backend API → Page(数据获取) → Converter(数据 → UISpec) → SpecRenderer(UISpec → React) → DOM
```

在之前的方法中，每个页面直接将API数据渲染为JSX，但现在我们使用**声明式UI Spec**作为中间表示（IR）。

## 目录结构

```
apps/frontend/src/
├── converter/                    # API数据 → UI Spec 转换
│   ├── types.ts                  # UISpec、Component、DataBinding 类型
│   ├── index.ts                  # 统一导出
│   ├── movieStage.ts             # 电影选择规范
│   ├── theaterStage.ts           # 影院选择规范
│   ├── dateStage.ts              # 日期选择规范
│   ├── timeStage.ts              # 时间选择规范
│   ├── seatStage.ts              # 座位选择规范
│   ├── ticketStage.ts            # 票券选择规范
│   └── confirmStage.ts           # 预订确认规范
│
├── renderer/                     # UI Spec → React 渲染
│   ├── index.ts                  # 统一导出
│   ├── SpecRenderer.tsx          # 主渲染器
│   ├── registry.ts               # 组件注册表
│   ├── resolveData.ts            # JSON Pointer 数据绑定
│   └── components/
│       ├── layout/               # 布局组件
│       │   ├── Column.tsx
│       │   ├── Row.tsx
│       │   ├── Grid.tsx
│       │   └── Card.tsx
│       ├── base/                 # 基础组件
│       │   ├── Text.tsx
│       │   ├── Image.tsx
│       │   ├── Button.tsx
│       │   └── TextField.tsx
│       └── domain/               # 领域组件
│           ├── MovieCard.tsx
│           ├── TheaterCard.tsx
│           ├── DatePicker.tsx
│           ├── TimePicker.tsx
│           ├── SeatMap.tsx
│           ├── SeatLegend.tsx
│           ├── ScreenIndicator.tsx
│           ├── TicketCounter.tsx
│           ├── ActionBar.tsx
│           ├── ConfirmForm.tsx
│           ├── BookingResult.tsx
│           └── BookingSummary.tsx
│
└── pages/                        # 各页面（已修改）
    ├── MovieStagePage.tsx
    ├── TheaterStagePage.tsx
    ├── DateStagePage.tsx
    ├── TimeStagePage.tsx
    ├── SeatStagePage.tsx
    ├── TicketStagePage.tsx
    └── ConfirmPage.tsx
```

## 核心类型定义

### UISpec (converter/types.ts)

```typescript
interface UISpec {
  surface: string;                        // 屏幕标识符
  components: Component[];                // 扁平组件列表
  dataModel: Record<string, unknown>;     // 服务器数据（只读）
  state?: StateModel;                     // UI状态（读/写）
  actions?: Record<string, Action>;       // 操作定义
}

interface Component {
  id: string;                             // 唯一ID
  type: string;                           // 组件类型（注册表键）
  children?: string[] | IteratorBinding;  // 子组件
  props?: Record<string, unknown>;        // 组件属性
  data?: DataBinding;                     // 数据绑定
  when?: StateBinding;                    // 条件渲染
}

interface DataBinding {
  path: string;                           // JSON Pointer（例如："/movies/0/title"）
}

interface IteratorBinding {
  each: string;                           // 要迭代的数组路径
  template: string;                       // 模板组件ID
}
```

## 数据流

### 1. 从页面调用API
```typescript
// MovieStagePage.tsx
const [spec, setSpec] = useState<UISpec | null>(null);

useEffect(() => {
  api.getMovies()
    .then((data) => setSpec(convertMovieStage(data.movies)));
}, []);
```

### 2. Converter生成UISpec
```typescript
// converter/movieStage.ts
export function convertMovieStage(movies: Movie[]): UISpec {
  return {
    surface: 'movie_select',
    components: [
      {
        id: 'root',
        type: 'Grid',
        children: { each: '/movies', template: 'movie_card_tpl' },
        props: { columns: { sm: 3, md: 4, lg: 5 }, gap: 6 },
      },
      {
        id: 'movie_card_tpl',
        type: 'MovieCard',
        data: { path: '.' },
        props: {
          action: { type: 'navigate', event: 'selectMovie' },
        },
      },
    ],
    dataModel: { movies },
    actions: {
      selectMovie: { type: 'navigate', payload: { to: '/theater' } },
    },
  };
}
```

### 3. SpecRenderer渲染为React
```typescript
// 在页面中使用
<SpecRenderer spec={spec} onAction={handleAction} />
```

### 4. 操作处理
```typescript
const handleAction = (actionName: string, data?: unknown) => {
  if (actionName === 'selectMovie') {
    setMovie(data as Movie);
    navigate('/theater');
  }
};
```

## 组件注册表

```typescript
// renderer/registry.ts
const registry = new Map<string, RendererComponent>();

// 布局
registry.set('Column', Column);
registry.set('Row', Row);
registry.set('Grid', Grid);
registry.set('Card', Card);

// 基础
registry.set('Text', Text);
registry.set('Image', Image);
registry.set('Button', Button);
registry.set('TextField', TextField);

// 领域
registry.set('MovieCard', MovieCard);
registry.set('TheaterCard', TheaterCard);
// ... 等等
```

## SpecRenderer工作原理

1. **构建组件映射**：将扁平列表转换为 ID → Component 映射
2. **从root开始递归渲染**：调用 `renderComponent('root')`
3. **解析数据绑定**：使用 `resolveData()` 解析JSON Pointer路径
4. **处理子组件**：
   - 静态子组件：`["child1", "child2"]` → 对每个调用 `renderComponent()`
   - 迭代子组件：`{ each: "/movies", template: "card_tpl" }` → 遍历数组并渲染模板
5. **在注册表中查找组件**：`getComponent(comp.type)`
6. **创建React元素**：传递props、data、onAction

## 与A2UI的区别

| 项目 | A2UI | 我们的实现 |
|------|------|----------|
| 框架 | Lit Web Components | React |
| 状态管理 | 仅dataModel | dataModel + state 分离 |
| 组件 | 18个标准 + 自定义 | 4个布局 + 4个基础 + 12个领域 |
| 数据源 | LLM流式传输 | REST API |
| 绑定 | `/` 前缀 | `/`（dataModel）、`$state/`（state） |

## 优势

1. **关注点分离**：数据转换（Converter）与渲染（Renderer）分离
2. **声明式UI**：通过JSON格式的UI规范抽象渲染逻辑
3. **可扩展性**：新组件只需添加到注册表
4. **可测试性**：UISpec是纯数据，易于验证
5. **可调试性**：可以在控制台中检查中间表示（UISpec）

## 使用示例

```typescript
// 添加新页面
// 1. 编写转换器函数
export function convertNewStage(data: SomeData): UISpec {
  return {
    surface: 'new_stage',
    components: [...],
    dataModel: { data },
  };
}

// 2. 如需要，添加领域组件
export function NewComponent({ data, onAction }: Props) { ... }
registry.set('NewComponent', NewComponent);

// 3. 在页面中使用
const spec = convertNewStage(apiData);
return <SpecRenderer spec={spec} onAction={handleAction} />;
```
