import { useNavigate } from 'react-router-dom';
import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api/client';
import {
  CONDITION_SELECTION_OPTIONS,
  getInterfaceCondition,
  getInteractionMode,
  getStudyModeFromConditionSelection,
  type StudyModeId,
} from './studyOptions';
import type { StudyScenarioDetail } from '../study/sessionStorage';
import { formatScenarioTitle, isHardTaskScenario } from '../utils/displayFormats';
import { queuePendingStudyLogEvent } from '../study/pendingInteractionEvents';

type Theme = 'dark' | 'light';
const VOICE_CHECK_STATUS_STORAGE_KEY = 'study_voice_check_status_v1';
const TUTORIAL_SCENARIO_ID = 'scn_t1_solo_weekend_3d_tutorial';
const SHOW_TUTORIAL_SCENARIO = !import.meta.env.PROD;
const TUTORIAL_VIDEO_ID = 'e7k_tedv9N0';
const TUTORIAL_VIDEO_EMBED_URL = `https://www.youtube-nocookie.com/embed/${TUTORIAL_VIDEO_ID}?rel=0`;
const TUTORIAL_VIDEO_WATCH_URL = `https://youtu.be/${TUTORIAL_VIDEO_ID}`;

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

function deriveSetLabel(scenarioId: string | null): string | null {
  if (!scenarioId) return null;
  const match = scenarioId.match(/^scn_s(\d+)_t[12]_/i);
  if (!match) return null;
  const setNumber = Number.parseInt(match[1], 10);
  if (!Number.isInteger(setNumber) || setNumber < 1 || setNumber > 26) return null;
  return `Set ${String.fromCharCode(64 + setNumber)}`;
}

