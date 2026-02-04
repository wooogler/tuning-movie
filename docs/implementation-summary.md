# Rendering Engine 구현 요약

## 아키텍처 개요

```
Backend API → Page(data fetch) → Generator(data → UISpec) → Modifier Functions → StageRenderer → DOM
                                         │                          ↑
                                         └──── Agent Perception ────┘
                                                    ↓
                                              Agent Tool Calls
```

LLM Agent가 GUI를 조작할 수 있도록 설계된 시스템입니다.

### Agent 기능
| 기능 | 설명 | 구현 |
|------|------|------|
| **Perception** | UI Spec 읽기 (items, state, modification) | Python Agent |
| **Modification** | filter, sort, highlight, augment | Tool Call → JS 함수 |
| **Interaction** | select, next, prev | Tool Call → Python |

### 설계 원칙
- **UI 구조**: Stage별 고정 (layout 정의 제거)
- **State 포함**: UI Spec에 state 포함 → Agent가 현재 상태 파악
- **Derived Visible Items**: `visibleItems`는 `items` + `modification`에서 계산 (별도 저장 안 함)
- **Modification 방식**: 함수 기반 결정적 변경 (Deterministic)

## 디렉토리 구조

```
apps/frontend/src/
├── spec/                         # UI Spec 시스템
│   ├── types.ts                  # UISpec, ModificationState 타입
│   ├── modifiers.ts              # Modifier 함수들 (applyFilter, applySort, etc.)
│   ├── generators.ts             # Stage별 Spec 생성 함수
│   └── index.ts                  # 배럴 export
│
├── renderer/
│   ├── StageRenderer.tsx         # Stage 라우팅
│   ├── stages/                   # 고정 레이아웃 Stage 컴포넌트
│   │   ├── MovieStage.tsx        # ButtonGroup 사용
│   │   ├── TheaterStage.tsx      # ButtonGroup 사용
│   │   ├── DateStage.tsx         # Calendar 사용
│   │   ├── TimeStage.tsx         # ButtonGroup 사용
│   │   ├── SeatStage.tsx         # SeatMap 사용
│   │   ├── TicketStage.tsx       # TicketCounter 사용
│   │   └── ConfirmStage.tsx      # BookingSummary 사용
│   └── components/               # UI 컴포넌트
│       ├── ButtonGroup.tsx       # 텍스트 버튼 목록 (Movie, Theater, Time)
│       ├── Calendar.tsx          # 달력 (Date)
│       ├── SeatMap.tsx           # 좌석 배치도 (Seat)
│       ├── TicketCounter.tsx     # 수량 조절 (Ticket)
│       ├── BookingSummary.tsx    # 예약 요약 (Confirm)
│       └── ActionBar.tsx         # Back/Continue 버튼
│
├── agent/                        # Agent 관련
│   └── tools.ts                  # Tool 정의
│
└── pages/                        # 페이지 컴포넌트
    ├── MovieStagePage.tsx
    ├── TheaterStagePage.tsx
    ├── DateStagePage.tsx
    ├── TimeStagePage.tsx
    ├── SeatStagePage.tsx
    ├── TicketStagePage.tsx
    └── ConfirmPage.tsx
```

## 핵심 타입 정의

### UISpec (spec/types.ts)

```typescript
// Stage 식별자
type Stage = 'movie' | 'theater' | 'date' | 'time' | 'seat' | 'ticket' | 'confirm';

// UI Spec - Agent가 Perception으로 읽는 선언적 표현
interface UISpec {
  stage: Stage;                              // 현재 Stage
  items: DataItem[];                         // 원본 데이터 아이템 목록
  state: StateModel;                         // UI 상태 (선택, 수량 등)
  modification: ModificationState;           // 현재 적용된 Modification 상태
  meta?: Record<string, unknown>;            // Stage별 추가 메타데이터
}

// UI 상태
interface StateModel {
  selectedId?: string;                       // 단일 선택 (movie, theater, date, time)
  selectedIds?: string[];                    // 다중 선택 (seat)
  quantities?: Record<string, number>;       // 수량 (ticket)
}

// Modification 상태 - visible items는 렌더링 시 items + modification에서 계산
interface ModificationState {
  filter?: { field: string; operator: string; value: unknown };
  sort?: { field: string; order: 'asc' | 'desc' };
  highlight?: { itemIds: string[]; style?: 'border' | 'glow' | 'badge' };
  augment?: Array<{ itemId: string; fields: Record<string, unknown> }>;
}
```

