# Rendering Engine Design

A React-based declarative UI rendering engine design document inspired by A2UI.

## 1. Architecture Overview

The current frontend uses a **Backend API → React JSX** direct rendering approach.
We will change this to a 3-layer structure that goes through an intermediate representation (IR).

```
┌──────────┐      ┌──────────────┐      ┌──────────────┐      ┌────────────┐
│ Backend  │ ───> │  Converter   │ ───> │   UI Spec    │ ───> │  Renderer  │
│   API    │ JSON │ (API → Spec) │      │ (IR: JSON)   │      │ (Spec →    │
│          │      │              │      │              │      │  React)    │
└──────────┘      └──────────────┘      └──────────────┘      └────────────┘
  Keep current       Add new           Intermediate value       Add new
```

### Responsibilities of Each Layer

| Layer | Location | Responsibility |
|--------|------|------|
| **Backend API** | `apps/backend` | Data provisioning (no change) |
| **Converter** | `apps/frontend/src/converter/` | API response → UI Spec conversion |
| **UI Spec** | TypeScript types | Declarative intermediate representation (JSON structure) |
| **Renderer** | `apps/frontend/src/renderer/` | UI Spec → React component rendering |

### Current vs After Change Data Flow

**Current (Direct Rendering):**
```
MovieStagePage: api.getMovies() → movies.map(m => <div>...</div>)
```

**After Change (Via IR):**
```
MovieStagePage: api.getMovies() → convertMovieStage(movies) → <SpecRenderer spec={spec} />
```

---

## 2. UI Spec Format

Adopt the core design of A2UI but simplify it for React.

### 2.1 Design Principles

- **Flat Component List**: Like A2UI, use ID references instead of tree nesting (adjacency list)
- **Structure / Data / State Separation**: `components` (layout) ↔ `dataModel` (server data) ↔ `state` (UI state)
- **Data Binding**: Reference data with JSON Pointer paths (`/movies/0/title`)
- **State Binding**: Use `$state/` prefix for UI state reference (`$state/selectedMovieId`)
- **Domain-Specific Components**: General components + movie booking-specific components

> **Difference from A2UI**: A2UI puts all data in one `dataModel`.
> We explicitly separate data from the server (`dataModel`) and state from client interactions (`state`).
> This separation is useful when tracking state changes separately or
> passing them to external systems later.

### 2.2 Spec Type Definition

```typescript
// Top-level structure of UI Spec
interface UISpec {
  surface: string;           // Screen identifier (e.g., "movie_select")
  components: Component[];   // Flat component list
  dataModel: Record<string, unknown>; // Data
  actions?: ActionMap;       // Event handler mapping
}

// Component definition
interface Component {
  id: string;                // Unique ID (root required)
  type: string;              // Component type name
  children?: string[];       // Child component ID array
  child?: string;            // Single child (Card, etc.)
  props?: Record<string, unknown>; // Static properties
  data?: DataBinding;        // Data binding
}

// Data binding
type DataBinding =
  | { path: string }                    // Absolute path: "/movies/0/title"
  | { each: string; template: string }; // Iteration: each="/movies", template="movie_card_tpl"

// Action mapping
interface ActionMap {
  [actionName: string]: {
    type: 'navigate' | 'store' | 'api';
    payload: Record<string, unknown>;
  };
}
```

### 2.3 Real Example: Movie Select Stage

**Backend API Response:**
```json
{
  "movies": [
    { "id": "m1", "title": "Dune: Part Two", "posterUrl": "...", "genre": ["Sci-Fi"], "duration": 166, "rating": "PG-13" },
    { "id": "m2", "title": "Oppenheimer", "posterUrl": "...", "genre": ["Drama"], "duration": 180, "rating": "R" }
  ]
}
```

**Converted UI Spec:**
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

### 2.4 Real Example: Seat Select Stage

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

## 3. Component Catalog

### 3.1 General Layout Components

| Type | Description | Key props |
|------|------|-----------|
| `Column` | Vertical layout | `align`, `justify`, `gap` |
| `Row` | Horizontal layout | `align`, `justify`, `gap` |
| `Grid` | Grid layout | `columns`, `gap` |
| `Card` | Card container | `child`, `onClick` |
| `Text` | Text display | `text`, `variant` (h1~h5, body, caption) |
| `Image` | Image display | `src`, `alt`, `fit` |
| `Button` | Button | `label`, `variant` (primary, secondary), `action` |
| `TextField` | Text input | `label`, `value`, `placeholder` |

### 3.2 Domain-Specific Components

| Type | Description | Bound Data |
|------|------|-------------|
| `MovieCard` | Poster + title + genre + runtime | `Movie` |
| `TheaterCard` | Theater name + location + screen count | `Theater` |
| `DatePicker` | Date selection card grid | `string[]` (dates) |
| `TimePicker` | Time + screen + available seats | `Showing[]` |
| `SeatMap` | Seat layout (row/column grid) | `Seat[]` |
| `SeatLegend` | Seat type legend | (none, static) |
| `ScreenIndicator` | "SCREEN" display | (none, static) |
| `TicketCounter` | Ticket type + quantity +/- | `TicketType` |
| `BookingSummary` | Booking summary info | Entire booking state |
| `ActionBar` | Back / Continue buttons | `back`, `next` |
| `ConfirmForm` | Name + email input form | `customerName`, `customerEmail` |
| `BookingResult` | Booking completion screen | `Booking` |

