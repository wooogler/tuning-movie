/**
 * UI Spec Type Definitions
 *
 * Agent가 GUI 상태를 읽고(Perception) 조작(Modification)하기 위한 선언적 타입
 *
 * 핵심 원칙: Agent는 사람처럼 화면을 본다
 * - visibleItems: 화면에 보이는 것들
 * - state: 현재 상태 (DisplayItem으로 value 확인 + id로 액션)
 */

// =============================================================================
// Stage
// =============================================================================

export type Stage =
  | 'movie'
  | 'theater'
  | 'date'
  | 'time'
  | 'seat'
  | 'ticket'
  | 'confirm';

// =============================================================================
// Display Item (화면에 보이는 아이템)
// =============================================================================

/**
 * 화면에 표시되는 아이템
 *
 * Agent가 보는 것(value)과 액션에 사용할 것(id)을 함께 제공
 */
export interface DisplayItem {
  /** 아이템 ID (tool call용) */
  id: string;

  /** 화면에 표시되는 값 */
  value: string;

  /** 비활성화 여부 (예: 이미 예약된 좌석) */
  isDisabled?: boolean;
}

/**
 * 수량이 있는 아이템 (티켓용)
 */
export interface QuantityItem {
  item: DisplayItem;
  count: number;
}

export interface BookingTicketSelection {
  ticketTypeId: string;
  name: string;
  price: number;
  quantity: number;
}

export interface BookingContext {
  movie?: { id: string; title: string };
  theater?: { id: string; name: string };
  date?: string;
  showing?: { id: string; time: string };
  selectedSeats?: DisplayItem[];
  tickets?: BookingTicketSelection[];
}

// =============================================================================
// UI Spec
// =============================================================================

/**
 * UI Spec - Agent의 Perception 대상
 */
export interface UISpec<T = DataItem> {
  // --- Context (현재 어디인가) ---
  stage: Stage;
  title: string;
  description?: string;

  // --- Visible State (화면에 뭐가 보이는가) ---
  visibleItems: DisplayItem[];

  // --- State (현재 상태) ---
  /**
   * 현재 상태 - DisplayItem으로 제공
   * Agent가 value로 상태를 파악하고, id로 액션을 취할 수 있음
   */
  state: StateModel;

  // --- Source Data (원본 데이터) ---
  items: T[];

  // --- Modifications (적용된 변경사항) ---
  modification: ModificationState;

  // --- Display Config ---
  display: DisplayConfig;

  // --- Additional Info ---
  meta?: Record<string, unknown>;
}

// =============================================================================
// Display Config
// =============================================================================

export interface DisplayConfig {
  /** 기본적으로 표시되는 필드 (value 생성에 사용) */
  valueField: string;

  /** 렌더링 컴포넌트 타입 */
  component: 'buttonGroup' | 'calendar' | 'seatMap' | 'counter' | 'summary';
}

// =============================================================================
// Data Item
// =============================================================================

export interface DataItem {
  id: string;
  [key: string]: unknown;
}

// =============================================================================
// State Model
// =============================================================================

/**
 * 현재 상태
 *
 * 모든 상태가 DisplayItem으로 제공됨
 * - value: Agent가 화면에서 보는 것
 * - id: Agent가 액션할 때 사용하는 것
 */
export interface StateModel {
  /** 선택된 아이템 (단일 선택: movie, theater, date, time) */
  selected?: DisplayItem;

  /** 선택된 아이템들 (다중 선택: seat) */
  selectedList?: DisplayItem[];

  /** 하이라이트된 아이템들 */
  highlighted?: DisplayItem[];

  /** 티켓 수량 */
  quantities?: QuantityItem[];

  /** 예약 컨텍스트 (단일 source of truth) */
  booking?: BookingContext;
}

// =============================================================================
// Modification State
// =============================================================================

export interface ModificationState {
  filter?: FilterState;
  sort?: SortState;
  highlight?: HighlightState;
  augment?: AugmentState[];
}

export interface FilterState {
  field: string;
  operator: FilterOperator;
  value: unknown;
}

export type FilterOperator =
  | 'eq'
  | 'neq'
  | 'contains'
  | 'gt'
  | 'lt'
  | 'gte'
  | 'lte'
  | 'in';

export interface SortState {
  field: string;
  order: 'asc' | 'desc';
}

export interface HighlightState {
  itemIds: string[];
  style?: HighlightStyle;
}

export type HighlightStyle = 'border' | 'glow' | 'badge';

export interface AugmentState {
  itemId: string;
  value: string;
}

// =============================================================================
// Legacy Types (하위 호환성)
// =============================================================================

/**
 * @deprecated Use DisplayItem instead
 */
export interface VisibleItem extends DataItem {
  _highlighted?: boolean;
  _highlightStyle?: HighlightStyle;
  _augmented?: Record<string, unknown>;
}

/**
 * @deprecated No longer used - state contains everything needed
 */
export interface InternalState {
  selectedId?: string;
  selectedIds?: string[];
  quantities?: Record<string, number>;
}
