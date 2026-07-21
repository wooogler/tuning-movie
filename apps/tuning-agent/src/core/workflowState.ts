export type WorkflowStage = 'movie' | 'theater' | 'date' | 'time' | 'seat' | 'confirm';

export const WORKFLOW_STAGE_ORDER: WorkflowStage[] = [
  'movie',
  'theater',
  'date',
  'time',
  'seat',
  'confirm',
];

const ROOT_CONTEXT_KEY = 'root';

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

function findWorkflowRecord(spec: Record<string, unknown>): Record<string, unknown> | null {
  const state = isRecord(spec.state) ? spec.state : null;
  if (!state) return null;
  return isRecord(state.workflow) ? state.workflow : isRecord(state.booking) ? state.booking : null;
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

function copyWorkflowSelectionRecord(value: unknown): Record<string, unknown> | null {
  return isRecord(value) ? copyRecord(value) : null;
}

function copyWorkflowDate(value: unknown): Record<string, unknown> | string | null {
  if (isRecord(value)) return copyRecord(value);
  return readTrimmedString(value);
}

function copyWorkflowSeats(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => (isRecord(entry) ? copyRecord(entry) : null))
    .filter((entry): entry is Record<string, unknown> => entry !== null);
}

function stageIndex(stage: WorkflowStage): number {
  return WORKFLOW_STAGE_ORDER.indexOf(stage);
}

function readRecordField(record: Record<string, unknown> | null, keys: string[]): string | null {
  if (!record) return null;
  for (const key of keys) {
    const value = readTrimmedString(record[key]);
    if (value) return value;
  }
  return null;
}

function readWorkflowStageValue(
  state: Record<string, unknown> | null,
  stage: WorkflowStage
): unknown {
  if (!state) return null;
  switch (stage) {
    case 'movie':
      return state.movie;
    case 'theater':
      return state.theater;
    case 'date':
      return state.date;
    case 'time':
      return state.showing;
    case 'seat':
      return state.seats;
    default:
      return null;
  }
}

export function getWorkflowSelectionId(
  state: Record<string, unknown> | null,
  stage: WorkflowStage
): string | null {
  const value = readWorkflowStageValue(state, stage);
  if (typeof value === 'string') {
    return readTrimmedString(value);
  }

  const record = isRecord(value) ? value : null;
  switch (stage) {
    case 'movie':
      return readRecordField(record, ['id', 'title', 'value', 'name']);
    case 'theater':
      return readRecordField(record, ['id', 'name', 'value', 'title']);
    case 'date':
      return readRecordField(record, ['id', 'date', 'value', 'displayText']);
    case 'time':
      return readRecordField(record, ['id', 'time', 'value', 'displayTime']);
    default:
      return null;
  }
}

export function getWorkflowParentContextKey(
  stage: WorkflowStage,
  state: Record<string, unknown> | null
): string | null {
  switch (stage) {
    case 'movie':
      return ROOT_CONTEXT_KEY;
    case 'theater': {
      const movieId = getWorkflowSelectionId(state, 'movie');
      return movieId ? `movie:${movieId}` : null;
    }
    case 'date': {
      const movieId = getWorkflowSelectionId(state, 'movie');
      const theaterId = getWorkflowSelectionId(state, 'theater');
      return movieId && theaterId ? `movie:${movieId}|theater:${theaterId}` : null;
    }
    case 'time': {
      const movieId = getWorkflowSelectionId(state, 'movie');
      const theaterId = getWorkflowSelectionId(state, 'theater');
      const dateId = getWorkflowSelectionId(state, 'date');
      return movieId && theaterId && dateId
        ? `movie:${movieId}|theater:${theaterId}|date:${dateId}`
        : null;
    }
    case 'seat': {
      const movieId = getWorkflowSelectionId(state, 'movie');
      const theaterId = getWorkflowSelectionId(state, 'theater');
      const dateId = getWorkflowSelectionId(state, 'date');
      const showingId = getWorkflowSelectionId(state, 'time');
      return movieId && theaterId && dateId && showingId
        ? `movie:${movieId}|theater:${theaterId}|date:${dateId}|time:${showingId}`
        : null;
    }
    default:
      return null;
  }
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
  committedState?: Record<string, unknown> | null;
}): Record<string, unknown> | null {
  void params.messageHistory;
  const state: Record<string, unknown> = {};
  const currentSpec = isRecord(params.uiSpec) ? params.uiSpec : null;

  if (params.committedState) {
    const committedMovie = copyWorkflowSelectionRecord(params.committedState.movie);
    if (committedMovie) state.movie = committedMovie;

    const committedTheater = copyWorkflowSelectionRecord(params.committedState.theater);
    if (committedTheater) state.theater = committedTheater;

    const committedDate = copyWorkflowDate(params.committedState.date);
    if (committedDate) state.date = committedDate;

    const committedShowing = copyWorkflowSelectionRecord(params.committedState.showing);
    if (committedShowing) state.showing = committedShowing;

    const committedSeats = copyWorkflowSeats(params.committedState.seats);
    if (committedSeats.length > 0) state.seats = committedSeats;
  }

  if (currentSpec && !params.committedState) {
    const workflow = findWorkflowRecord(currentSpec);
    if (workflow) {
      const movie = copyWorkflowSelectionRecord(workflow.movie);
      if (movie) state.movie = movie;

      const theater = copyWorkflowSelectionRecord(workflow.theater);
      if (theater) state.theater = theater;

      const date = copyWorkflowDate(workflow.date);
      if (date) state.date = date;

      const showing = copyWorkflowSelectionRecord(workflow.showing);
      if (showing) state.showing = showing;

      const seats = copyWorkflowSeats(
        Array.isArray(workflow.seats) ? workflow.seats : workflow.selectedSeats
      );
      if (seats.length > 0) state.seats = seats;
    }
  }

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
      }
    }
  }

  return Object.keys(state).length > 0 ? state : null;
}

export function resolveCommittedSelectionFromContext(params: {
  stage: WorkflowStage;
  uiSpec: unknown;
}): unknown | null {
  const currentSpec = isRecord(params.uiSpec) ? params.uiSpec : null;
  const currentSpecStage = currentSpec ? toWorkflowStage(readTrimmedString(currentSpec.stage)) : null;
  if (currentSpecStage !== params.stage || !currentSpec) return null;

  if (params.stage === 'seat') {
    const seats = findSelectedItemsFromSpec(currentSpec);
    return seats.length > 0 ? seats : null;
  }

  return findSelectedItemFromSpec(currentSpec);
}
