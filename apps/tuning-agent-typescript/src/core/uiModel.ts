export interface DisplayItemLike {
  id: string;
  value: string;
  isDisabled?: boolean;
}

export interface QuantityLike {
  item?: {
    id?: string;
    value?: string;
  };
  count?: number;
}

export interface UISpecLike {
  stage?: string;
  visibleItems?: DisplayItemLike[];
  state?: {
    selected?: { id?: string; value?: string };
    selectedList?: Array<{ id?: string; value?: string }>;
    quantities?: QuantityLike[];
  };
  meta?: Record<string, unknown>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function toUISpecLike(uiSpec: unknown): UISpecLike | null {
  if (!isRecord(uiSpec)) return null;
  return uiSpec as UISpecLike;
}

export function getEnabledVisibleItems(spec: UISpecLike): DisplayItemLike[] {
  const items = Array.isArray(spec.visibleItems) ? spec.visibleItems : [];
  return items.filter((item) => item && typeof item.id === 'string' && item.id && !item.isDisabled);
}

export function getSelectedId(spec: UISpecLike): string | null {
  const selected = spec.state?.selected;
  if (!selected || typeof selected.id !== 'string' || !selected.id) return null;
  return selected.id;
}

export function getSelectedListIds(spec: UISpecLike): string[] {
  const selectedList = Array.isArray(spec.state?.selectedList) ? spec.state?.selectedList : [];
  return selectedList
    .map((entry) => (typeof entry?.id === 'string' ? entry.id : ''))
    .filter((id) => id.length > 0);
}

export function getTicketQuantities(spec: UISpecLike): Array<{ typeId: string; count: number }> {
  const quantities = Array.isArray(spec.state?.quantities) ? spec.state?.quantities : [];
  return quantities
    .map((entry) => {
      const typeId = typeof entry?.item?.id === 'string' ? entry.item.id : '';
      const count = Number.isFinite(entry?.count) ? Number(entry?.count) : 0;
      return { typeId, count };
    })
    .filter((entry) => entry.typeId.length > 0 && Number.isInteger(entry.count) && entry.count >= 0);
}

export function getTicketMaxTotal(spec: UISpecLike): number {
  const maxTotal = spec.meta?.maxTotal;
  if (typeof maxTotal === 'number' && Number.isInteger(maxTotal) && maxTotal >= 0) {
    return maxTotal;
  }

  const selectedSeats = spec.meta?.selectedSeats;
  if (Array.isArray(selectedSeats)) {
    return selectedSeats.length;
  }
  return 0;
}
