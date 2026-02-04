# Rendering Engine Design

A2UI에서 영감을 받은, React 기반 선언적 UI 렌더링 엔진 설계 문서.

## 1. 아키텍처 개요

### 1.1 설계 철학

본 시스템은 **LLM Agent가 GUI를 조작**할 수 있도록 설계되었다.

- **A2UI 원본**: LLM이 UI 전체를 자유롭게 설계 (Column, Grid 등 layout 조합)
- **우리 시스템**: UI 구조는 Stage별로 고정, Agent는 **modification 및 interaction** 수행

### 1.2 Agent 역할

| 기능 | 설명 | 구현 |
|------|------|------|
| **Perception** | UI Spec 읽기 (items, state, modification) | Python Agent |
| **Modification** | filter, sort, highlight, augment | Tool Call → JS 함수 |
| **Interaction** | select, click, navigate | Tool Call → Python |
| **Response** | 자연어 응답 생성 | Python Agent |

### 1.3 아키텍처

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           LLM Agent (Python)                                 │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  Perception: UI Spec 읽기 (stage, items, state, modification)       │    │
│  │  Decision:   Tool Call 결정                                         │    │
│  │  Response:   자연어 응답 생성                                        │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                    Tool Calls:
                    ├── Modification: filter, sort, highlight, augment
                    └── Interaction:  select, click, navigate (Python)
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                      Modifier Functions (Frontend JS)                        │
│  applyFilter() │ applySort() │ applyHighlight() │ applyAugment()            │
│                                                                              │
│  * Deterministic (결정적)                                                    │
│  * Pure functions: (UISpec, Params) → UISpec                                │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                              업데이트된 UISpec
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           Stage Renderer                                     │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │  MovieStage │ TheaterStage │ DateStage │ TimeStage │ SeatStage │ ... │   │
│  │                                                                       │   │
│  │  * 고정 레이아웃                                                       │   │
│  │  * items + modification → visible items 계산                          │   │
│  │  * highlight, augment 상태 반영                                       │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 1.4 데이터 흐름

```
Backend API → Page(data fetch) → Generator(data → UISpec) → Modifier Functions → StageRenderer → DOM
                                         │                          ↑
                                         └──── Agent Perception ────┘
                                                    ↓
                                              Agent Tool Calls
```

---

## 2. UI Spec 포맷

### 2.1 설계 원칙

- **Layout 제거**: Stage별 UI 구조는 React 컴포넌트에서 고정
- **데이터 중심**: Agent가 이해할 수 있는 선언적 데이터 표현
- **State 포함**: UI 상태 (선택, 입력 등)를 포함하여 Agent가 현재 상태를 파악
- **Modification 상태 표현**: 현재 적용된 filter, sort, highlight, augment 상태
- **Derived Visible Items**: `visibleItems`는 `items` + `modification`에서 계산 (별도 저장 안 함)

### 2.2 Spec 타입 정의

```typescript
// Stage 식별자
type Stage = 'movie' | 'theater' | 'date' | 'time' | 'seat' | 'ticket' | 'confirm';

// UI Spec - Agent의 Perception 대상
interface UISpec {
  stage: Stage;                              // 현재 Stage
  items: DataItem[];                         // 원본 데이터 아이템 목록
  state: StateModel;                         // UI 상태 (선택, 입력 등)
  modification: ModificationState;           // 현재 적용된 Modification 상태
  meta?: Record<string, unknown>;            // Stage별 추가 메타데이터
}

// UI 상태 (Stage별로 다름)
interface StateModel {
  selectedId?: string;                       // 단일 선택 (movie, theater, date, time)
  selectedIds?: string[];                    // 다중 선택 (seat)
  quantities?: Record<string, number>;       // 수량 (ticket)
}

// Modification 상태
interface ModificationState {
  filter?: FilterState;
  sort?: SortState;
  highlight?: HighlightState;
  augment?: AugmentState[];
}

interface FilterState {
  field: string;
  operator: 'eq' | 'neq' | 'contains' | 'gt' | 'lt' | 'gte' | 'lte' | 'in';
  value: unknown;
}

interface SortState {
  field: string;
  order: 'asc' | 'desc';
}

interface HighlightState {
  itemIds: string[];
  style?: 'border' | 'glow' | 'badge';
}

interface AugmentState {
  itemId: string;
  fields: Record<string, unknown>;
}

// Visible Items는 렌더링 시 계산 (derived state)
function getVisibleItems(spec: UISpec): DataItem[] {
  let result = spec.items;
  if (spec.modification.filter) {
    result = applyFilterLogic(result, spec.modification.filter);
  }
  if (spec.modification.sort) {
    result = applySortLogic(result, spec.modification.sort);
  }
  return result;
}
```

