import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import type { StudyModeId } from './studyOptions';
import { ScenarioBriefing } from '../components/scenario/ScenarioBriefing';
import type { StudyScenarioDetail, StudySessionState } from '../study/sessionStorage';

type Theme = 'dark' | 'light';

interface ScenarioReviewPageProps {
  theme: Theme;
  onThemeToggle: () => void;
  studyMode: StudyModeId;
  selectedScenarioId: string;
  onSessionCreated: (session: StudySessionState) => void;
}

export function ScenarioReviewPage({
  theme,
  onThemeToggle,
  studyMode,
  selectedScenarioId,
  onSessionCreated,
}: ScenarioReviewPageProps) {
  const navigate = useNavigate();
  const [loadingScenarios, setLoadingScenarios] = useState(true);
  const [startingSession, setStartingSession] = useState(false);
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
      })
      .catch((err) => {
        if (!mounted) return;
        setError(err instanceof Error ? err.message : 'Failed to load scenario details');
      })
      .finally(() => {
        if (!mounted) return;
        setLoadingScenarios(false);
      });

    return () => {
      mounted = false;
    };
  }, []);

  const selectedScenario =
    scenarios.find((scenario) => scenario.id === selectedScenarioId) ?? null;

  const handleStartBooking = async () => {
    if (!selectedScenario || startingSession) return;

    setStartingSession(true);
    setError(null);
    try {
      const session = await api.createStudySession({
        scenarioId: selectedScenario.id,
        studyMode,
      });
      onSessionCreated(session);
      navigate('/booking');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start task session');
    } finally {
      setStartingSession(false);
    }
  };

  return (
    <main className="h-full overflow-y-auto bg-dark px-4 py-8">
      <div className="mx-auto w-full max-w-5xl rounded-2xl border border-dark-border bg-dark-light p-6 sm:p-8">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-fg-strong">Scenario Review</h1>
            <p className="mt-1 text-sm text-fg-muted">
              Review the story and preferences before entering the booking task.
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

        {loadingScenarios ? (
          <div className="rounded-xl border border-dark-border bg-dark p-4 text-sm text-fg-muted">
            Loading scenario details...
          </div>
        ) : selectedScenario ? (
          <ScenarioBriefing
            title={selectedScenario.title}
            story={selectedScenario.story}
            narratorPreferenceTypes={selectedScenario.narratorPreferenceTypes}
          />
        ) : (
          <div className="rounded-xl border border-primary/40 bg-primary/10 p-4 text-sm text-primary">
            Selected scenario was not found.
          </div>
        )}

        {error && (
          <div className="mt-4 rounded-lg border border-primary/40 bg-primary/10 px-3 py-2 text-sm text-primary">
            {error}
          </div>
        )}

        <div className="mt-8 flex flex-wrap justify-end gap-3">
          <button
            type="button"
            onClick={() => navigate('/')}
            className="rounded-lg border border-dark-border px-4 py-2 text-sm font-medium text-fg transition-colors hover:border-primary hover:text-fg-strong"
          >
            Back
          </button>
          <button
            type="button"
            onClick={handleStartBooking}
            disabled={loadingScenarios || startingSession || !selectedScenario}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-fg transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-60"
          >
            {startingSession ? 'Starting...' : 'Start Booking'}
          </button>
        </div>
      </div>
    </main>
  );
}
