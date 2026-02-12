/**
 * Modifier Functions
 *
 * Deterministic 함수들 - 같은 입력 → 같은 출력
 * UISpec의 state와 modification을 업데이트하는 pure functions
 */

import type {
  UISpec,
  DataItem,
  DisplayItem,
  QuantityItem,
  FilterState,
  SortState,
  HighlightState,
  AugmentState,
} from './types';

// =============================================================================
// Visible Items Computation
// =============================================================================

/**
 * items + modification → visibleItems 계산
 */
export function computeVisibleItems<T extends DataItem>(
  spec: UISpec<T>
): DisplayItem[] {
  const { items, modification, display } = spec;
  const valueField = display.valueField;

  // 1. Filter 적용
  let filteredItems = [...items];
  if (modification.filter) {
    filteredItems = applyFilterLogic(filteredItems, modification.filter);
  }

  // 2. Sort 적용
  if (modification.sort) {
    filteredItems = applySortLogic(filteredItems, modification.sort);
  }

  // 3. Augment 맵 생성
  const augmentMap = new Map<string, AugmentState>();
  if (modification.augment) {
    modification.augment.forEach((a) => augmentMap.set(a.itemId, a));
  }

  // 4. DisplayItem 생성
  return filteredItems.map((item) => {
    let value = String(item[valueField] ?? item.id);

    // Augment 적용 - value 직접 교체
    const augment = augmentMap.get(item.id);
    if (augment) {
      value = augment.value;
    }

    const displayItem: DisplayItem = { id: item.id, value };

    // Disabled 상태
    if ('status' in item && item.status === 'occupied') {
      displayItem.isDisabled = true;
    }

    return displayItem;
  });
}

/**
 * ID → DisplayItem 맵 생성 헬퍼
 */
function createDisplayItemMap<T extends DataItem>(
  spec: UISpec<T>,
  visibleItems: DisplayItem[]
): Map<string, DisplayItem> {
  const map = new Map<string, DisplayItem>();
  const valueField = spec.display.valueField;

  visibleItems.forEach((item) => map.set(item.id, item));

  // visibleItems에 없는 아이템은 원본에서 생성
  spec.items.forEach((item) => {
    if (!map.has(item.id)) {
      map.set(item.id, {
        id: item.id,
        value: String(item[valueField] ?? item.id),
      });
    }
  });

  return map;
}

/**
 * modification.highlight → state.highlighted 동기화
 */
function syncHighlighted<T extends DataItem>(
  spec: UISpec<T>,
  visibleItems: DisplayItem[]
): DisplayItem[] | undefined {
  const highlightIds = spec.modification.highlight?.itemIds;
  if (!highlightIds || highlightIds.length === 0) return undefined;

  const map = createDisplayItemMap(spec, visibleItems);
  return highlightIds
    .map((id) => map.get(id))
    .filter((item): item is DisplayItem => item !== undefined);
}

/**
 * Spec 업데이트 후 visibleItems 재계산 및 highlighted 동기화
 */
export function refreshSpec<T extends DataItem>(spec: UISpec<T>): UISpec<T> {
  const visibleItems = computeVisibleItems(spec);
  const highlighted = syncHighlighted(spec, visibleItems);

  return {
    ...spec,
    visibleItems,
    state: {
      ...spec.state,
      highlighted,
    },
  };
}

/**
 * @deprecated Use refreshSpec instead
 */
export function refreshVisibleItems<T extends DataItem>(
  spec: UISpec<T>
): UISpec<T> {
  return refreshSpec(spec);
}

// =============================================================================
// Selection Functions
// =============================================================================

/**
 * 단일 아이템 선택
 */
export function selectItem<T extends DataItem>(
  spec: UISpec<T>,
  itemId: string
): UISpec<T> {
  const visibleItems = spec.visibleItems;
  const map = createDisplayItemMap(spec, visibleItems);
  const displayItem = map.get(itemId);

  return {
    ...spec,
    state: {
      ...spec.state,
      selected: displayItem,
    },
  };
}

/**
 * 다중 아이템 선택
 */
