import { useNavigate } from 'react-router-dom';
import { getStudyModeOption, type StudyModeId } from './studyOptions';

type Theme = 'dark' | 'light';

interface StudyEndPageProps {
  theme: Theme;
  onThemeToggle: () => void;
  selectedMode: StudyModeId;
  onResetMode: () => void;
}

export function StudyEndPage({
  theme,
  onThemeToggle,
  selectedMode,
  onResetMode,
}: StudyEndPageProps) {
  const navigate = useNavigate();
  const selectedModeOption = getStudyModeOption(selectedMode);

  const handleBackToSetup = () => {
    onResetMode();
    navigate('/');
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-dark px-4 py-8">
      <div className="w-full max-w-2xl rounded-2xl border border-dark-border bg-dark-light p-6 sm:p-8">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-semibold text-fg-strong">Study Complete</h1>
          <button
            type="button"
            onClick={onThemeToggle}
            className={`px-3 py-1 text-xs rounded border transition-colors ${
              theme === 'dark'
                ? 'border-amber-300/60 bg-amber-100/10 text-amber-200 hover:border-amber-200 hover:text-amber-100'
                : 'border-sky-500/45 bg-sky-500/10 text-sky-700 hover:border-sky-500 hover:text-sky-800'
            }`}
          >
            {theme === 'dark' ? 'Bright Mode' : 'Dark Mode'}
          </button>
        </div>

        <p className="mb-4 text-sm text-fg-muted">
          The session has ended. Selected study mode:
        </p>

        <div className="space-y-2 rounded-xl border border-dark-border bg-dark p-4">
          <div className="text-sm font-semibold text-fg-strong">{selectedModeOption.label}</div>
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
    </main>
  );
}