---

## 4. Converter Layer

Write **Backend API response → UI Spec** conversion functions for each stage.

### 4.1 File Structure

```
apps/frontend/src/converter/
├── index.ts              # Barrel exports
├── types.ts              # UISpec, Component, DataBinding types
├── movieStage.ts         # convertMovieStage(movies) → UISpec
├── theaterStage.ts       # convertTheaterStage(theaters) → UISpec
├── dateStage.ts          # convertDateStage(dates) → UISpec
├── timeStage.ts          # convertTimeStage(showings) → UISpec
├── seatStage.ts          # convertSeatStage(seats) → UISpec
├── ticketStage.ts        # convertTicketStage(ticketTypes, selectedSeats) → UISpec
└── confirmStage.ts       # convertConfirmStage(bookingState) → UISpec
```

### 4.2 Conversion Function Interface

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

## 5. Renderer Engine

An engine that receives UI Spec and renders it as React components.

### 5.1 File Structure

```
apps/frontend/src/renderer/
├── index.ts              # <SpecRenderer /> export
├── SpecRenderer.tsx      # Main renderer (spec → React tree)
├── resolveData.ts        # Data binding resolution (JSON Pointer)
├── registry.ts           # Component registry
└── components/           # React components for renderer
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

### 5.2 Core: SpecRenderer

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

    // Resolve data binding
    const resolvedData = comp.data
      ? resolveData(comp.data, spec.dataModel)
      : undefined;

    // Render children
    let renderedChildren: ReactNode = null;

    if (Array.isArray(comp.children)) {
      // Static children: ["child1", "child2"]
      renderedChildren = comp.children.map(childId => renderComponent(childId));
    } else if (comp.children && 'each' in comp.children) {
      // Iterator children: { each: "/movies", template: "card_tpl" }
      const items = resolveData({ path: comp.children.each }, spec.dataModel) as unknown[];
      renderedChildren = items.map((item, i) =>
        renderComponent(comp.children.template, { ...spec.dataModel, _item: item, _index: i })
      );
    }

    // Look up React component in registry
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

### 5.3 Component Registry

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

// Initial registration
import { Grid } from './components/layout/Grid';
import { MovieCard } from './components/domain/MovieCard';
// ...

registerComponent('Grid', Grid);
registerComponent('MovieCard', MovieCard);
// ...
```

### 5.4 Data Binding Resolution

```typescript
// renderer/resolveData.ts

// JSON Pointer resolution: "/movies/0/title" → dataModel.movies[0].title
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

## 6. Stage Page After Change (Usage Example)

```typescript
// pages/MovieStagePage.tsx (After change)
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

## 7. Implementation Order

### Phase 1: Core Infrastructure
1. `converter/types.ts` — UISpec, Component, DataBinding type definitions
2. `renderer/resolveData.ts` — JSON Pointer data binding resolution
3. `renderer/registry.ts` — Component registry
4. `renderer/SpecRenderer.tsx` — Main renderer

### Phase 2: General Components
5. `Column`, `Row`, `Grid`, `Card` layout components
6. `Text`, `Image`, `Button`, `TextField` base components

### Phase 3: Domain Components + Converter
7. `MovieCard` + `convertMovieStage` → Apply to MovieStagePage
8. `TheaterCard` + `convertTheaterStage` → Apply to TheaterStagePage
9. `DatePicker` + `convertDateStage` → Apply to DateStagePage
10. `TimePicker` + `convertTimeStage` → Apply to TimeStagePage
11. `SeatMap` + `SeatLegend` + `ScreenIndicator` + `convertSeatStage` → Apply to SeatStagePage
12. `TicketCounter` + `convertTicketStage` → Apply to TicketStagePage
13. `ConfirmForm` + `BookingResult` + `convertConfirmStage` → Apply to ConfirmPage
14. `ActionBar`, `BookingSummary` — Common components

### Phase 4: Refactoring and Improvements
15. Remove direct rendering code from existing Stage pages
16. Extend spec for error/loading states (optional)
17. Preview spec → UI with Storybook or separate tool (optional)

---

## 8. Comparison with A2UI Summary

| Item | A2UI | Our Implementation |
|------|------|----------|
| Framework | Lit (Web Components) | React |
| Message Transmission | Server → Client streaming | Frontend internal conversion |
| Component Structure | Flat list + ID reference | Same |
| Data Binding | JSON Pointer (`/path`) | Same |
| Structure/Data Separation | `updateComponents` / `updateDataModel` | `components` / `dataModel` |
| Component Catalog | General 18 + custom catalog | General 8 + domain 11 |
| Extensibility | Custom Catalog + Registry | Registry pattern |
| Complexity | High (streaming, Surface management) | Low (synchronous conversion) |