function getScenarioGridSortKey(scenario: StudyScenarioDetail): [number, number, number, string] {
  if (scenario.id === TUTORIAL_SCENARIO_ID) {
    return [0, 0, 0, scenario.title];
  }

  const labeledScenarioMatch = scenario.title.match(/^S(\d+)-T(\d+):/i);
  if (labeledScenarioMatch) {
    const scenarioGroup = Number.parseInt(labeledScenarioMatch[1], 10);
    const taskIndex = Number.parseInt(labeledScenarioMatch[2], 10);
    return [1, scenarioGroup, taskIndex, scenario.title];
  }

  return [2, Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER, scenario.title];
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
  const [voiceCheckOpen, setVoiceCheckOpen] = useState(false);
  const [tutorialVideoOpen, setTutorialVideoOpen] = useState(false);
  const [voiceCheckError, setVoiceCheckError] = useState<string | null>(null);
  const [micCheckStatus, setMicCheckStatus] = useState<'idle' | 'checking' | 'granted' | 'denied'>('idle');
  const [speakerCheckStatus, setSpeakerCheckStatus] = useState<'idle' | 'playing' | 'played' | 'confirmed' | 'error'>('idle');
  const [voiceCheckLoading, setVoiceCheckLoading] = useState<'none' | 'mic' | 'speaker'>('none');
  const speechUtteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const selectedConditionMode = CONDITION_SELECTION_OPTIONS.some((option) => option.id === selectedMode)
    ? selectedMode
    : getStudyModeFromConditionSelection(
        getInterfaceCondition(selectedMode),
        getInteractionMode(selectedMode)
      );
  const pidMissing = !loggingParticipantId.trim();
  const tutorialSelected = selectedScenarioId === TUTORIAL_SCENARIO_ID;
  const perTrialSurveyEnabled = isHardTaskScenario({ scenarioId: selectedScenarioId });
  const conditionCode = CONDITION_SELECTION_OPTIONS.find((o) => o.id === selectedConditionMode)?.code ?? selectedConditionMode;
  const perTrialSetLabel = deriveSetLabel(selectedScenarioId);
  const orderedScenarios = useMemo(() => {
    return [...scenarios]
      .filter((s) => SHOW_TUTORIAL_SCENARIO || s.id !== TUTORIAL_SCENARIO_ID)
      .sort((left, right) => {
        const leftKey = getScenarioGridSortKey(left);
        const rightKey = getScenarioGridSortKey(right);

        for (let index = 0; index < leftKey.length; index += 1) {
          if (leftKey[index] < rightKey[index]) return -1;
          if (leftKey[index] > rightKey[index]) return 1;
        }
        return 0;
      });
  }, [scenarios]);

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
        setError(err instanceof Error ? err.message : 'Failed to load scenarios');
      })
      .finally(() => {
        if (!mounted) return;
        setLoadingScenarios(false);
      });

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (scenarios.length === 0) return;

    const hasSelected = selectedScenarioId
      ? scenarios.some((scenario) => scenario.id === selectedScenarioId)
      : false;

    if (!hasSelected) {
      onScenarioChange(scenarios[0].id);
    }
  }, [onScenarioChange, scenarios, selectedScenarioId]);

  useEffect(() => {
    return () => {
      speechUtteranceRef.current = null;
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    try {
      const rawValue = window.localStorage.getItem(VOICE_CHECK_STATUS_STORAGE_KEY);
      if (!rawValue) return;
      const parsed = JSON.parse(rawValue) as {
        micCheckStatus?: 'idle' | 'granted' | 'denied';
        speakerCheckStatus?: 'idle' | 'played' | 'confirmed' | 'error';
      };
      if (parsed.micCheckStatus) {
        setMicCheckStatus(parsed.micCheckStatus);
      }
      if (parsed.speakerCheckStatus) {
        setSpeakerCheckStatus(parsed.speakerCheckStatus);
      }
    } catch {
      // Ignore malformed persisted status.
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    window.localStorage.setItem(
      VOICE_CHECK_STATUS_STORAGE_KEY,
      JSON.stringify({
        micCheckStatus:
          micCheckStatus === 'checking' ? 'idle' : micCheckStatus,
        speakerCheckStatus:
          speakerCheckStatus === 'playing' ? 'idle' : speakerCheckStatus,
      })
    );
  }, [micCheckStatus, speakerCheckStatus]);

  const navigateToTaskReview = () => {
    if (!selectedScenarioId) return;
    navigate('/task-review');
  };

  const resetVoiceSample = () => {
    speechUtteranceRef.current = null;
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
  };

  const handleStartTask = () => {
    if (!selectedScenarioId) return;
    navigateToTaskReview();
  };

  const queueSetupGuiAction = (action: string, extraPayload?: Record<string, unknown>) => {
    queuePendingStudyLogEvent({
      type: 'user.gui_action',
      clientTimestamp: new Date().toISOString(),
      payload: {
        action,
        source: 'participant',
        location: 'study-setup',
        ...(selectedScenarioId ? { selectedScenarioId } : {}),
        studyMode: selectedMode,
        ...(extraPayload ?? {}),
      },
    });
  };

  const handleConditionChange = (mode: StudyModeId) => {
    onModeChange(mode);
  };

  const handleOpenPerTrialSurvey = (mode: StudyModeId) => {
    if (selectedScenarioId === TUTORIAL_SCENARIO_ID) {
      setError('Per-trial surveys are disabled for the tutorial scenario.');
      return;
    }
    if (!perTrialSurveyEnabled) {
      setError('Per-trial surveys are only available for Hard tasks.');
      return;
    }
    if (!loggingParticipantId.trim()) {
      setError('Enter Participant PID before opening the survey.');
      return;
    }

    const searchParams = new URLSearchParams({
      studyMode: mode,
    });
    if (selectedScenarioId) {
      searchParams.set('scenarioId', selectedScenarioId);
    }
    navigate(`/survey/per-trial?${searchParams.toString()}`);
  };

  const handleOpenPostStudySurvey = () => {
    if (!loggingParticipantId.trim()) {
      setError('Enter Participant PID before opening the post-study survey.');
      return;
    }
    navigate('/survey/post-study');
  };

  const handleRunMicrophoneCheck = async () => {
    if (voiceCheckLoading !== 'none') return;
    if (typeof navigator === 'undefined' || typeof navigator.mediaDevices?.getUserMedia !== 'function') {
      setMicCheckStatus('denied');
      setVoiceCheckError('Microphone access is not supported in this browser.');
      return;
    }

    setVoiceCheckLoading('mic');
    setVoiceCheckError(null);
    setMicCheckStatus('checking');

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      stream.getTracks().forEach((track) => track.stop());
      setMicCheckStatus('granted');
    } catch (requestError) {
      setMicCheckStatus('denied');
      setVoiceCheckError(
        requestError instanceof Error && requestError.message
          ? requestError.message
          : 'Microphone permission was denied.'
      );
    } finally {
      setVoiceCheckLoading('none');
    }
  };

  const handlePlaySpeakerSample = async () => {
    if (voiceCheckLoading !== 'none') return;
    if (typeof window === 'undefined' || !('speechSynthesis' in window) || typeof SpeechSynthesisUtterance === 'undefined') {
      setSpeakerCheckStatus('error');
      setVoiceCheckError('Built-in speech playback is not supported in this browser.');
      return;
    }

    setVoiceCheckLoading('speaker');
    setVoiceCheckError(null);
    setSpeakerCheckStatus('playing');
    resetVoiceSample();

    try {
      const utterance = new SpeechSynthesisUtterance('This is a speaker test.');
      utterance.lang = 'en-US';
      utterance.rate = 1;
      utterance.pitch = 1;
      speechUtteranceRef.current = utterance;

      utterance.onend = () => {
        if (speechUtteranceRef.current !== utterance) return;
        speechUtteranceRef.current = null;
        setSpeakerCheckStatus('confirmed');
      };
      utterance.onerror = () => {
        if (speechUtteranceRef.current !== utterance) return;
        speechUtteranceRef.current = null;
        setSpeakerCheckStatus('error');
        setVoiceCheckError('Built-in speech playback failed during the voice check.');
      };

      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(utterance);
    } catch (playbackError) {
      setSpeakerCheckStatus('error');
      setVoiceCheckError(
        playbackError instanceof Error && playbackError.message
          ? playbackError.message
          : 'Failed to play the built-in voice sample.'
      );
    } finally {
      setVoiceCheckLoading('none');
    }
  };

  return (
    <main className="h-full overflow-y-auto bg-dark px-4 py-4 sm:py-5">
      <div className="mx-auto flex min-h-full w-full max-w-5xl flex-col justify-start sm:justify-center">
        <div className="w-full rounded-2xl border border-dark-border bg-dark-light p-5 sm:p-6">
          <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="text-2xl font-semibold text-fg-strong">User Study Setup</h1>
              <p className="mt-1 text-sm text-fg-muted">
                Select your assigned condition and one scenario before starting.
              </p>
            </div>
            <div className="flex flex-wrap items-start justify-end gap-2">
              <label
                className={`flex h-11 items-center gap-2 rounded-lg border px-3 transition-colors ${
                  pidMissing
                    ? 'border-rose-400/70 bg-rose-500/10'
                    : 'border-dark-border bg-dark'
                }`}
              >
                <span
                  className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                    pidMissing
                      ? 'bg-rose-500/15 text-rose-300'
                      : 'bg-primary/15 text-primary'
                  }`}
                >
                  1
                </span>
                <span className="text-sm font-medium text-fg-strong">PID</span>
                <input
                  type="text"
                  value={loggingParticipantId}
                  onChange={(event) => onLoggingParticipantIdChange(event.target.value)}
                  placeholder="P12"
                  className={`h-8 w-20 rounded-md border px-2.5 text-sm text-fg-strong outline-none transition-colors placeholder:text-fg-faint ${
                    pidMissing
                      ? 'border-rose-400/70 bg-dark focus:border-rose-300'
                      : 'border-dark-border bg-dark-light focus:border-primary'
                  }`}
                />
              </label>
              <button
                type="button"
                onClick={() => {
                  queueSetupGuiAction('openVoiceCheck');
                  setVoiceCheckError(null);
                  setVoiceCheckOpen(true);
                }}
                className="inline-flex h-11 items-center gap-2 rounded-lg border border-sky-500/35 bg-sky-500/10 px-4 text-sm font-semibold text-sky-700 transition-colors hover:border-sky-500/60 hover:bg-sky-500/15"
              >
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-sky-500/15 text-xs font-semibold text-sky-700">
                  2
                </span>
                Mic Check
              </button>
              <button
                type="button"
                onClick={() => {
                  queueSetupGuiAction('openTutorialVideo');
                  setTutorialVideoOpen(true);
                }}
                className="inline-flex h-11 items-center gap-2 rounded-lg border border-sky-500/35 bg-sky-500/10 px-4 text-sm font-semibold text-sky-700 transition-colors hover:border-sky-500/60 hover:bg-sky-500/15"
              >
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-sky-500/15 text-xs font-semibold text-sky-700">
                  3
                </span>
                Watch Tutorial Video
              </button>
              <button
                type="button"
                hidden
                aria-hidden="true"
                tabIndex={-1}
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
          </div>

          <div className="space-y-4">
            <section className="space-y-3">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-fg-muted">
                Condition
              </h2>
              <div className="grid gap-2.5">
                <div className="flex items-stretch gap-2.5">
                  <div className="flex flex-1 flex-col gap-2.5">
                    {CONDITION_SELECTION_OPTIONS.map((option) => {
                      const checked = selectedConditionMode === option.id;
                      return (
                        <label
                          key={option.id}
                          className={`flex flex-1 cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 transition-colors ${
                            checked
                              ? 'border-primary/70 bg-primary/10'
                              : 'border-dark-border bg-dark hover:border-dark-lighter'
                          }`}
                        >
                          <input
                            type="radio"
                            name="study-condition"
                            className="h-4 w-4 accent-primary"
                            checked={checked}
                            onChange={() => handleConditionChange(option.id)}
                          />
                          <div className="text-sm font-semibold text-fg-strong">
                            {option.code ? `${option.code}: ` : ''}
                            {option.summary}
                          </div>
                        </label>
                      );
                    })}
                  </div>
                  <button
                    type="button"
                    onClick={() => handleOpenPerTrialSurvey(selectedConditionMode)}
                    disabled={tutorialSelected || !perTrialSurveyEnabled}
                    className={`w-36 rounded-xl px-4 py-3 text-sm font-semibold transition-colors ${
                      tutorialSelected || !perTrialSurveyEnabled
                        ? 'cursor-not-allowed border border-stone-300 bg-stone-100 text-slate-400'
                        : 'border border-sky-500/35 bg-sky-500/10 text-sky-700 hover:border-sky-500/60 hover:bg-sky-500/15'
                    }`}
                  >
                    {tutorialSelected ? (
                      'Survey Disabled'
                    ) : !perTrialSurveyEnabled ? (
                      'Hard Task Only'
                    ) : (
                      <>
                        <span className="block">Open Survey</span>
                        <span className="mt-1 inline-block rounded-md border border-amber-400 bg-amber-400 px-2 py-0.5 text-lg font-black tracking-wide text-slate-900">
                          {conditionCode}{perTrialSetLabel ? ` / ${perTrialSetLabel}` : ''}
                        </span>
                      </>
                    )}
                  </button>
                </div>
                <button
                  type="button"
                  onClick={handleOpenPostStudySurvey}
                  className="w-full rounded-xl border border-emerald-500/35 bg-emerald-500/10 px-4 py-3 text-sm font-semibold text-emerald-700 transition-colors hover:border-emerald-500/60 hover:bg-emerald-500/15"
                >
                  Post-Study Survey
                </button>
              </div>
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
                <div className="grid gap-2.5 md:grid-cols-2">
                  {orderedScenarios.map((scenario) => {
                    const checked = selectedScenarioId === scenario.id;
                    const isExampleScenario = scenario.id === TUTORIAL_SCENARIO_ID;
                    return (
                      <label
                        key={scenario.id}
                        className={`flex cursor-pointer items-start gap-3 rounded-xl border px-4 py-3 transition-colors ${
                          checked
                            ? 'border-primary/70 bg-primary/10'
                            : 'border-dark-border bg-dark hover:border-dark-lighter'
                        } ${isExampleScenario ? 'md:col-span-2' : ''}`}
                      >
                        <input
                          type="radio"
                          name="study-scenario"
                          className="mt-1 h-4 w-4 accent-primary"
                          checked={checked}
                          onChange={() => onScenarioChange(scenario.id)}
                        />
                        <div className="text-sm font-medium text-fg-strong">
                          {formatScenarioTitle(scenario.title)}
                        </div>
                      </label>
                    );
                  })}
                </div>
              )}
            </section>
          </div>

          {error && (
            <div className="mt-4 rounded-lg border border-primary/40 bg-primary/10 px-3 py-2 text-sm text-primary">
              {error}
            </div>
          )}

          <div className="mt-6 flex flex-wrap justify-end gap-3">
            <button
              type="button"
              onClick={handleStartTask}
              disabled={loadingScenarios || !selectedScenarioId || pidMissing}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-fg transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-60"
            >
              Start Task
            </button>
          </div>
        </div>
      </div>

      {voiceCheckOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-dark/75 px-4">
          <div className="w-full max-w-xl rounded-2xl border border-dark-border bg-dark-light p-6 shadow-2xl">
            <div className="mb-5">
              <h2 className="text-xl font-semibold text-fg-strong">Mic Check</h2>
              <p className="mt-2 text-sm text-fg-muted">
                Use this first to verify microphone permission and speaker playback before a voice-mode round.
              </p>
            </div>

            <div className="space-y-4">
              <div className="rounded-xl border border-dark-border bg-dark p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-medium text-fg-strong">1. Microphone permission</div>
                    <div className="mt-1 text-xs text-fg-muted">
                      Allow microphone access so voice mode is ready before the task starts.
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => void handleRunMicrophoneCheck()}
                    disabled={voiceCheckLoading !== 'none'}
                    className="rounded-lg border border-dark-border px-3 py-2 text-sm font-medium text-fg transition-colors hover:border-primary hover:text-fg-strong disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {micCheckStatus === 'granted'
                      ? 'Granted'
                      : voiceCheckLoading === 'mic'
                      ? 'Checking...'
                      : 'Allow Microphone'}
                  </button>
                </div>
              </div>

              <div className="rounded-xl border border-dark-border bg-dark p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-medium text-fg-strong">2. Speaker playback</div>
                    <div className="mt-1 text-xs text-fg-muted">
                      Play a short sample to confirm speaker output.
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => void handlePlaySpeakerSample()}
                    disabled={voiceCheckLoading !== 'none'}
                    className="rounded-lg border border-dark-border px-3 py-2 text-sm font-medium text-fg transition-colors hover:border-primary hover:text-fg-strong disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {voiceCheckLoading === 'speaker'
                      ? 'Playing...'
                      : speakerCheckStatus === 'confirmed'
                      ? 'Played'
                      : 'Play Sample'}
                  </button>
                </div>
              </div>

              <div className="rounded-xl border border-dark-border bg-dark p-4 text-sm text-fg-muted">
                <div>Microphone: {micCheckStatus === 'granted' ? 'ready' : micCheckStatus === 'denied' ? 'not granted' : 'not checked'}</div>
                <div className="mt-1">Speaker: {speakerCheckStatus === 'confirmed' ? 'confirmed' : speakerCheckStatus === 'played' ? 'sample played' : speakerCheckStatus === 'error' ? 'playback failed' : 'not checked'}</div>
              </div>

              {voiceCheckError ? (
                <div className="rounded-lg border border-primary/40 bg-primary/10 px-3 py-2 text-sm text-primary">
                  {voiceCheckError}
                </div>
              ) : null}
            </div>

            <div className="mt-6 flex flex-wrap justify-end gap-3">
              <button
                type="button"
                onClick={() => {
                  resetVoiceSample();
                  setVoiceCheckOpen(false);
                }}
                className="rounded-lg border border-dark-border px-4 py-2 text-sm font-medium text-fg transition-colors hover:border-primary hover:text-fg-strong"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {tutorialVideoOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-dark/75 px-3 py-3 sm:px-5 sm:py-5">
          <div className="max-h-[90vh] w-full max-w-[min(92vw,84rem)] overflow-y-auto rounded-2xl border border-dark-border bg-dark-light p-5 shadow-2xl sm:p-6">
            <div className="mb-5 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-xl font-semibold text-fg-strong">Tutorial Video</h2>
                <p className="mt-2 text-sm text-fg-muted">
                  Watch this walkthrough before starting the tutorial scenario or your assigned study task.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setTutorialVideoOpen(false)}
                className="rounded-lg border border-dark-border px-4 py-2 text-sm font-medium text-fg transition-colors hover:border-primary hover:text-fg-strong"
              >
                Close
              </button>
            </div>

            <div className="overflow-hidden rounded-xl border border-dark-border bg-dark">
              <div className="aspect-video w-full">
                <iframe
                  className="h-full w-full"
                  src={TUTORIAL_VIDEO_EMBED_URL}
                  title="User Study Tutorial Video"
                  loading="lazy"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                  referrerPolicy="strict-origin-when-cross-origin"
                  allowFullScreen
                />
              </div>
            </div>

            <div className="mt-3 text-sm text-fg-muted">
              If the video does not load here, open it on{' '}
              <a
                href={TUTORIAL_VIDEO_WATCH_URL}
                target="_blank"
                rel="noreferrer"
                className="text-sky-700 underline underline-offset-2 transition-colors hover:text-sky-800"
              >
                YouTube
              </a>
              .
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