export function selectItems<T extends DataItem>(
  spec: UISpec<T>,
  itemIds: string[]
): UISpec<T> {
  const visibleItems = spec.visibleItems;
  const map = createDisplayItemMap(spec, visibleItems);

  const selectedList = itemIds
    .map((id) => map.get(id))
    .filter((item): item is DisplayItem => item !== undefined);

  return {
    ...spec,
    state: {
      ...spec.state,
      selectedList,
    },
  };
}

/**
 * 아이템 선택 토글 (다중 선택용)
 */
export function toggleItem<T extends DataItem>(
  spec: UISpec<T>,
  itemId: string
): UISpec<T> {
  const currentList = spec.state.selectedList ?? [];
  const currentIds = currentList.map((item) => item.id);

  const newIds = currentIds.includes(itemId)
    ? currentIds.filter((id) => id !== itemId)
    : [...currentIds, itemId];

  return selectItems(spec, newIds);
}

/**
 * 티켓 수량 설정
 */
export function setQuantity<T extends DataItem>(
  spec: UISpec<T>,
  typeId: string,
  count: number
): UISpec<T> {
  const visibleItems = spec.visibleItems;
  const map = createDisplayItemMap(spec, visibleItems);
  const displayItem = map.get(typeId);

  if (!displayItem) return spec;

  const currentQuantities = spec.state.quantities ?? [];

  // 기존 항목 찾기
  const existingIndex = currentQuantities.findIndex(
    (q) => q.item.id === typeId
  );

  let newQuantities: QuantityItem[];

  if (existingIndex >= 0) {
    // 기존 항목 업데이트
    newQuantities = currentQuantities.map((q, i) =>
      i === existingIndex ? { item: displayItem, count } : q
    );
  } else {
    // 새 항목 추가
    newQuantities = [...currentQuantities, { item: displayItem, count }];
  }

  return {
    ...spec,
    state: {
      ...spec.state,
      quantities: newQuantities,
    },
  };
}

// =============================================================================
// Modification Functions
// =============================================================================

/**
 * Filter 적용
 */
export function applyFilter<T extends DataItem>(
  spec: UISpec<T>,
  params: FilterState
): UISpec<T> {
  const newSpec = {
    ...spec,
    modification: { ...spec.modification, filter: params },
  };
  return refreshSpec(newSpec);
}

/**
 * Sort 적용
 */
export function applySort<T extends DataItem>(
  spec: UISpec<T>,
  params: SortState
): UISpec<T> {
  const newSpec = {
    ...spec,
    modification: { ...spec.modification, sort: params },
  };
  return refreshSpec(newSpec);
}

/**
 * Highlight 적용
 */
export function applyHighlight<T extends DataItem>(
  spec: UISpec<T>,
  params: HighlightState
): UISpec<T> {
  const newSpec = {
    ...spec,
    modification: { ...spec.modification, highlight: params },
  };
  return refreshSpec(newSpec);
}

/**
 * Augment 적용
 */
export function applyAugment<T extends DataItem>(
  spec: UISpec<T>,
  params: AugmentState[],
  replace = false
): UISpec<T> {
  const existingAugment = spec.modification.augment ?? [];
  const newAugment = replace ? params : [...existingAugment, ...params];

  const newSpec = {
    ...spec,
    modification: { ...spec.modification, augment: newAugment },
  };
  return refreshSpec(newSpec);
}

/**
 * Modification 초기화
 */
export function clearModification<T extends DataItem>(
  spec: UISpec<T>,
  type?: 'filter' | 'sort' | 'highlight' | 'augment' | 'all'
): UISpec<T> {
  let newSpec: UISpec<T>;

  if (type === 'all' || !type) {
    newSpec = { ...spec, modification: {} };
  } else {
    const newModification = { ...spec.modification };
    delete newModification[type];
    newSpec = { ...spec, modification: newModification };
  }

  return refreshSpec(newSpec);
}

// =============================================================================
// Internal Logic Functions
// =============================================================================

function applyFilterLogic<T extends DataItem>(
  items: T[],
  filter: FilterState
): T[] {
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

function applySortLogic<T extends DataItem>(items: T[], sort: SortState): T[] {
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

// =============================================================================
// Legacy Support
// =============================================================================

/**
 * @deprecated Use computeVisibleItems instead
 */
export function getVisibleItems<T extends DataItem>(
  spec: UISpec<T>
): DisplayItem[] {
  return computeVisibleItems(spec);
}