## 데이터 흐름

### 1. 페이지에서 API 호출 및 Spec 생성
```typescript
// MovieStagePage.tsx
const [spec, setSpec] = useState<UISpec | null>(null);
const [movies, setMovies] = useState<Movie[]>([]);

useEffect(() => {
  api.getMovies()
    .then(data => {
      setMovies(data.movies);
      setSpec(generateMovieSpec(data.movies));  // Generator 사용
    });
}, []);
```

### 2. Generator가 UISpec 생성
```typescript
// spec/generators.ts
export function generateMovieSpec(movies: Movie[], selectedId?: string): UISpec {
  return {
    stage: 'movie',
    items: movies,
    state: { selectedId },
    modification: {},
  };
}
```

### 3. StageRenderer가 React로 렌더링
```typescript
// 페이지에서 사용
<StageRenderer
  spec={spec}
  onSelect={handleSelect}
  onNext={handleNext}
  onBack={handleBack}
/>
```

### 4. Modification 적용 (Tool Call)
```typescript
// Agent Tool Call 처리
const handleModification = (tool: string, params: unknown) => {
  switch (tool) {
    case 'filter':
      setSpec(applyFilter(spec, params));
      break;
    case 'sort':
      setSpec(applySort(spec, params));
      break;
    case 'highlight':
      setSpec(applyHighlight(spec, params));
      break;
    case 'augment':
      setSpec(applyAugment(spec, [params]));
      break;
  }
};
```

## Modifier 함수 (Deterministic)

```typescript
// spec/modifiers.ts

// Filter - 조건에 맞는 데이터만 표시
export function applyFilter(spec: UISpec, params: FilterState): UISpec;

// Sort - 순서 변경
export function applySort(spec: UISpec, params: SortState): UISpec;

// Highlight - 특정 아이템 강조
export function applyHighlight(spec: UISpec, params: HighlightState): UISpec;

// Augment - 필드 값 변경/추가
export function applyAugment(spec: UISpec, params: AugmentState[]): UISpec;

// Select - 아이템 선택
export function selectItem(spec: UISpec, itemId: string): UISpec;

// Clear - 초기화
export function clearModification(spec: UISpec, type?: string): UISpec;
```

### 특징
- **Pure Functions**: 같은 입력 → 같은 출력 (Deterministic)
- **Immutable**: 새로운 UISpec 반환
- **Composable**: 여러 modification 조합 가능

## Agent Tool 정의

```typescript
// agent/tools.ts
const agentTools = [
  {
    name: 'filter',
    description: 'Filter items by a specific field condition',
    parameters: { field, operator, value }
  },
  {
    name: 'sort',
    description: 'Sort items by a specific field',
    parameters: { field, order }
  },
  {
    name: 'highlight',
    description: 'Highlight specific items visually',
    parameters: { itemIds, style? }
  },
  {
    name: 'augment',
    description: 'Add additional information to an item',
    parameters: { itemId, fields }
  },
  {
    name: 'select',
    description: 'Select an item',
    parameters: { itemId }
  },
  {
    name: 'clearModification',
    description: 'Clear applied modifications',
    parameters: { type? }
  },
  {
    name: 'next',
    description: 'Proceed to next stage (current state passed to next stage)',
    parameters: {}
  },
  {
    name: 'prev',
    description: 'Go back to previous stage (current state discarded)',
    parameters: {}
  }
];
```

## StageRenderer 동작 원리

1. **Stage 라우팅**: `spec.stage`에 따라 적절한 Stage 컴포넌트 렌더링
2. **visibleItems 렌더링**: modification이 적용된 데이터 표시
3. **Highlight 반영**: `_highlighted`, `_highlightStyle` 플래그 확인
4. **Augmentation 반영**: `_augmented` 필드 표시

```typescript
// renderer/StageRenderer.tsx
export function StageRenderer({ spec, onSelect, onNext, onBack }: Props) {
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
  return <StageComponent spec={spec} onSelect={onSelect} onNext={onNext} onBack={onBack} />;
}
```

## UI 컴포넌트

### 설계 철학
**기본 UI는 최소한의 정보만 표시**, Agent가 Augment를 통해 필요시 추가 정보를 넣는 방식.

### 컴포넌트 목록

