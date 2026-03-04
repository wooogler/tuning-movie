import type { StudyModeConfig, StudyModeId } from './types';

const MODE_CONFIG: Record<StudyModeId, StudyModeConfig> = {
  'gui-only': {
    agentEnabled: false,
    guiAdaptationEnabled: false,
    cpMemoryWindow: 0,
  },
  'basic-tuning': {
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

export const DEFAULT_STUDY_MODE: StudyModeId = 'gui-only';

export function isStudyModeId(value: string): value is StudyModeId {
  return value in MODE_CONFIG;
}

export function getStudyModeConfig(mode: StudyModeId): StudyModeConfig {
  return MODE_CONFIG[mode];
}
