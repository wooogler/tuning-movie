export interface StudyModeConfig {
  agentEnabled: boolean;
  guiAdaptationEnabled: boolean;
  cpMemoryWindow: number;
}

export const STUDY_MODE_OPTIONS = [
  {
    id: 'baseline',
    label: 'Baseline',
    description: 'Agent-backed baseline router with GUI-only navigation and selection.',
    config: {
      agentEnabled: true,
      guiAdaptationEnabled: false,
      cpMemoryWindow: 0,
    },
  },
  {
    id: 'basic-tuning',
    label: 'Basic TUNING',
    description: 'Agent ON, GUI Adaptation OFF, CP memory OFF.',
    config: {
      agentEnabled: true,
      guiAdaptationEnabled: false,
      cpMemoryWindow: 0,
    },
  },
  {
    id: 'new-baseline',
    label: 'New Baseline',
    description: 'Agent ON, GUI Adaptation OFF, CP memory OFF, split GUI/CUI interface.',
    config: {
      agentEnabled: true,
      guiAdaptationEnabled: false,
      cpMemoryWindow: 0,
    },
  },
  {
    id: 'adaptive-tuning',
    label: 'Adaptive TUNING',
    description: 'Agent ON, GUI Adaptation ON, CP memory OFF.',
    config: {
      agentEnabled: true,
      guiAdaptationEnabled: true,
      cpMemoryWindow: 0,
    },
  },
  {
    id: 'full-tuning',
    label: 'Full TUNING',
    description: 'Agent ON, GUI Adaptation ON, CP memory ON (window 10, conflict memory ON).',
    config: {
      agentEnabled: true,
      guiAdaptationEnabled: true,
      cpMemoryWindow: 10,
    },
  },
] as const;

export type StudyModeId = (typeof STUDY_MODE_OPTIONS)[number]['id'];

export const DEFAULT_STUDY_MODE: StudyModeId = 'baseline';

export function normalizeStudyMode(id: string | null | undefined): StudyModeId {
  if (id === 'gui-only') return 'baseline';
  return STUDY_MODE_OPTIONS.find((item) => item.id === id)?.id ?? DEFAULT_STUDY_MODE;
}

export function getStudyModeOption(id: string) {
  const normalized = normalizeStudyMode(id);
  return STUDY_MODE_OPTIONS.find((item) => item.id === normalized) ?? STUDY_MODE_OPTIONS[0];
}

export function getStudyModeLabel(id: string): string {
  return getStudyModeOption(id).label;
}

export function getStudyModeConfig(id: string): StudyModeConfig {
  return getStudyModeOption(id).config;
}
