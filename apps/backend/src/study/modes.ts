import type { StudyModeConfig, StudyModeId } from './types';

const MODE_CONFIG: Record<StudyModeId, StudyModeConfig> = {
  baseline: {
    agentEnabled: false,
    guiAdaptationEnabled: false,
    cpMemoryWindow: 0,
    voiceModeAvailable: false,
  },
  'basic-tuning': {
    agentEnabled: true,
    guiAdaptationEnabled: false,
    cpMemoryWindow: 0,
    voiceModeAvailable: false,
  },
  'basic-tuning-voice-off': {
    agentEnabled: true,
    guiAdaptationEnabled: false,
    cpMemoryWindow: 0,
    voiceModeAvailable: false,
  },
  'basic-tuning-voice-on': {
    agentEnabled: true,
    guiAdaptationEnabled: false,
    cpMemoryWindow: 0,
    voiceModeAvailable: true,
  },
  'new-baseline': {
    agentEnabled: true,
    guiAdaptationEnabled: false,
    cpMemoryWindow: 0,
    voiceModeAvailable: false,
  },
  'adaptive-tuning': {
    agentEnabled: true,
    guiAdaptationEnabled: true,
    cpMemoryWindow: 0,
    voiceModeAvailable: false,
  },
  'full-tuning': {
    agentEnabled: true,
    guiAdaptationEnabled: true,
    cpMemoryWindow: 10,
    voiceModeAvailable: false,
  },
  'full-tuning-voice-off': {
    agentEnabled: true,
    guiAdaptationEnabled: true,
    cpMemoryWindow: 10,
    voiceModeAvailable: false,
  },
  'full-tuning-voice-on': {
    agentEnabled: true,
    guiAdaptationEnabled: true,
    cpMemoryWindow: 10,
    voiceModeAvailable: true,
  },
};

const MODE_CONDITION_CODE: Partial<Record<StudyModeId, string>> = {
  'basic-tuning-voice-off': 'C1',
  'full-tuning-voice-off': 'C2',
  'basic-tuning-voice-on': 'C3',
  'full-tuning-voice-on': 'C4',
};

export const DEFAULT_STUDY_MODE: StudyModeId = 'basic-tuning-voice-off';

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

export function getStudyConditionCode(mode: StudyModeId): string {
  return MODE_CONDITION_CODE[mode] ?? mode;
}
