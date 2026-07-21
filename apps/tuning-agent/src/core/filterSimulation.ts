import type { FilterExpression } from '../types';
import { parseDurationMinutes } from './timeUtils';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseTimeToMinutes(value: unknown): number | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  const match = trimmed.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const hours = Number.parseInt(match[1], 10);
  const minutes = Number.parseInt(match[2], 10);
  if (!Number.isInteger(hours) || !Number.isInteger(minutes)) return null;
  return hours * 60 + minutes;
}

function getItemFieldValue(item: Record<string, unknown>, field: string, valueField: string): unknown {
  if (field === 'value') {
    return item[valueField];
  }
  return item[field];
}

function getComparableValue(field: string, rawValue: unknown, valueField: string): unknown {
  const effectiveField = field === 'value' ? valueField : field;
  if (effectiveField === 'rating') {
    const parsed = typeof rawValue === 'number' ? rawValue : Number.parseFloat(String(rawValue));
    return Number.isFinite(parsed) ? parsed : rawValue;
  }
  if (effectiveField === 'duration') {
    return typeof rawValue === 'string' ? (parseDurationMinutes(rawValue) ?? rawValue) : rawValue;
  }
  if (effectiveField === 'time') {
    return parseTimeToMinutes(rawValue) ?? rawValue;
  }
  return rawValue;
}

function matchesFilter(item: Record<string, unknown>, filter: FilterExpression, valueField: string): boolean {
  const itemValue = getItemFieldValue(item, filter.field, valueField);
  const comparableItemValue = getComparableValue(filter.field, itemValue, valueField);
  const comparableFilterValue = getComparableValue(filter.field, filter.value, valueField);

  switch (filter.operator) {
    case 'eq':
      return itemValue === filter.value;
    case 'neq':
      return itemValue !== filter.value;
    case 'contains':
      if (Array.isArray(itemValue)) {
        return itemValue.includes(filter.value);
      }
      return String(itemValue).includes(String(filter.value));
    case 'gt':
      if (typeof comparableItemValue === 'number' && typeof comparableFilterValue === 'number') {
        return comparableItemValue > comparableFilterValue;
      }
      return String(comparableItemValue).localeCompare(String(comparableFilterValue)) > 0;
    case 'lt':
      if (typeof comparableItemValue === 'number' && typeof comparableFilterValue === 'number') {
        return comparableItemValue < comparableFilterValue;
      }
      return String(comparableItemValue).localeCompare(String(comparableFilterValue)) < 0;
    case 'gte':
      if (typeof comparableItemValue === 'number' && typeof comparableFilterValue === 'number') {
        return comparableItemValue >= comparableFilterValue;
      }
      return String(comparableItemValue).localeCompare(String(comparableFilterValue)) >= 0;
    case 'lte':
      if (typeof comparableItemValue === 'number' && typeof comparableFilterValue === 'number') {
        return comparableItemValue <= comparableFilterValue;
      }
      return String(comparableItemValue).localeCompare(String(comparableFilterValue)) <= 0;
    case 'in':
      return Array.isArray(filter.value) && filter.value.includes(itemValue);
    default:
      return true;
  }
}

function isSelectableItem(item: Record<string, unknown>): boolean {
  if (item.available === false) return false;
  if (typeof item.status === 'string' && item.status !== 'available') return false;
  return true;
}

export function applyFilterExpressions(
  items: Record<string, unknown>[],
  filters: FilterExpression[],
  valueField: string
): Record<string, unknown>[] {
  let filtered = items.filter(isRecord).map((item) => ({ ...item }));
  for (const filter of filters) {
    filtered = filtered.filter((item) => matchesFilter(item, filter, valueField));
  }
  return filtered;
}

export function countSelectableFilteredItems(
  items: Record<string, unknown>[],
  filters: FilterExpression[],
  valueField: string
): number {
  return applyFilterExpressions(items, filters, valueField).filter(isSelectableItem).length;
}