| 컴포넌트 | 설명 | Stage |
|----------|------|-------|
| `ButtonGroup` | 텍스트 버튼 목록 | movie, theater, time |
| `Calendar` | 달력 (날짜 선택) | date |
| `SeatMap` | 좌석 배치도 (standard만) | seat |
| `TicketCounter` | 수량 조절 (+/-) | ticket |
| `BookingSummary` | 예약 요약 (입력 폼 없음) | confirm |
| `ActionBar` | Back/Continue 버튼 | 공통 |

### ButtonGroup Props (highlight/augment 지원)

```typescript
interface ButtonGroupProps {
  items: DataItem[];
  selectedId?: string;
  onSelect: (id: string) => void;
  labelField: string;                         // 표시할 필드명
  // Modification 지원
  highlightedIds?: string[];
  highlightStyle?: 'border' | 'glow' | 'badge';
  augmentations?: Map<string, Record<string, unknown>>;
}
```

## A2UI와의 차이점

| 항목 | A2UI | 우리 구현 |
|------|------|----------|
| 프레임워크 | Lit Web Components | React |
| LLM 역할 | UI 전체 설계 | Modification만 |
| UI 구조 | 동적 (layout 조합) | 고정 (Stage별) |
| 상태 관리 | dataModel만 사용 | items + visibleItems + modification |
| Spec 변경 | LLM 생성 | Deterministic 함수 |

## 장점

1. **관심사 분리**: 데이터(Generator), 변환(Modifier), 렌더링(StageRenderer) 분리
2. **Deterministic**: 같은 입력 → 같은 출력, 테스트 용이
3. **디버깅**: UISpec 상태를 콘솔에서 확인 가능
4. **확장성**: 새 Stage/Modification은 함수 추가만 하면 됨
5. **LLM 친화적**: 선언적 UISpec으로 Agent가 현재 상태 이해 가능

## Stage별 UI 예시

**Movie/Theater/Time Stage (ButtonGroup)**
```
[Dune: Part Two]     ← 선택됨
[Oppenheimer]
[Barbie]
```

**Date Stage (Calendar)**
```
    February 2026
Su Mo Tu We Th Fr Sa
                   1
 2  3  4  5  6  7  8
 9 10 11 12 13 14 15
   ↑ 선택됨
```

**Seat Stage (SeatMap)**
```
    ┌─ SCREEN ─┐
    A1 A2 A3 A4 A5
    B1 B2 ●  B4 B5    ● = occupied
    C1 ◉  ◉  C4 C5    ◉ = selected
```

**Confirm Stage (BookingSummary)**
```
Movie:   Dune: Part Two
Theater: CGV Gangnam
Date:    Feb 10, 2026
Time:    19:00
Seats:   C2, C3
Total:   $20.00
```

## Augment 활용 예시

기본 상태에서 Agent가 Augment를 적용하면:

```
기본:
[Dune: Part Two]
[Oppenheimer]

Augment 적용 후:
[Dune: Part Two] ← "추천" 뱃지
[Oppenheimer (3h)] ← 러닝타임 추가 표시
```

## Stage별 설명 및 UI Spec 예시

### 1. Movie Stage
**목적**: 상영 중인 영화 목록에서 영화 선택

| 항목 | 설명 |
|------|------|
| UI 컴포넌트 | ButtonGroup |
| state | `selectedId` (단일 선택) |
| 다음 Stage | Theater |

```json
{
  "stage": "movie",
  "items": [
    { "id": "m1", "title": "Dune: Part Two", "genre": ["Sci-Fi"], "rating": "PG-13", "duration": 166 },
    { "id": "m2", "title": "Oppenheimer", "genre": ["Drama"], "rating": "R", "duration": 180 }
  ],
  "state": { "selectedId": "m1" },
  "modification": {}
}
```

---

### 2. Theater Stage
**목적**: 선택한 영화를 상영하는 극장 선택

| 항목 | 설명 |
|------|------|
| UI 컴포넌트 | ButtonGroup |
| state | `selectedId` (단일 선택) |
| meta | 이전 선택: `movieId` |

```json
{
  "stage": "theater",
  "items": [
    { "id": "t1", "name": "CGV Gangnam", "location": "Gangnam Station" },
    { "id": "t2", "name": "Megabox Coex", "location": "Coex Mall" }
  ],
  "state": { "selectedId": null },
  "modification": {},
  "meta": { "movieId": "m1" }
}
```

---

### 3. Date Stage
**목적**: 상영 날짜 선택

