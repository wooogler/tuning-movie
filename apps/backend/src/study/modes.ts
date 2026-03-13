import type { StudyModeConfig, StudyModeId } from './types';

const MODE_CONFIG: Record<StudyModeId, StudyModeConfig> = {
  baseline: {
    agentEnabled: true,
    guiAdaptationEnabled: false,
    cpMemoryWindow: 0,
  },
  'basic-tuning': {
    agentEnabled: true,
    guiAdaptationEnabled: false,
    cpMemoryWindow: 0,
  },
  'new-baseline': {
    agentEnabled: true,
    guiAdaptationEnabled: false,
    cpMemoryWindow: 0,
  },
  'adaptive-tuning': {
    agentEnabled: true,
    guiAdaptationEnabled: true,
    cpMemoryWindow: 0,
  },
  'full-tuning': {
    agentEnabled: true,
    guiAdaptationEnabled: true,
    cpMemoryWindow: 10,
  },
};

export const DEFAULT_STUDY_MODE: StudyModeId = 'baseline';

export function normalizeStudyMode(value: string | null | undefined): StudyModeId {
  if (value === 'gui-only') return 'baseline';
  if (value && value in MODE_CONFIG) {
    return value as StudyModeId;
  }
  return DEFAULT_STUDY_MODE;
}

export function isStudyModeId(value: string): value is StudyModeId {
  return value in MODE_CONFIG;
}

export function getStudyModeConfig(mode: StudyModeId): StudyModeConfig {
  return MODE_CONFIG[mode];
}
