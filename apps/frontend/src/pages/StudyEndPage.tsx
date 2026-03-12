import { useNavigate } from 'react-router-dom';
import { getStudyModeOption, type StudyModeId } from './studyOptions';

interface StudyEndPageProps {
  selectedMode: StudyModeId;
  selectedScenarioTitle?: string | null;
  onResetMode: () => void;
}

export function StudyEndPage({
  selectedMode,
  selectedScenarioTitle,
  onResetMode,
}: StudyEndPageProps) {
  const navigate = useNavigate();
  const selectedModeOption = getStudyModeOption(selectedMode);

  const handleBackToSetup = () => {
    onResetMode();
    navigate('/');
  };

  return (
    <main className="h-full overflow-y-auto bg-dark px-4 py-6 sm:py-8">
      <div className="mx-auto flex min-h-full w-full max-w-2xl flex-col justify-start sm:justify-center">
        <div className="w-full rounded-2xl border border-dark-border bg-dark-light p-6 sm:p-8">
          <div className="mb-6">
            <h1 className="text-2xl font-semibold text-fg-strong">Study Complete</h1>
          </div>

          <p className="mb-4 text-sm text-fg-muted">
            The session has ended. Selected study mode:
          </p>

          <div className="space-y-2 rounded-xl border border-dark-border bg-dark p-4">
            <div className="text-sm font-semibold text-fg-strong">{selectedModeOption.label}</div>
            {selectedScenarioTitle ? (
              <div className="text-sm text-fg-strong">Scenario: {selectedScenarioTitle}</div>
            ) : null}
            <div className="text-sm text-fg-muted">{selectedModeOption.description}</div>
            <div className="text-xs text-fg-faint">
              Agent {selectedModeOption.config.agentEnabled ? 'ON' : 'OFF'} / GUI Adaptation{' '}
              {selectedModeOption.config.guiAdaptationEnabled ? 'ON' : 'OFF'} / CP Memory window{' '}
              {selectedModeOption.config.cpMemoryWindow}
            </div>
          </div>

          <div className="mt-8 flex flex-wrap justify-end gap-3">
            <button
              type="button"
              onClick={handleBackToSetup}
              className="rounded-lg border border-dark-border px-4 py-2 text-sm font-medium text-fg transition-colors hover:border-primary hover:text-fg-strong"
            >
              Back to Setup
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}
