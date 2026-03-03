export interface StudyModeConfig {
  agentEnabled: boolean;
  guiAdaptationEnabled: boolean;
  cpMemoryWindow: number;
  extractorConflictCandidateEnabled: boolean;
}

export const STUDY_MODE_OPTIONS = [
  {
    id: 'gui-only',
    label: 'GUI-only: No Agent',
    description: 'Run the prototype without connecting an external agent.',
    config: {
      agentEnabled: false,
      guiAdaptationEnabled: false,
      cpMemoryWindow: 0,
      extractorConflictCandidateEnabled: false,
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
      extractorConflictCandidateEnabled: false,
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
      extractorConflictCandidateEnabled: false,
    },
  },
  {
    id: 'full-tuning',
    label: 'Full TUNING',
    description: 'Agent ON, GUI Adaptation ON, CP memory ON (window 10, candidate OFF).',
    config: {
      agentEnabled: true,
      guiAdaptationEnabled: true,
      cpMemoryWindow: 10,
      extractorConflictCandidateEnabled: false,
    },
  },
] as const;

export type StudyModeId = (typeof STUDY_MODE_OPTIONS)[number]['id'];

export const DEFAULT_STUDY_MODE: StudyModeId = 'gui-only';

export function getStudyModeOption(id: string) {
  return STUDY_MODE_OPTIONS.find((item) => item.id === id) ?? STUDY_MODE_OPTIONS[0];
}

export function getStudyModeLabel(id: string): string {
  return getStudyModeOption(id).label;
}

export function getStudyModeConfig(id: string): StudyModeConfig {
  return getStudyModeOption(id).config;
}
