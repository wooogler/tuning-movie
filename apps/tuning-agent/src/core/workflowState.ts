export type WorkflowStage = 'movie' | 'theater' | 'date' | 'time' | 'seat' | 'confirm';

export const WORKFLOW_STAGE_ORDER: WorkflowStage[] = [
  'movie',
  'theater',
  'date',
  'time',
  'seat',
  'confirm',
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readTrimmedString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function copyRecord(value: Record<string, unknown>): Record<string, unknown> {
  return { ...value };
}

function fallbackSelectedRecord(selected: Record<string, unknown> | null): Record<string, unknown> | null {
  if (!selected) return null;
  const id = readTrimmedString(selected.id);
  const value = readTrimmedString(selected.value);
  if (!id && !value) return null;
  return {
    ...(id ? { id } : {}),
    ...(value ? { value } : {}),
  };
}

function findSelectedItemFromSpec(spec: Record<string, unknown>): Record<string, unknown> | null {
  const state = isRecord(spec.state) ? spec.state : null;
  const selected = state && isRecord(state.selected) ? state.selected : null;
  const selectedId = readTrimmedString(selected?.id);
  const items = Array.isArray(spec.items) ? spec.items : [];

  if (selectedId) {
    for (const rawItem of items) {
      const item = isRecord(rawItem) ? rawItem : null;
      if (!item) continue;
      if (readTrimmedString(item.id) === selectedId) {
        return copyRecord(item);
      }
    }
  }

  return fallbackSelectedRecord(selected);
}

function findSelectedItemsFromSpec(spec: Record<string, unknown>): Record<string, unknown>[] {
  const state = isRecord(spec.state) ? spec.state : null;
  const selectedList = state && Array.isArray(state.selectedList) ? state.selectedList : [];
  const selectedIds = selectedList
    .map((entry) => (isRecord(entry) ? entry : null))
    .map((entry) => readTrimmedString(entry?.id))
    .filter((id): id is string => Boolean(id));
  if (selectedIds.length === 0) return [];

  const items = Array.isArray(spec.items) ? spec.items : [];
  const itemById = new Map<string, Record<string, unknown>>();
  for (const rawItem of items) {
    const item = isRecord(rawItem) ? rawItem : null;
    if (!item) continue;
    const id = readTrimmedString(item.id);
    if (id) itemById.set(id, copyRecord(item));
  }

  const resolved: Record<string, unknown>[] = [];
  for (const id of selectedIds) {
    const matched = itemById.get(id);
    if (matched) {
      resolved.push(matched);
      continue;
    }
    const fallback = selectedList
      .map((entry) => (isRecord(entry) ? entry : null))
      .find((entry) => readTrimmedString(entry?.id) === id);
    if (fallback) {
      const fallbackRecord = fallbackSelectedRecord(fallback);
      if (fallbackRecord) resolved.push(fallbackRecord);
    }
  }
  return resolved;
}

function stageIndex(stage: WorkflowStage): number {
  return WORKFLOW_STAGE_ORDER.indexOf(stage);
}

function assignWorkflowSelection(
  state: Record<string, unknown>,
  stage: WorkflowStage,
  selection: Record<string, unknown>[] | Record<string, unknown>
): void {
  switch (stage) {
    case 'movie':
      state.movie = selection;
      break;
    case 'theater':
      state.theater = selection;
      break;
    case 'date':
      state.date = selection;
      break;
    case 'time':
      state.showing = selection;
      break;
    case 'seat':
      state.seats = selection;
      break;
    default:
      break;
  }
}

export function toWorkflowStage(value: string | null | undefined): WorkflowStage | null {
  switch (value) {
    case 'movie':
    case 'theater':
    case 'date':
    case 'time':
    case 'seat':
    case 'confirm':
      return value;
    default:
      return null;
  }
}

export function buildWorkflowSelectionState(params: {
  currentStage: WorkflowStage;
  messageHistory: unknown[];
  uiSpec: unknown;
}): Record<string, unknown> | null {
  const state: Record<string, unknown> = {};
  const currentStageRank = stageIndex(params.currentStage);

  for (const rawEntry of params.messageHistory) {
    const entry = isRecord(rawEntry) ? rawEntry : null;
    if (!entry || readTrimmedString(entry.type) !== 'system') continue;
    const spec = isRecord(entry.spec) ? entry.spec : null;
    if (!spec) continue;

    const stage = toWorkflowStage(readTrimmedString(spec.stage));
    if (!stage) continue;
    if (stageIndex(stage) >= currentStageRank) continue;

    if (stage === 'seat') {
      const selectedSeats = findSelectedItemsFromSpec(spec);
      if (selectedSeats.length > 0) {
        assignWorkflowSelection(state, stage, selectedSeats);
      }
      continue;
    }

    const selectedItem = findSelectedItemFromSpec(spec);
    if (!selectedItem) continue;
    assignWorkflowSelection(state, stage, selectedItem);
  }

  const currentSpec = isRecord(params.uiSpec) ? params.uiSpec : null;
  if (currentSpec) {
    if (params.currentStage === 'seat') {
      const currentSeats = findSelectedItemsFromSpec(currentSpec);
      if (currentSeats.length > 0) {
        assignWorkflowSelection(state, params.currentStage, currentSeats);
      }
    } else if (params.currentStage !== 'confirm') {
      const currentSelected = findSelectedItemFromSpec(currentSpec);
      if (currentSelected) {
        assignWorkflowSelection(state, params.currentStage, currentSelected);
        state.currentSelection = currentSelected;
      }
    }
  }

  return Object.keys(state).length > 0 ? state : null;
}
