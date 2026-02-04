/**
 * UI Spec Type Definitions
 *
 * Agent가 GUI 상태를 읽고(Perception) 조작(Modification)하기 위한 선언적 타입
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
// UI Spec
// =============================================================================

/**
 * UI Spec - Agent의 Perception 대상
 *
 * Agent는 이 Spec을 읽어 현재 GUI 상태를 파악하고,
 * Tool Call을 통해 modification을 적용할 수 있다.
 */
export interface UISpec<T = DataItem> {
  /** 현재 Stage */
  stage: Stage;

  /** 원본 데이터 아이템 목록 */
  items: T[];

  /** UI 상태 (선택, 수량 등) */
  state: StateModel;

  /** 현재 적용된 Modification 상태 */
  modification: ModificationState;

  /** Stage별 추가 메타데이터 */
  meta?: Record<string, unknown>;
}

// =============================================================================
// Data Item
// =============================================================================

/**
 * 모든 데이터 아이템의 기본 타입
 * 각 Stage의 items 배열에 들어가는 요소
 */
export interface DataItem {
  id: string;
  [key: string]: unknown;
}

// =============================================================================
// State Model
// =============================================================================

/**
 * UI 상태 - Stage별로 다른 필드 사용
 *
 * - movie, theater, date, time: selectedId (단일 선택)
 * - seat: selectedIds (다중 선택)
 * - ticket: quantities (티켓 종류별 수량)
 * - confirm: 없음 (meta에 요약 정보)
 */
export interface StateModel {
  /** 단일 선택된 아이템 ID (movie, theater, date, time) */
  selectedId?: string;

  /** 다중 선택된 아이템 ID 배열 (seat) */
  selectedIds?: string[];

  /** 티켓 종류별 수량 (ticket) */
  quantities?: Record<string, number>;
}

// =============================================================================
// Modification State
// =============================================================================

/**
 * Modification 상태
 *
 * Agent가 Tool Call로 적용한 modification들
 * visibleItems는 렌더링 시 items + modification에서 계산 (derived state)
 */
export interface ModificationState {
  filter?: FilterState;
  sort?: SortState;
  highlight?: HighlightState;
  augment?: AugmentState[];
}

/** Filter 설정 */
export interface FilterState {
  field: string;
  operator: FilterOperator;
  value: unknown;
}

export type FilterOperator =
  | 'eq'      // 같음
  | 'neq'     // 같지 않음
  | 'contains' // 포함 (배열 또는 문자열)
  | 'gt'      // 큼
  | 'lt'      // 작음
  | 'gte'     // 크거나 같음
  | 'lte'     // 작거나 같음
  | 'in';     // 값 목록에 포함

/** Sort 설정 */
export interface SortState {
  field: string;
  order: 'asc' | 'desc';
}

/** Highlight 설정 */
export interface HighlightState {
  itemIds: string[];
  style?: HighlightStyle;
}

export type HighlightStyle = 'border' | 'glow' | 'badge';

/** Augment 설정 - 아이템에 추가 필드 표시 */
export interface AugmentState {
  itemId: string;
  fields: Record<string, unknown>;
}

// =============================================================================
// Visible Item (렌더링용)
// =============================================================================

/**
 * 렌더링 시 사용되는 확장된 아이템 타입
 * getVisibleItems() 함수가 반환하는 타입
 */
export interface VisibleItem extends DataItem {
  /** highlight 적용 여부 */
  _highlighted?: boolean;

  /** highlight 스타일 */
  _highlightStyle?: HighlightStyle;

  /** augment로 추가된 필드들 */
  _augmented?: Record<string, unknown>;
}
