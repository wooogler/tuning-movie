/**
 * Modifier Functions
 *
 * Deterministic 함수들 - 같은 입력 → 같은 출력
 * UISpec의 modification 상태를 업데이트하는 pure functions
 */

import type {
  UISpec,
  DataItem,
  FilterState,
  SortState,
  HighlightState,
  AugmentState,
  VisibleItem,
} from './types';

// =============================================================================
// Modification Functions
// =============================================================================

/**
 * Filter 적용 - modification.filter 설정
 */
export function applyFilter<T extends DataItem>(
  spec: UISpec<T>,
  params: FilterState
): UISpec<T> {
  return {
    ...spec,
    modification: { ...spec.modification, filter: params },
  };
}

/**
 * Sort 적용 - modification.sort 설정
 */
export function applySort<T extends DataItem>(
  spec: UISpec<T>,
  params: SortState
): UISpec<T> {
  return {
    ...spec,
    modification: { ...spec.modification, sort: params },
  };
}

/**
 * Highlight 적용 - modification.highlight 설정
 */
export function applyHighlight<T extends DataItem>(
  spec: UISpec<T>,
  params: HighlightState
): UISpec<T> {
  return {
    ...spec,
    modification: { ...spec.modification, highlight: params },
  };
}

/**
 * Augment 적용 - modification.augment 설정
 * 기존 augment에 추가하거나 새로 설정
 */
export function applyAugment<T extends DataItem>(
  spec: UISpec<T>,
  params: AugmentState[],
  replace = false
): UISpec<T> {
  const existingAugment = spec.modification.augment ?? [];
  const newAugment = replace ? params : [...existingAugment, ...params];

  return {
    ...spec,
    modification: { ...spec.modification, augment: newAugment },
  };
}

/**
 * 단일 아이템 선택 - state.selectedId 업데이트
 */
export function selectItem<T extends DataItem>(
  spec: UISpec<T>,
  itemId: string
): UISpec<T> {
  return {
    ...spec,
    state: { ...spec.state, selectedId: itemId },
  };
}

/**
 * 다중 아이템 선택 - state.selectedIds 업데이트
 */
export function selectItems<T extends DataItem>(
  spec: UISpec<T>,
  itemIds: string[]
): UISpec<T> {
  return {
    ...spec,
    state: { ...spec.state, selectedIds: itemIds },
  };
}

/**
 * 아이템 선택 토글 (다중 선택용)
 */
export function toggleItem<T extends DataItem>(
  spec: UISpec<T>,
  itemId: string
): UISpec<T> {
  const currentIds = spec.state.selectedIds ?? [];
  const newIds = currentIds.includes(itemId)
    ? currentIds.filter((id) => id !== itemId)
    : [...currentIds, itemId];

  return {
    ...spec,
    state: { ...spec.state, selectedIds: newIds },
  };
}

/**
 * 티켓 수량 설정 - state.quantities 업데이트
 */
export function setQuantity<T extends DataItem>(
  spec: UISpec<T>,
  typeId: string,
  quantity: number
): UISpec<T> {
  const currentQuantities = spec.state.quantities ?? {};
  return {
    ...spec,
    state: {
      ...spec.state,
      quantities: { ...currentQuantities, [typeId]: quantity },
    },
  };
}

/**
 * Modification 초기화
 * @param type - 특정 타입만 초기화하거나 'all'로 전체 초기화
 */
export function clearModification<T extends DataItem>(
  spec: UISpec<T>,
  type?: 'filter' | 'sort' | 'highlight' | 'augment' | 'all'
): UISpec<T> {
  if (type === 'all' || !type) {
    return { ...spec, modification: {} };
  }

  const newModification = { ...spec.modification };
  delete newModification[type];
  return { ...spec, modification: newModification };
}

// =============================================================================
// Visible Items Calculation (렌더링 시 호출)
// =============================================================================

/**
 * items + modification → visible items 계산
 *
 * 렌더링 시 호출되어 실제 표시할 아이템 목록 반환
 * - filter 적용
 * - sort 적용
 * - highlight/augment 플래그 추가
 */
export function getVisibleItems<T extends DataItem>(
  spec: UISpec<T>
): (T & Partial<VisibleItem>)[] {
  let result: any[] = spec.items.map((item) => ({ ...item }));

  // 1. Filter 적용
  if (spec.modification.filter) {
    result = applyFilterLogic(result, spec.modification.filter);
  }

  // 2. Sort 적용
  if (spec.modification.sort) {
    result = applySortLogic(result, spec.modification.sort);
  }

  // 3. Highlight 플래그 추가
  if (spec.modification.highlight) {
    const { itemIds, style } = spec.modification.highlight;
    result = result.map((item) => {
      if (itemIds.includes(item.id)) {
        return {
          ...item,
          _highlighted: true,
          _highlightStyle: style ?? 'border',
        };
      }
      return item;
    });
  }

  // 4. Augment 필드 추가
  if (spec.modification.augment) {
    const augmentMap = new Map(
      spec.modification.augment.map((a) => [a.itemId, a.fields])
    );
    result = result.map((item) => {
      const augmented = augmentMap.get(item.id);
      if (augmented) {
        return { ...item, _augmented: augmented };
      }
      return item;
    });
  }

  return result;
}

// =============================================================================
// Internal Logic Functions
// =============================================================================

function applyFilterLogic(
  items: VisibleItem[],
  filter: FilterState
): VisibleItem[] {
  const { field, operator, value } = filter;

  return items.filter((item) => {
    const itemValue = item[field];

    switch (operator) {
      case 'eq':
        return itemValue === value;
      case 'neq':
        return itemValue !== value;
      case 'contains':
        if (Array.isArray(itemValue)) {
          return itemValue.includes(value);
        }
        return String(itemValue).includes(String(value));
      case 'gt':
        return (itemValue as number) > (value as number);
      case 'lt':
        return (itemValue as number) < (value as number);
      case 'gte':
        return (itemValue as number) >= (value as number);
      case 'lte':
        return (itemValue as number) <= (value as number);
      case 'in':
        return Array.isArray(value) && value.includes(itemValue);
      default:
        return true;
    }
  });
}

function applySortLogic(items: VisibleItem[], sort: SortState): VisibleItem[] {
  const { field, order } = sort;

  return [...items].sort((a, b) => {
    const aVal = a[field];
    const bVal = b[field];

    let comparison: number;
    if (typeof aVal === 'string' && typeof bVal === 'string') {
      comparison = aVal.localeCompare(bVal);
    } else if (typeof aVal === 'number' && typeof bVal === 'number') {
      comparison = aVal - bVal;
    } else {
      comparison = String(aVal).localeCompare(String(bVal));
    }

    return order === 'asc' ? comparison : -comparison;
  });
}