### 2.3 실제 예시: Movie Select Stage

**기본 상태:**
```json
{
  "stage": "movie",
  "items": [
    { "id": "m1", "title": "Dune: Part Two", "genre": ["Sci-Fi"], "rating": "PG-13", "duration": 166 },
    { "id": "m2", "title": "Oppenheimer", "genre": ["Drama", "History"], "rating": "R", "duration": 180 },
    { "id": "m3", "title": "Barbie", "genre": ["Comedy"], "rating": "PG-13", "duration": 114 }
  ],
  "state": { "selectedId": null },
  "modification": {}
}
```

**Filter 적용 후 (Sci-Fi 장르만):**
```json
{
  "stage": "movie",
  "items": [...],
  "state": { "selectedId": null },
  "modification": {
    "filter": { "field": "genre", "operator": "contains", "value": "Sci-Fi" }
  }
}
```
→ Renderer가 `getVisibleItems()`로 계산하면 Sci-Fi 영화만 표시

**Sort + Highlight 적용 후:**
```json
{
  "stage": "movie",
  "items": [...],
  "state": { "selectedId": "m3" },
  "modification": {
    "sort": { "field": "duration", "order": "asc" },
    "highlight": { "itemIds": ["m3"], "style": "border" }
  }
}
```

**Augment 적용 후:**
```json
{
  "stage": "movie",
  "items": [...],
  "state": { "selectedId": "m1" },
  "modification": {
    "augment": [
      { "itemId": "m1", "fields": { "recommendation": "에이전트 추천", "matchScore": 95 } }
    ]
  }
}
```
→ Renderer가 augment 정보를 보고 m1에 "에이전트 추천" 뱃지 표시

---

## 3. Modification 시스템

### 3.1 Modification 종류

| 종류 | 설명 | 사용 예시 |
|------|------|----------|
| **Filter** | 조건에 맞는 데이터만 표시 | "액션 영화만 보여줘" |
| **Sort** | 순서 변경 | "평점순으로 정렬해줘" |
| **Highlight** | 특정 아이템 강조 | "추천 영화를 강조해줘" |
| **Augment** | 필드 값 변경/추가 | "이 영화에 추천 뱃지 달아줘" |

### 3.2 Modifier 함수 (Deterministic)

Modifier 함수는 **modification 상태만 업데이트**. Visible items는 렌더링 시 계산.

```typescript
// apps/frontend/src/spec/modifiers.ts

// Filter 적용 - modification.filter만 설정
export function applyFilter(spec: UISpec, params: FilterState): UISpec {
  return {
    ...spec,
    modification: { ...spec.modification, filter: params }
  };
}

// Sort 적용 - modification.sort만 설정
export function applySort(spec: UISpec, params: SortState): UISpec {
  return {
    ...spec,
    modification: { ...spec.modification, sort: params }
  };
}

// Highlight 적용 - modification.highlight만 설정
export function applyHighlight(spec: UISpec, params: HighlightState): UISpec {
  return {
    ...spec,
    modification: { ...spec.modification, highlight: params }
  };
}

// Augment 적용 - modification.augment만 설정
export function applyAugment(spec: UISpec, params: AugmentState[]): UISpec {
  return {
    ...spec,
    modification: { ...spec.modification, augment: params }
  };
}

// 선택 (state 업데이트)
export function selectItem(spec: UISpec, itemId: string): UISpec {
  return {
    ...spec,
    state: { ...spec.state, selectedId: itemId }
  };
}

// 초기화
export function clearModification(spec: UISpec, type?: 'filter' | 'sort' | 'highlight' | 'augment' | 'all'): UISpec {
  if (type === 'all' || !type) {
    return { ...spec, modification: {} };
  }
  const newMod = { ...spec.modification };
  delete newMod[type];
  return { ...spec, modification: newMod };
}

// Visible Items 계산 (렌더링 시 호출)
export function getVisibleItems(spec: UISpec): DataItem[] {
  let result = [...spec.items];

  // Filter 적용
  if (spec.modification.filter) {
    const { field, operator, value } = spec.modification.filter;
    result = result.filter(item => {
      const itemValue = item[field];
      switch (operator) {
        case 'eq': return itemValue === value;
        case 'contains':
          if (Array.isArray(itemValue)) return itemValue.includes(value);
          return String(itemValue).includes(String(value));
        // ... 기타 연산자
      }
    });
  }

  // Sort 적용
  if (spec.modification.sort) {
    const { field, order } = spec.modification.sort;
    result.sort((a, b) => {
      const aVal = a[field], bVal = b[field];
      const cmp = typeof aVal === 'string' ? aVal.localeCompare(bVal) : aVal - bVal;
      return order === 'asc' ? cmp : -cmp;
    });
  }

  return result;
}
```

