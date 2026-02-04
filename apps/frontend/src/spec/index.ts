/**
 * UI Spec System
 *
 * LLM Agent가 GUI를 조작할 수 있도록 설계된 선언적 UI Spec 시스템
 *
 * @example
 * ```typescript
 * // 1. Spec 생성
 * const spec = generateMovieSpec(movies);
 *
 * // 2. Modification 적용 (Agent Tool Call)
 * const filtered = applyFilter(spec, { field: 'genre', operator: 'contains', value: 'Sci-Fi' });
 * const highlighted = applyHighlight(filtered, { itemIds: ['m1'], style: 'badge' });
 *
 * // 3. 렌더링 시 visible items 계산
 * const visibleItems = getVisibleItems(highlighted);
 * ```
 */

// Types
export type {
  Stage,
  UISpec,
  DataItem,
  StateModel,
  ModificationState,
  FilterState,
  FilterOperator,
  SortState,
  HighlightState,
  HighlightStyle,
  AugmentState,
  VisibleItem,
} from './types';

// Modifiers
export {
  applyFilter,
  applySort,
  applyHighlight,
  applyAugment,
  selectItem,
  selectItems,
  toggleItem,
  setQuantity,
  clearModification,
  getVisibleItems,
} from './modifiers';

// Generators
export type {
  MovieItem,
  TheaterItem,
  DateItem,
  TimeItem,
  SeatItem,
  TicketItem,
  ConfirmMeta,
} from './generators';

export {
  generateMovieSpec,
  generateTheaterSpec,
  generateDateSpec,
  createDateItems,
  generateTimeSpec,
  generateSeatSpec,
  generateTicketSpec,
  generateConfirmSpec,
} from './generators';