| 항목 | 설명 |
|------|------|
| UI 컴포넌트 | Calendar |
| state | `selectedId` (날짜 문자열) |
| meta | 이전 선택: `movieId`, `theaterId` |

```json
{
  "stage": "date",
  "items": [
    { "id": "2026-02-04", "date": "2026-02-04", "dayOfWeek": "Tue", "available": true },
    { "id": "2026-02-05", "date": "2026-02-05", "dayOfWeek": "Wed", "available": true }
  ],
  "state": { "selectedId": "2026-02-05" },
  "modification": {},
  "meta": { "movieId": "m1", "theaterId": "t1" }
}
```

---

### 4. Time Stage
**목적**: 상영 시간(회차) 선택

| 항목 | 설명 |
|------|------|
| UI 컴포넌트 | ButtonGroup |
| state | `selectedId` (단일 선택) |
| meta | 이전 선택: `movieId`, `theaterId`, `date` |

```json
{
  "stage": "time",
  "items": [
    { "id": "s1", "time": "10:30", "availableSeats": 45 },
    { "id": "s2", "time": "14:00", "availableSeats": 32 },
    { "id": "s3", "time": "19:00", "availableSeats": 18 }
  ],
  "state": { "selectedId": "s3" },
  "modification": {},
  "meta": { "movieId": "m1", "theaterId": "t1", "date": "2026-02-05" }
}
```

---

### 5. Seat Stage
**목적**: 좌석 선택 (다중 선택 가능)

| 항목 | 설명 |
|------|------|
| UI 컴포넌트 | SeatMap |
| state | `selectedIds` (다중 선택, 배열) |
| meta | 좌석 배치 정보 (`rows`, `seatsPerRow`) |

```json
{
  "stage": "seat",
  "items": [
    { "id": "A1", "row": "A", "number": 1, "status": "available" },
    { "id": "A2", "row": "A", "number": 2, "status": "occupied" },
    { "id": "B1", "row": "B", "number": 1, "status": "available" }
  ],
  "state": { "selectedIds": ["A1", "B1"] },
  "modification": {},
  "meta": {
    "movieId": "m1", "theaterId": "t1", "date": "2026-02-05", "showtimeId": "s3",
    "rows": ["A", "B", "C"], "seatsPerRow": 5
  }
}
```

---

### 6. Ticket Stage
**목적**: 티켓 종류별 수량 선택

| 항목 | 설명 |
|------|------|
| UI 컴포넌트 | TicketCounter |
| state | `quantities` (종류별 수량) |
| meta | `maxTotal` = 선택한 좌석 수 |

```json
{
  "stage": "ticket",
  "items": [
    { "id": "adult", "name": "Adult", "price": 15000 },
    { "id": "youth", "name": "Youth", "price": 12000 }
  ],
  "state": {
    "quantities": { "adult": 2, "youth": 0 }
  },
  "modification": {},
  "meta": { "maxTotal": 2, "selectedSeats": ["A1", "B1"] }
}
```

---

### 7. Confirm Stage
**목적**: 예약 정보 최종 확인

| 항목 | 설명 |
|------|------|
| UI 컴포넌트 | BookingSummary |
| state | (없음) |
| meta | 전체 예약 정보 요약 |

```json
{
  "stage": "confirm",
  "items": [],
  "state": {},
  "modification": {},
  "meta": {
    "movie": { "id": "m1", "title": "Dune: Part Two" },
    "theater": { "id": "t1", "name": "CGV Gangnam" },
    "date": "2026-02-05",
    "time": "19:00",
    "seats": ["A1", "B1"],
    "tickets": [{ "type": "Adult", "quantity": 2, "price": 15000 }],
    "totalPrice": 30000
  }
}
```

---

### Stage별 state 요약

| Stage | state 필드 | 타입 | 설명 |
|-------|-----------|------|------|
| movie | `selectedId` | `string` | 선택한 영화 ID |
| theater | `selectedId` | `string` | 선택한 극장 ID |
| date | `selectedId` | `string` | 선택한 날짜 (YYYY-MM-DD) |
| time | `selectedId` | `string` | 선택한 상영 시간 ID |
| seat | `selectedIds` | `string[]` | 선택한 좌석 ID 배열 |
| ticket | `quantities` | `Record<string, number>` | 티켓 종류별 수량 |
| confirm | - | - | meta에 요약 정보만 포함 |