---

## 4. Agent Tool 정의

LLM Agent가 호출하는 Tool 정의:

```typescript
// apps/frontend/src/agent/tools.ts

const agentTools = [
  {
    name: 'filter',
    description: 'Filter items by a specific field condition',
    parameters: {
      field: { type: 'string', description: 'Field to filter by (e.g., "genre", "rating")' },
      operator: { type: 'string', enum: ['eq', 'neq', 'contains', 'gt', 'lt', 'gte', 'lte', 'in'] },
      value: { description: 'Value to compare against' }
    }
  },
  {
    name: 'sort',
    description: 'Sort items by a specific field',
    parameters: {
      field: { type: 'string', description: 'Field to sort by' },
      order: { type: 'string', enum: ['asc', 'desc'] }
    }
  },
  {
    name: 'highlight',
    description: 'Highlight specific items visually',
    parameters: {
      itemIds: { type: 'array', description: 'Item IDs to highlight' },
      style: { type: 'string', enum: ['border', 'glow', 'badge'], optional: true }
    }
  },
  {
    name: 'augment',
    description: 'Add additional information to an item',
    parameters: {
      itemId: { type: 'string', description: 'Item ID to augment' },
      fields: { type: 'object', description: 'Fields to add or modify' }
    }
  },
  {
    name: 'select',
    description: 'Select an item',
    parameters: {
      itemId: { type: 'string', description: 'Item ID to select' }
    }
  },
  {
    name: 'clearModification',
    description: 'Clear applied modifications',
    parameters: {
      type: { type: 'string', enum: ['filter', 'sort', 'highlight', 'augment', 'all'], optional: true }
    }
  },
  {
    name: 'next',
    description: 'Proceed to next stage with current state (selected item is passed to next stage)',
    parameters: {}
  },
  {
    name: 'prev',
    description: 'Go back to previous stage (current state is discarded)',
    parameters: {}
  }
];
```

---

## 5. Stage Renderer

각 Stage별 고정 레이아웃 컴포넌트.

### 5.1 StageRenderer

```typescript
// apps/frontend/src/renderer/StageRenderer.tsx

interface StageRendererProps {
  spec: UISpec;
  onSelect: (itemId: string) => void;
  onNext: () => void;
  onBack: () => void;
}

export function StageRenderer({ spec, ...props }: StageRendererProps) {
  const stageComponents = {
    movie: MovieStage,
    theater: TheaterStage,
    date: DateStage,
    time: TimeStage,
    seat: SeatStage,
    ticket: TicketStage,
    confirm: ConfirmStage,
  };
  const StageComponent = stageComponents[spec.stage];
  return <StageComponent spec={spec} {...props} />;
}
```

### 5.2 Stage 컴포넌트 예시 (MovieStage)

```typescript
// apps/frontend/src/renderer/stages/MovieStage.tsx
import { getVisibleItems } from '../../spec/modifiers';

export function MovieStage({ spec, onSelect, onNext }: MovieStageProps) {
  // items + modification → visible items 계산
  const visibleItems = getVisibleItems(spec);

  return (
    <div className="flex flex-col gap-6 items-center">
      {/* 고정 레이아웃: ButtonGroup */}
      <ButtonGroup
        items={visibleItems}
        selectedId={spec.state.selectedId}
        onSelect={onSelect}
        labelField="title"  // 기본: 제목만 표시
        // highlight, augment 정보 전달
        highlightedIds={spec.modification.highlight?.itemIds}
        highlightStyle={spec.modification.highlight?.style}
        augmentations={spec.modification.augment}
      />
      <ActionBar next={{ label: 'Continue', disabled: !spec.selectedId, onClick: onNext }} />
    </div>
  );
}
```

---

## 6. UI 컴포넌트

### 6.1 설계 철학

**기본 UI는 최소한의 정보만 표시**, Agent가 Augment를 통해 필요시 추가 정보를 넣는 방식.

```
기본 상태:        [Dune: Part Two]
                  [Oppenheimer]
                  [Barbie]

Augment 적용 후:  [Dune: Part Two] ← "SF 추천" 뱃지
                  [Oppenheimer (3h)] ← 러닝타임 추가
                  [Barbie]
```

### 6.2 컴포넌트 카탈로그

| 컴포넌트 | 설명 | 사용 Stage |
|----------|------|------------|
| `ButtonGroup` | 텍스트 버튼 목록 (단일 선택) | movie, theater, time |
| `Calendar` | 달력 (날짜 선택) | date |
| `SeatMap` | 좌석 배치도 (다중 선택) | seat |
| `TicketCounter` | 수량 조절 (+/-) | ticket |
| `BookingSummary` | 예약 요약 정보 | confirm |
| `ActionBar` | Back/Continue 버튼 | 공통 |

