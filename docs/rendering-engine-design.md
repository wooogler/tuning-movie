# Rendering Engine Design

A2UI에서 영감을 받은, React 기반 선언적 UI 렌더링 엔진 설계 문서.

## 1. 아키텍처 개요

현재 프론트엔드는 **Backend API → React JSX** 직접 렌더링 방식이다.
이를 중간 표현(IR: Intermediate Representation)을 거치는 3-레이어 구조로 변경한다.

```
┌──────────┐      ┌──────────────┐      ┌──────────────┐      ┌────────────┐
│ Backend  │ ───> │  Converter   │ ───> │   UI Spec    │ ───> │  Renderer  │
│   API    │ JSON │ (API → Spec) │      │ (IR: JSON)   │      │ (Spec →    │
│          │      │              │      │              │      │  React)    │
└──────────┘      └──────────────┘      └──────────────┘      └────────────┘
  기존 유지          새로 추가             중간 표현값           새로 추가
```

### 각 레이어의 책임

| 레이어 | 위치 | 역할 |
|--------|------|------|
| **Backend API** | `apps/backend` | 데이터 제공 (변경 없음) |
| **Converter** | `apps/frontend/src/converter/` | API 응답 → UI Spec 변환 |
| **UI Spec** | TypeScript 타입 | 선언적 중간 표현 (JSON 구조체) |
| **Renderer** | `apps/frontend/src/renderer/` | UI Spec → React 컴포넌트 렌더링 |

### 현재 vs 변경 후 데이터 흐름

**현재 (직접 렌더링):**
```
MovieStagePage: api.getMovies() → movies.map(m => <div>...</div>)
```

**변경 후 (IR 경유):**
```
MovieStagePage: api.getMovies() → convertMovieStage(movies) → <SpecRenderer spec={spec} />
```

---

## 2. UI Spec 포맷

A2UI의 핵심 설계를 차용하되, React에 맞게 단순화한다.

### 2.1 설계 원칙

- **플랫 컴포넌트 리스트**: A2UI처럼 트리 중첩 대신 ID 참조 (adjacency list)
- **구조 / 데이터 / 상태 분리**: `components` (레이아웃) ↔ `dataModel` (서버 데이터) ↔ `state` (UI 상태)
- **데이터 바인딩**: JSON Pointer 경로(`/movies/0/title`)로 데이터 참조
- **상태 바인딩**: `$state/` 접두사로 UI 상태 참조 (`$state/selectedMovieId`)
- **도메인 특화 컴포넌트**: 범용 컴포넌트 + 영화 예매 전용 컴포넌트

> **A2UI와의 차이점**: A2UI는 `dataModel` 하나에 모든 데이터를 담는다.
> 우리는 서버에서 온 데이터(`dataModel`)와 클라이언트 상호작용으로 생긴 상태(`state`)를
> 명시적으로 분리한다. 이 분리는 나중에 state 변화를 별도로 추적하거나
> 외부 시스템에 전달할 때 유용해진다.

### 2.2 Spec 타입 정의

```typescript
// UI Spec의 최상위 구조
interface UISpec {
  surface: string;           // 화면 식별자 (e.g., "movie_select")
  components: Component[];   // 플랫 컴포넌트 리스트
  dataModel: Record<string, unknown>; // 데이터
  actions?: ActionMap;       // 이벤트 핸들러 매핑
}

// 컴포넌트 정의
interface Component {
  id: string;                // 고유 ID (root 필수)
  type: string;              // 컴포넌트 타입명
  children?: string[];       // 자식 컴포넌트 ID 배열
  child?: string;            // 단일 자식 (Card 등)
  props?: Record<string, unknown>; // 정적 속성
  data?: DataBinding;        // 데이터 바인딩
}

// 데이터 바인딩
type DataBinding =
  | { path: string }                    // 절대 경로: "/movies/0/title"
  | { each: string; template: string }; // 반복: each="/movies", template="movie_card_tpl"

// 액션 매핑
interface ActionMap {
  [actionName: string]: {
    type: 'navigate' | 'store' | 'api';
    payload: Record<string, unknown>;
  };
}
```

