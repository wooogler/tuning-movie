import { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ChatPage } from './pages/ChatPage';
import { StudyStartPage } from './pages/StudyStartPage';
import { ScenarioReviewPage } from './pages/ScenarioReviewPage';
import { StudyEndPage } from './pages/StudyEndPage';
import { PerTrialSurveyPage } from './pages/PerTrialSurveyPage';
import { PostStudySurveyPage } from './pages/PostStudySurveyPage';
import { DEFAULT_STUDY_MODE, sanitizeSetupStudyMode, type StudyModeId } from './pages/studyOptions';
import { api } from './api/client';
import {
  clearStoredStudySession,
  getStoredStudySession,
  setStoredStudySession,
  type StudySessionState,
} from './study/sessionStorage';
import { DevToolsProvider } from './components/DevToolsContext';
import { DevTools } from './components/DevTools';
import './App.css';

type Theme = 'dark' | 'light';

const THEME_STORAGE_KEY = 'tuning-movie-theme';
const PID_LOGGING_STORAGE_KEY = 'tuning-movie-logging-participant-id';
const STUDY_MODE_STORAGE_KEY = 'tuning-movie-study-mode-selection';
const SCENARIO_SELECTION_STORAGE_KEY = 'tuning-movie-scenario-selection';
const AGENT_CONSOLE_ENABLED = !import.meta.env.PROD;

function getInitialTheme(): Theme {
  return 'light';
}

function getStoredLoggingParticipantId(): string {
  if (typeof window === 'undefined') return '';
  try {
    const value = window.localStorage.getItem(PID_LOGGING_STORAGE_KEY);
    return typeof value === 'string' ? value : '';
  } catch {
    return '';
  }
}

function getStoredStudyModeSelection(): StudyModeId | null {
  if (typeof window === 'undefined') return null;
  try {
    const value = window.localStorage.getItem(STUDY_MODE_STORAGE_KEY);
    return value ? (value as StudyModeId) : null;
  } catch {
    return null;
  }
}

function getStoredScenarioSelection(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(SCENARIO_SELECTION_STORAGE_KEY);
  } catch {
    return null;
  }
}