### 6.3 컴포넌트 Props

```typescript
// ButtonGroup - Movie, Theater, Time 공통
interface ButtonGroupProps {
  items: DataItem[];
  selectedId?: string;
  onSelect: (id: string) => void;
  labelField: string;                         // 표시할 필드명 (예: "title", "name", "time")
  // Modification 지원
  highlightedIds?: string[];
  highlightStyle?: 'border' | 'glow' | 'badge';
  augmentations?: Map<string, Record<string, unknown>>;
}

// Calendar - Date 선택
interface CalendarProps {
  availableDates: string[];                   // 선택 가능한 날짜들
  selectedDate?: string;
  onSelect: (date: string) => void;
  // Modification 지원
  highlightedDates?: string[];
  augmentations?: Map<string, Record<string, unknown>>;
}

// SeatMap - Seat 선택 (standard 좌석만, premium 없음)
interface SeatMapProps {
  seats: Seat[];                              // { id, row, number, status: 'available' | 'occupied' }
  selectedIds: string[];
  onToggle: (id: string) => void;
  // Modification 지원
  highlightedIds?: string[];
  augmentations?: Map<string, Record<string, unknown>>;
}

// TicketCounter - Ticket 수량
interface TicketCounterProps {
  ticketTypes: TicketType[];                  // { id, name, price }
  quantities: Record<string, number>;
  maxTotal: number;                           // 선택한 좌석 수
  onChange: (typeId: string, quantity: number) => void;
}

// BookingSummary - Confirm (예약 요약만, 입력 폼 없음)
interface BookingSummaryProps {
  movie: string;
  theater: string;
  date: string;
  time: string;
  seats: string[];
  tickets: { type: string; quantity: number; price: number }[];
  totalPrice: number;
}
```

### 6.4 Stage별 UI 예시

**Movie Stage (ButtonGroup)**
```
Select Movie
─────────────────
[Dune: Part Two]     ← 선택됨
[Oppenheimer]
[Barbie]

        [Continue →]
```

**Date Stage (Calendar)**
```
Select Date
─────────────────
    February 2026
Su Mo Tu We Th Fr Sa
                   1
 2  3  4  5  6  7  8
 9 10 11 12 13 14 15
   ↑ 선택됨

        [Continue →]
```

**Seat Stage (SeatMap)**
```
Select Seats
─────────────────
    ┌─ SCREEN ─┐

    A1 A2 A3 A4 A5
    B1 B2 ●  B4 B5    ● = occupied
    C1 ◉  ◉  C4 C5    ◉ = selected

        [Continue →]
```

**Confirm Stage (BookingSummary)**
```
Booking Summary
─────────────────
Movie:   Dune: Part Two
Theater: CGV Gangnam
Date:    Feb 10, 2026
Time:    19:00
Seats:   C2, C3

Tickets:
  Adult x 2    $20.00

Total: $20.00

        [Confirm →]
```

---

## 7. A2UI와의 비교

| 항목 | A2UI (원본) | 우리 구현 |
|------|------------|----------|
| 프레임워크 | Lit (Web Components) | React |
| LLM 역할 | UI 전체 설계 | Modification만 |
| UI 구조 | 동적 (Column, Grid 조합) | 고정 (Stage별) |
| 데이터 흐름 | 서버 → 클라이언트 스트리밍 | REST API + State |
| 컴포넌트 | 18개 범용 + 커스텀 | 8개 범용 + 7개 도메인 |
| Spec 변경 | LLM 생성 | Deterministic 함수 |
| 복잡도 | 높음 | 낮음 |

---

## 8. 디렉토리 구조

```
apps/frontend/src/
├── spec/                         # 새로운 UI Spec 시스템
│   ├── types.ts                  # UISpec, ModificationState 타입
│   ├── modifiers.ts              # Modifier 함수들
│   ├── generators.ts             # Stage별 Spec 생성 함수
│   └── index.ts                  # 배럴 export
│
├── renderer/
│   ├── StageRenderer.tsx         # Stage 라우팅
│   ├── stages/                   # 고정 레이아웃 Stage 컴포넌트
│   │   ├── MovieStage.tsx
│   │   ├── TheaterStage.tsx
│   │   └── ...
│   └── components/domain/        # 도메인 컴포넌트 (기존 유지)
│       ├── MovieCard.tsx         # highlight/augment 지원 추가
│       └── ...
│
├── agent/                        # Agent 관련
│   └── tools.ts                  # Tool 정의
│
├── converter/                    # 기존 시스템 (하위 호환)
│   └── ...
│
└── pages/                        # 페이지 컴포넌트
    └── ...
```