### 2.3 실제 예시: Movie Select Stage

**Backend API 응답:**
```json
{
  "movies": [
    { "id": "m1", "title": "Dune: Part Two", "posterUrl": "...", "genre": ["Sci-Fi"], "duration": 166, "rating": "PG-13" },
    { "id": "m2", "title": "Oppenheimer", "posterUrl": "...", "genre": ["Drama"], "duration": 180, "rating": "R" }
  ]
}
```

**변환된 UI Spec:**
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

### 2.4 실제 예시: Seat Select Stage

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

## 3. 컴포넌트 카탈로그

### 3.1 범용 레이아웃 컴포넌트

| 타입 | 설명 | 주요 props |
|------|------|-----------|
| `Column` | 세로 배치 | `align`, `justify`, `gap` |
| `Row` | 가로 배치 | `align`, `justify`, `gap` |
| `Grid` | 그리드 배치 | `columns`, `gap` |
| `Card` | 카드 컨테이너 | `child`, `onClick` |
| `Text` | 텍스트 표시 | `text`, `variant` (h1~h5, body, caption) |
| `Image` | 이미지 표시 | `src`, `alt`, `fit` |
| `Button` | 버튼 | `label`, `variant` (primary, secondary), `action` |
| `TextField` | 텍스트 입력 | `label`, `value`, `placeholder` |

### 3.2 도메인 특화 컴포넌트

| 타입 | 설명 | 바인딩 데이터 |
|------|------|-------------|
| `MovieCard` | 포스터 + 제목 + 장르 + 러닝타임 | `Movie` |
| `TheaterCard` | 극장명 + 위치 + 스크린 수 | `Theater` |
| `DatePicker` | 날짜 선택 카드 그리드 | `string[]` (dates) |
| `TimePicker` | 시간 + 스크린 + 잔여석 | `Showing[]` |
| `SeatMap` | 좌석 배치도 (행/열 그리드) | `Seat[]` |
| `SeatLegend` | 좌석 유형 범례 | (없음, 정적) |
| `ScreenIndicator` | "SCREEN" 표시 | (없음, 정적) |
| `TicketCounter` | 티켓 종류 + 수량 +/- | `TicketType` |
| `BookingSummary` | 예매 요약 정보 | 전체 booking state |
| `ActionBar` | Back / Continue 버튼 | `back`, `next` |
| `ConfirmForm` | 이름 + 이메일 입력 폼 | `customerName`, `customerEmail` |
| `BookingResult` | 예매 완료 화면 | `Booking` |

---

## 4. Converter 레이어

각 스테이지별로 **Backend API 응답 → UI Spec** 변환 함수를 작성한다.

### 4.1 파일 구조

```
apps/frontend/src/converter/
├── index.ts              # 배럴 export
├── types.ts              # UISpec, Component, DataBinding 타입
├── movieStage.ts         # convertMovieStage(movies) → UISpec
├── theaterStage.ts       # convertTheaterStage(theaters) → UISpec
├── dateStage.ts          # convertDateStage(dates) → UISpec
├── timeStage.ts          # convertTimeStage(showings) → UISpec
├── seatStage.ts          # convertSeatStage(seats) → UISpec
├── ticketStage.ts        # convertTicketStage(ticketTypes, selectedSeats) → UISpec
└── confirmStage.ts       # convertConfirmStage(bookingState) → UISpec
```

### 4.2 변환 함수 인터페이스

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

## 5. Renderer 엔진

UI Spec을 받아 React 컴포넌트로 렌더링하는 엔진.

### 5.1 파일 구조

