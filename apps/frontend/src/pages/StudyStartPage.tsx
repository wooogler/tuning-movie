import { useNavigate } from 'react-router-dom';
import { STUDY_MODE_OPTIONS, type StudyModeId } from './studyOptions';

type Theme = 'dark' | 'light';

interface StudyStartPageProps {
  theme: Theme;
  onThemeToggle: () => void;
  selectedMode: StudyModeId;
  onModeChange: (mode: StudyModeId) => void;
}

export function StudyStartPage({
  theme,
  onThemeToggle,
  selectedMode,
  onModeChange,
}: StudyStartPageProps) {
  const navigate = useNavigate();

  return (
    <main className="flex min-h-screen items-center justify-center bg-dark px-4 py-8">
      <div className="w-full max-w-3xl rounded-2xl border border-dark-border bg-dark-light p-6 sm:p-8">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-fg-strong">User Study Setup</h1>
            <p className="mt-1 text-sm text-fg-muted">
              Select one study mode before starting the prototype.
            </p>
          </div>
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

        <div className="space-y-3">
          {STUDY_MODE_OPTIONS.map((option) => {
            const checked = selectedMode === option.id;
            return (
              <label
                key={option.id}
                className={`flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition-colors ${
                  checked
                    ? 'border-primary/70 bg-primary/10'
                    : 'border-dark-border bg-dark hover:border-dark-lighter'
                }`}
              >
                <input
                  type="radio"
                  name="study-mode"
                  className="mt-1 h-4 w-4 accent-primary"
                  checked={checked}
                  onChange={() => onModeChange(option.id)}
                />
                <div>
                  <div className="text-sm font-medium text-fg-strong">{option.label}</div>
                  <div className="mt-1 text-sm text-fg-muted">{option.description}</div>
                </div>
              </label>
            );
          })}
        </div>

        <div className="mt-8 flex flex-wrap justify-end gap-3">
          <button
            type="button"
            onClick={() => navigate('/booking')}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-fg transition-colors hover:bg-primary-hover"
          >
            Start Prototype
          </button>
        </div>
      </div>
    </main>
  );
}
