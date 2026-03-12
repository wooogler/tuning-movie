import { useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { STUDY_MODE_OPTIONS, type StudyModeId } from './studyOptions';
import type { StudyScenarioDetail } from '../study/sessionStorage';

type Theme = 'dark' | 'light';

interface StudyStartPageProps {
  theme: Theme;
  onThemeToggle: () => void;
  selectedMode: StudyModeId;
  onModeChange: (mode: StudyModeId) => void;
  selectedScenarioId: string | null;
  onScenarioChange: (scenarioId: string) => void;
  loggingParticipantId: string;
  onLoggingParticipantIdChange: (participantId: string) => void;
}

export function StudyStartPage({
  theme,
  onThemeToggle,
  selectedMode,
  onModeChange,
  selectedScenarioId,
  onScenarioChange,
  loggingParticipantId,
  onLoggingParticipantIdChange,
}: StudyStartPageProps) {
  const navigate = useNavigate();
  const [loadingScenarios, setLoadingScenarios] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [scenarios, setScenarios] = useState<StudyScenarioDetail[]>([]);

  useEffect(() => {
    let mounted = true;
    setLoadingScenarios(true);
    setError(null);
    api.getStudyScenarios()
      .then((result) => {
        if (!mounted) return;
        setScenarios(result.scenarios);
        if (result.scenarios.length > 0) {
          const hasSelected = selectedScenarioId
            ? result.scenarios.some((scenario) => scenario.id === selectedScenarioId)
            : false;
          if (!hasSelected) {
            onScenarioChange(result.scenarios[0].id);
          }
        }
      })
      .catch((err) => {
        if (!mounted) return;
        setError(err instanceof Error ? err.message : 'Failed to load scenarios');
      })
      .finally(() => {
        if (!mounted) return;
        setLoadingScenarios(false);
      });

    return () => {
      mounted = false;
    };
  }, [onScenarioChange, selectedScenarioId]);

  const handleStartTask = () => {
    if (!selectedScenarioId) return;
    navigate('/task-review');
  };

  return (
    <main className="h-full overflow-y-auto bg-dark px-4 py-6 sm:py-8">
      <div className="mx-auto flex min-h-full w-full max-w-4xl flex-col justify-start sm:justify-center">
        <div className="w-full rounded-2xl border border-dark-border bg-dark-light p-6 sm:p-8">
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-2xl font-semibold text-fg-strong">User Study Setup</h1>
              <p className="mt-1 text-sm text-fg-muted">
                Select one study mode and one scenario before starting.
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

          <div className="grid gap-5 lg:grid-cols-2">
            <section className="space-y-3">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-fg-muted">
                Study Mode
              </h2>
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
            </section>

            <section className="space-y-3">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-fg-muted">
                Scenario
              </h2>
              {loadingScenarios ? (
                <div className="rounded-xl border border-dark-border bg-dark p-4 text-sm text-fg-muted">
                  Loading scenarios...
                </div>
              ) : scenarios.length === 0 ? (
                <div className="rounded-xl border border-dark-border bg-dark p-4 text-sm text-fg-muted">
                  No scenarios available.
                </div>
              ) : (
                scenarios.map((scenario) => {
                  const checked = selectedScenarioId === scenario.id;
                  return (
                    <label
                      key={scenario.id}
                      className={`flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition-colors ${
                        checked
                          ? 'border-primary/70 bg-primary/10'
                          : 'border-dark-border bg-dark hover:border-dark-lighter'
                      }`}
                    >
                      <input
                        type="radio"
                        name="study-scenario"
                        className="mt-1 h-4 w-4 accent-primary"
                        checked={checked}
                        onChange={() => onScenarioChange(scenario.id)}
                      />
                      <div>
                        <div className="text-sm font-medium text-fg-strong">{scenario.title}</div>
                      </div>
                    </label>
                  );
                })
              )}
            </section>
          </div>

          <section className="mt-5 space-y-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-fg-muted">
              PID Logging
            </h2>
            <div className="rounded-xl border border-dark-border bg-dark p-4">
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-fg-strong">Participant PID</span>
                <input
                  type="text"
                  value={loggingParticipantId}
                  onChange={(event) => onLoggingParticipantIdChange(event.target.value)}
                  placeholder="Optional"
                  className="w-full rounded-lg border border-dark-border bg-dark-light px-3 py-2 text-sm text-fg-strong outline-none transition-colors placeholder:text-fg-faint focus:border-primary"
                />
              </label>
            </div>
          </section>

          {error && (
            <div className="mt-4 rounded-lg border border-primary/40 bg-primary/10 px-3 py-2 text-sm text-primary">
              {error}
            </div>
          )}

          <div className="mt-8 flex flex-wrap justify-end gap-3">
            <button
              type="button"
              onClick={handleStartTask}
              disabled={loadingScenarios || !selectedScenarioId}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-fg transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-60"
            >
              Start Task
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}