function App() {
  const [theme, setTheme] = useState<Theme>(getInitialTheme);
  const [studyMode, setStudyMode] = useState<StudyModeId>(() =>
    sanitizeSetupStudyMode(
      getStoredStudySession()?.studyMode ??
        getStoredStudyModeSelection() ??
        DEFAULT_STUDY_MODE
    )
  );
  const [selectedScenarioId, setSelectedScenarioId] = useState<string | null>(() =>
    getStoredStudySession()?.scenario.id ?? getStoredScenarioSelection()
  );
  const [selectedScenarioTitle, setSelectedScenarioTitle] = useState<string | null>(() =>
    getStoredStudySession()?.scenario.title ?? null
  );
  const [loggingParticipantId, setLoggingParticipantId] = useState<string>(() => {
    const storedPid = getStoredLoggingParticipantId();
    if (storedPid) return storedPid;
    return getStoredStudySession()?.loggingParticipantId ?? '';
  });
  const [studySession, setStudySession] = useState<StudySessionState | null>(() =>
    getStoredStudySession()
  );

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [theme]);

  useEffect(() => {
    try {
      window.localStorage.setItem(PID_LOGGING_STORAGE_KEY, loggingParticipantId);
    } catch {
      // Ignore storage write failures.
    }
  }, [loggingParticipantId]);

  useEffect(() => {
    if (studyMode !== sanitizeSetupStudyMode(studyMode)) {
      setStudyMode(sanitizeSetupStudyMode(studyMode));
      return;
    }
    try {
      window.localStorage.setItem(STUDY_MODE_STORAGE_KEY, studyMode);
    } catch {
      // Ignore storage write failures.
    }
  }, [studyMode]);

  useEffect(() => {
    try {
      if (selectedScenarioId) {
        window.localStorage.setItem(SCENARIO_SELECTION_STORAGE_KEY, selectedScenarioId);
      }
    } catch {
      // Ignore storage write failures.
    }
  }, [selectedScenarioId]);

  const handleThemeToggle = () => {
    setTheme('light');
  };

  const handleStudyReset = () => {
    clearStoredStudySession();
    setSelectedScenarioTitle(null);
    setStudySession(null);
  };

  const handleStudySessionCreated = (session: StudySessionState) => {
    setStoredStudySession(session);
    setStudySession(session);
    setStudyMode(session.studyMode);
    setSelectedScenarioId(session.scenario.id);
    setSelectedScenarioTitle(session.scenario.title);
    setLoggingParticipantId(session.loggingParticipantId ?? '');
  };

  useEffect(() => {
    if (!studySession) return;
    api.getCurrentStudySession()
      .then((sessionInfo) => {
        setStudySession((prev) => {
          if (!prev || prev.sessionId !== sessionInfo.sessionId) return prev;
          const prevBackground = prev.scenario.background ?? '';
          const nextBackground = sessionInfo.scenario.background;
          const prevStory = prev.scenario.story ?? '';
          const nextStory = sessionInfo.scenario.story;
          const prevStepBriefs = prev.scenario.stepBriefs ?? {};
          const nextStepBriefs = sessionInfo.scenario.stepBriefs;
          const prevPrefs = prev.scenario.narratorPreferenceTypes ?? [];
          const nextPrefs = sessionInfo.scenario.narratorPreferenceTypes;
          const prevSeatRows = prev.scenario.seatRows ?? [];
          const nextSeatRows = sessionInfo.scenario.seatRows ?? [];
          const sameBackground = prevBackground === nextBackground;
          const sameStory = prevStory === nextStory;
          const sameStepBriefs =
            JSON.stringify(prevStepBriefs) === JSON.stringify(nextStepBriefs);
          const samePrefs =
            prevPrefs.length === nextPrefs.length &&
            prevPrefs.every((value, index) => value === nextPrefs[index]);
          const sameSeatRows =
            prevSeatRows.length === nextSeatRows.length &&
            prevSeatRows.every((value, index) => value === nextSeatRows[index]);
          if (sameBackground && sameStory && sameStepBriefs && samePrefs && sameSeatRows) {
            return prev;
          }

          const nextSession: StudySessionState = {
            ...prev,
            scenario: {
              ...prev.scenario,
              background: sessionInfo.scenario.background,
              story: sessionInfo.scenario.story,
              stepBriefs: sessionInfo.scenario.stepBriefs,
              narratorPreferenceTypes: sessionInfo.scenario.narratorPreferenceTypes,
              seatRows: sessionInfo.scenario.seatRows,
            },
          };
          setStoredStudySession(nextSession);
          return nextSession;
        });
      })
      .catch(() => {
        handleStudyReset();
      });
  }, [studySession]);

  return (
    <BrowserRouter>
      <DevToolsProvider>
        <div className="flex h-screen">
          <div className="flex-1 overflow-hidden bg-dark text-fg">
            <Routes>
              <Route
                path="/"
                element={
                  <StudyStartPage
                    theme={theme}
                    onThemeToggle={handleThemeToggle}
                  selectedMode={studyMode}
                  onModeChange={setStudyMode}
                  selectedScenarioId={selectedScenarioId}
                  onScenarioChange={setSelectedScenarioId}
                  loggingParticipantId={loggingParticipantId}
                  onLoggingParticipantIdChange={setLoggingParticipantId}
                />
              }
            />
              <Route
                path="/task-review"
                element={selectedScenarioId ? (
                  <ScenarioReviewPage
                    studyMode={studyMode}
                    selectedScenarioId={selectedScenarioId}
                    loggingParticipantId={loggingParticipantId}
                    onSessionCreated={handleStudySessionCreated}
                  />
                ) : (
                  <Navigate to="/" replace />
                )}
              />
              <Route
                path="/booking"
                element={studySession ? (
                  <ChatPage
                    studyModePreset={studyMode}
                    studySession={studySession}
                  />
                ) : (
                  <Navigate to="/" replace />
                )}
              />
              <Route
                path="/end"
                element={
                  <StudyEndPage
                    selectedScenarioTitle={selectedScenarioTitle}
                    studySession={studySession}
                    onResetMode={handleStudyReset}
                  />
                }
              />
              <Route
                path="/survey/per-trial"
                element={
                  <PerTrialSurveyPage
                    loggingParticipantId={loggingParticipantId}
                  />
                }
              />
              <Route
                path="/survey/post-study"
                element={
                  <PostStudySurveyPage
                    loggingParticipantId={loggingParticipantId}
                  />
                }
              />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </div>
          {AGENT_CONSOLE_ENABLED ? <DevTools /> : null}
        </div>
      </DevToolsProvider>
    </BrowserRouter>
  );
}

export default App;
