# Rendering Engine 구현 요약

## 아키텍처 개요

```
Backend API → Page(data fetch) → Converter(data → UISpec) → SpecRenderer(UISpec → React) → DOM
```

기존 방식에서는 각 페이지가 API 데이터를 직접 JSX로 렌더링했지만, 이제는 **선언적 UI Spec**을 중간 표현(IR)으로 사용합니다.

## 디렉토리 구조

```
apps/frontend/src/
├── converter/                    # API 데이터 → UI Spec 변환
│   ├── types.ts                  # UISpec, Component, DataBinding 타입
│   ├── index.ts                  # 배럴 익스포트
│   ├── movieStage.ts             # 영화 선택 스펙
│   ├── theaterStage.ts           # 극장 선택 스펙
│   ├── dateStage.ts              # 날짜 선택 스펙
│   ├── timeStage.ts              # 시간 선택 스펙
│   ├── seatStage.ts              # 좌석 선택 스펙
│   ├── ticketStage.ts            # 티켓 선택 스펙
│   └── confirmStage.ts           # 예약 확인 스펙
│
├── renderer/                     # UI Spec → React 렌더링
│   ├── index.ts                  # 배럴 익스포트
│   ├── SpecRenderer.tsx          # 메인 렌더러
│   ├── registry.ts               # 컴포넌트 레지스트리
│   ├── resolveData.ts            # JSON Pointer 데이터 바인딩
│   └── components/
│       ├── layout/               # 레이아웃 컴포넌트
│       │   ├── Column.tsx
│       │   ├── Row.tsx
│       │   ├── Grid.tsx
│       │   └── Card.tsx
│       ├── base/                 # 기본 컴포넌트
│       │   ├── Text.tsx
│       │   ├── Image.tsx
│       │   ├── Button.tsx
│       │   └── TextField.tsx
│       └── domain/               # 도메인 컴포넌트
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
└── pages/                        # 각 페이지 (수정됨)
    ├── MovieStagePage.tsx
    ├── TheaterStagePage.tsx
    ├── DateStagePage.tsx
    ├── TimeStagePage.tsx
    ├── SeatStagePage.tsx
    ├── TicketStagePage.tsx
    └── ConfirmPage.tsx
```

## 핵심 타입 정의

### UISpec (converter/types.ts)

```typescript
interface UISpec {
  surface: string;                        // 화면 식별자
  components: Component[];                // 플랫 컴포넌트 리스트
  dataModel: Record<string, unknown>;     // 서버 데이터 (읽기 전용)
  state?: StateModel;                     // UI 상태 (읽기/쓰기)
  actions?: Record<string, Action>;       // 액션 정의
}

interface Component {
  id: string;                             // 고유 ID
  type: string;                           // 컴포넌트 타입 (레지스트리 키)
  children?: string[] | IteratorBinding;  // 자식 컴포넌트
  props?: Record<string, unknown>;        // 컴포넌트 props
  data?: DataBinding;                     // 데이터 바인딩
  when?: StateBinding;                    // 조건부 렌더링
}

interface DataBinding {
  path: string;                           // JSON Pointer (예: "/movies/0/title")
}

interface IteratorBinding {
  each: string;                           // 반복할 배열 경로
  template: string;                       // 템플릿 컴포넌트 ID
}
```

## 데이터 흐름

### 1. 페이지에서 API 호출
```typescript
// MovieStagePage.tsx
const [spec, setSpec] = useState<UISpec | null>(null);

useEffect(() => {
  api.getMovies()
    .then((data) => setSpec(convertMovieStage(data.movies)));
}, []);
```

### 2. Converter가 UISpec 생성
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

### 3. SpecRenderer가 React로 렌더링
```typescript
// 페이지에서 사용
<SpecRenderer spec={spec} onAction={handleAction} />
```

### 4. 액션 처리
```typescript
const handleAction = (actionName: string, data?: unknown) => {
  if (actionName === 'selectMovie') {
    setMovie(data as Movie);
    navigate('/theater');
  }
};
```

## 컴포넌트 레지스트리

```typescript
// renderer/registry.ts
const registry = new Map<string, RendererComponent>();

// 레이아웃
registry.set('Column', Column);
registry.set('Row', Row);
registry.set('Grid', Grid);
registry.set('Card', Card);

// 기본
registry.set('Text', Text);
registry.set('Image', Image);
registry.set('Button', Button);
registry.set('TextField', TextField);

// 도메인
registry.set('MovieCard', MovieCard);
registry.set('TheaterCard', TheaterCard);
// ... 등등
```

## SpecRenderer 동작 원리

1. **컴포넌트 맵 구축**: 플랫 리스트를 ID → Component 맵으로 변환
2. **root부터 재귀 렌더링**: `renderComponent('root')` 호출
3. **데이터 바인딩 해석**: `resolveData()`로 JSON Pointer 경로 해석
4. **자식 처리**:
   - 정적 자식: `["child1", "child2"]` → 각각 `renderComponent()` 호출
   - 반복 자식: `{ each: "/movies", template: "card_tpl" }` → 배열 순회하며 템플릿 렌더링
5. **레지스트리에서 컴포넌트 조회**: `getComponent(comp.type)`
6. **React 엘리먼트 생성**: props, data, onAction 전달

## A2UI와의 차이점

| 항목 | A2UI | 우리 구현 |
|------|------|----------|
| 프레임워크 | Lit Web Components | React |
| 상태 관리 | dataModel만 사용 | dataModel + state 분리 |
| 컴포넌트 | 18개 표준 + 커스텀 | 레이아웃 4 + 기본 4 + 도메인 12 |
| 데이터 소스 | LLM 스트리밍 | REST API |
| 바인딩 | `/` prefix | `/` (dataModel), `$state/` (state) |

## 장점

1. **관심사 분리**: 데이터 변환(Converter)과 렌더링(Renderer) 분리
2. **선언적 UI**: JSON 형태의 UI 명세로 렌더링 로직 추상화
3. **확장성**: 새 컴포넌트는 레지스트리에 추가만 하면 됨
4. **테스트 용이**: UISpec은 순수 데이터이므로 검증 쉬움
5. **디버깅**: 중간 표현(UISpec)을 콘솔에서 확인 가능

## 사용 예시

```typescript
// 새 페이지 추가 시
// 1. converter 함수 작성
export function convertNewStage(data: SomeData): UISpec {
  return {
    surface: 'new_stage',
    components: [...],
    dataModel: { data },
  };
}

// 2. 필요시 도메인 컴포넌트 추가
export function NewComponent({ data, onAction }: Props) { ... }
registry.set('NewComponent', NewComponent);

// 3. 페이지에서 사용
const spec = convertNewStage(apiData);
return <SpecRenderer spec={spec} onAction={handleAction} />;
```
