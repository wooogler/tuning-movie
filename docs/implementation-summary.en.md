# Rendering Engine Implementation Summary

## Architecture Overview

```
Backend API → Page(data fetch) → Converter(data → UISpec) → SpecRenderer(UISpec → React) → DOM
```

In the previous approach, each page directly rendered API data to JSX, but now we use a **declarative UI Spec** as an intermediate representation (IR).

## Directory Structure

```
apps/frontend/src/
├── converter/                    # API data → UI Spec conversion
│   ├── types.ts                  # UISpec, Component, DataBinding types
│   ├── index.ts                  # Barrel exports
│   ├── movieStage.ts             # Movie selection spec
│   ├── theaterStage.ts           # Theater selection spec
│   ├── dateStage.ts              # Date selection spec
│   ├── timeStage.ts              # Time selection spec
│   ├── seatStage.ts              # Seat selection spec
│   ├── ticketStage.ts            # Ticket selection spec
│   └── confirmStage.ts           # Booking confirmation spec
│
├── renderer/                     # UI Spec → React rendering
│   ├── index.ts                  # Barrel exports
│   ├── SpecRenderer.tsx          # Main renderer
│   ├── registry.ts               # Component registry
│   ├── resolveData.ts            # JSON Pointer data binding
│   └── components/
│       ├── layout/               # Layout components
│       │   ├── Column.tsx
│       │   ├── Row.tsx
│       │   ├── Grid.tsx
│       │   └── Card.tsx
│       ├── base/                 # Base components
│       │   ├── Text.tsx
│       │   ├── Image.tsx
│       │   ├── Button.tsx
│       │   └── TextField.tsx
│       └── domain/               # Domain components
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
└── pages/                        # Each page (modified)
    ├── MovieStagePage.tsx
    ├── TheaterStagePage.tsx
    ├── DateStagePage.tsx
    ├── TimeStagePage.tsx
    ├── SeatStagePage.tsx
    ├── TicketStagePage.tsx
    └── ConfirmPage.tsx
```

## Core Type Definitions

### UISpec (converter/types.ts)

```typescript
interface UISpec {
  surface: string;                        // Screen identifier
  components: Component[];                // Flat component list
  dataModel: Record<string, unknown>;     // Server data (read-only)
  state?: StateModel;                     // UI state (read/write)
  actions?: Record<string, Action>;       // Action definitions
}

interface Component {
  id: string;                             // Unique ID
  type: string;                           // Component type (registry key)
  children?: string[] | IteratorBinding;  // Child components
  props?: Record<string, unknown>;        // Component props
  data?: DataBinding;                     // Data binding
  when?: StateBinding;                    // Conditional rendering
}

interface DataBinding {
  path: string;                           // JSON Pointer (e.g., "/movies/0/title")
}

interface IteratorBinding {
  each: string;                           // Array path to iterate
  template: string;                       // Template component ID
}
```

## Data Flow

### 1. API Call from Page
```typescript
// MovieStagePage.tsx
const [spec, setSpec] = useState<UISpec | null>(null);

useEffect(() => {
  api.getMovies()
    .then((data) => setSpec(convertMovieStage(data.movies)));
}, []);
```

### 2. Converter Generates UISpec
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

### 3. SpecRenderer Renders to React
```typescript
// Used in page
<SpecRenderer spec={spec} onAction={handleAction} />
```

### 4. Action Handling
```typescript
const handleAction = (actionName: string, data?: unknown) => {
  if (actionName === 'selectMovie') {
    setMovie(data as Movie);
    navigate('/theater');
  }
};
```

## Component Registry

```typescript
// renderer/registry.ts
const registry = new Map<string, RendererComponent>();

// Layout
registry.set('Column', Column);
registry.set('Row', Row);
registry.set('Grid', Grid);
registry.set('Card', Card);

// Base
registry.set('Text', Text);
registry.set('Image', Image);
registry.set('Button', Button);
registry.set('TextField', TextField);

// Domain
registry.set('MovieCard', MovieCard);
registry.set('TheaterCard', TheaterCard);
// ... etc
```

## SpecRenderer Mechanics

1. **Build Component Map**: Convert flat list to ID → Component map
2. **Recursive Rendering from root**: Call `renderComponent('root')`
3. **Resolve Data Binding**: Use `resolveData()` to parse JSON Pointer paths
4. **Process Children**:
   - Static children: `["child1", "child2"]` → Call `renderComponent()` for each
   - Iterator children: `{ each: "/movies", template: "card_tpl" }` → Loop through array and render template
5. **Look up Component in Registry**: `getComponent(comp.type)`
6. **Create React Element**: Pass props, data, onAction

## Differences from A2UI

| Item | A2UI | Our Implementation |
|------|------|----------|
| Framework | Lit Web Components | React |
| State Management | dataModel only | dataModel + state separation |
| Components | 18 standard + custom | 4 layout + 4 base + 12 domain |
| Data Source | LLM streaming | REST API |
| Binding | `/` prefix | `/` (dataModel), `$state/` (state) |

## Advantages

1. **Separation of Concerns**: Data transformation (Converter) separated from rendering (Renderer)
2. **Declarative UI**: Rendering logic abstracted with JSON-format UI specification
3. **Extensibility**: New components just need to be added to registry
4. **Testability**: UISpec is pure data, easy to validate
5. **Debugging**: Intermediate representation (UISpec) can be inspected in console

## Usage Example

```typescript
// Adding a new page
// 1. Write converter function
export function convertNewStage(data: SomeData): UISpec {
  return {
    surface: 'new_stage',
    components: [...],
    dataModel: { data },
  };
}

// 2. Add domain component if needed
export function NewComponent({ data, onAction }: Props) { ... }
registry.set('NewComponent', NewComponent);

// 3. Use in page
const spec = convertNewStage(apiData);
return <SpecRenderer spec={spec} onAction={handleAction} />;
```