```
apps/frontend/src/renderer/
├── index.ts              # <SpecRenderer /> export
├── SpecRenderer.tsx      # 메인 렌더러 (spec → React tree)
├── resolveData.ts        # 데이터 바인딩 해석 (JSON Pointer)
├── registry.ts           # 컴포넌트 레지스트리
└── components/           # 렌더러용 React 컴포넌트
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

### 5.2 핵심: SpecRenderer

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

    // 데이터 바인딩 해석
    const resolvedData = comp.data
      ? resolveData(comp.data, spec.dataModel)
      : undefined;

    // 자식 렌더링
    let renderedChildren: ReactNode = null;

    if (Array.isArray(comp.children)) {
      // 정적 자식: ["child1", "child2"]
      renderedChildren = comp.children.map(childId => renderComponent(childId));
    } else if (comp.children && 'each' in comp.children) {
      // 반복 자식: { each: "/movies", template: "card_tpl" }
      const items = resolveData({ path: comp.children.each }, spec.dataModel) as unknown[];
      renderedChildren = items.map((item, i) =>
        renderComponent(comp.children.template, { ...spec.dataModel, _item: item, _index: i })
      );
    }

    // 레지스트리에서 React 컴포넌트 조회
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

### 5.3 컴포넌트 레지스트리

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

// 초기 등록
import { Grid } from './components/layout/Grid';
import { MovieCard } from './components/domain/MovieCard';
// ...

registerComponent('Grid', Grid);
registerComponent('MovieCard', MovieCard);
// ...
```

### 5.4 데이터 바인딩 해석

```typescript
// renderer/resolveData.ts

// JSON Pointer 해석: "/movies/0/title" → dataModel.movies[0].title
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

## 6. 변경 후 Stage 페이지 (사용 예시)

```typescript
// pages/MovieStagePage.tsx (변경 후)
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

## 7. 구현 순서

### Phase 1: 코어 인프라
1. `converter/types.ts` — UISpec, Component, DataBinding 타입 정의
2. `renderer/resolveData.ts` — JSON Pointer 데이터 바인딩 해석
3. `renderer/registry.ts` — 컴포넌트 레지스트리
4. `renderer/SpecRenderer.tsx` — 메인 렌더러

### Phase 2: 범용 컴포넌트
5. `Column`, `Row`, `Grid`, `Card` 레이아웃 컴포넌트
6. `Text`, `Image`, `Button`, `TextField` 기본 컴포넌트

### Phase 3: 도메인 컴포넌트 + Converter
7. `MovieCard` + `convertMovieStage` → MovieStagePage 적용
8. `TheaterCard` + `convertTheaterStage` → TheaterStagePage 적용
9. `DatePicker` + `convertDateStage` → DateStagePage 적용
10. `TimePicker` + `convertTimeStage` → TimeStagePage 적용
11. `SeatMap` + `SeatLegend` + `ScreenIndicator` + `convertSeatStage` → SeatStagePage 적용
12. `TicketCounter` + `convertTicketStage` → TicketStagePage 적용
13. `ConfirmForm` + `BookingResult` + `convertConfirmStage` → ConfirmPage 적용
14. `ActionBar`, `BookingSummary` — 공통 컴포넌트

### Phase 4: 리팩토링 및 개선
15. 기존 Stage 페이지에서 직접 렌더링 코드 제거
16. 에러/로딩 상태를 위한 spec 확장 (optional)
17. Storybook 또는 별도 도구로 spec → UI 미리보기 (optional)

---

## 8. A2UI와의 비교 요약

| 항목 | A2UI | 우리 구현 |
|------|------|----------|
| 프레임워크 | Lit (Web Components) | React |
| 메시지 전송 | 서버 → 클라이언트 스트리밍 | 프론트엔드 내부 변환 |
| 컴포넌트 구조 | 플랫 리스트 + ID 참조 | 동일 |
| 데이터 바인딩 | JSON Pointer (`/path`) | 동일 |
| 구조/데이터 분리 | `updateComponents` / `updateDataModel` | `components` / `dataModel` |
| 컴포넌트 카탈로그 | 범용 18개 + 커스텀 카탈로그 | 범용 8개 + 도메인 11개 |
| 확장성 | Custom Catalog + Registry | Registry 패턴 |
| 복잡도 | 높음 (스트리밍, Surface 관리) | 낮음 (동기 변환) |
