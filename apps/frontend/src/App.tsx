import { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ChatPage } from './pages/ChatPage';
import { StudyStartPage } from './pages/StudyStartPage';
import { ScenarioReviewPage } from './pages/ScenarioReviewPage';
import { StudyEndPage } from './pages/StudyEndPage';
import { DEFAULT_STUDY_MODE, type StudyModeId } from './pages/studyOptions';
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

function getInitialTheme(): Theme {
  if (typeof window === 'undefined') return 'light';

  const storedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
  return storedTheme === 'light' || storedTheme === 'dark' ? storedTheme : 'light';
}

function App() {
  const [theme, setTheme] = useState<Theme>(getInitialTheme);
  const [studyMode, setStudyMode] = useState<StudyModeId>(() =>
    getStoredStudySession()?.studyMode ?? DEFAULT_STUDY_MODE
  );
  const [selectedScenarioId, setSelectedScenarioId] = useState<string | null>(() =>
    getStoredStudySession()?.scenario.id ?? null
  );
  const [selectedScenarioTitle, setSelectedScenarioTitle] = useState<string | null>(() =>
    getStoredStudySession()?.scenario.title ?? null
  );
  const [studySession, setStudySession] = useState<StudySessionState | null>(() =>
    getStoredStudySession()
  );

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [theme]);

  const handleThemeToggle = () => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  };

  const handleStudyReset = () => {
    clearStoredStudySession();
    setStudyMode(DEFAULT_STUDY_MODE);
    setSelectedScenarioId(null);
    setSelectedScenarioTitle(null);
    setStudySession(null);
  };

  const handleStudySessionCreated = (session: StudySessionState) => {
    setStoredStudySession(session);
    setStudySession(session);
    setStudyMode(session.studyMode);
    setSelectedScenarioId(session.scenario.id);
    setSelectedScenarioTitle(session.scenario.title);
  };

  const handleStudySessionCleared = () => {
    clearStoredStudySession();
    setStudySession(null);
  };

  useEffect(() => {
    if (!studySession) return;
    api.getCurrentStudySession()
      .then((sessionInfo) => {
        setStudySession((prev) => {
          if (!prev || prev.sessionId !== sessionInfo.sessionId) return prev;
          const prevStory = prev.scenario.story ?? '';
          const nextStory = sessionInfo.scenario.story;
          const prevPrefs = prev.scenario.narratorPreferenceTypes ?? [];
          const nextPrefs = sessionInfo.scenario.narratorPreferenceTypes;
          const sameStory = prevStory === nextStory;
          const samePrefs =
            prevPrefs.length === nextPrefs.length &&
            prevPrefs.every((value, index) => value === nextPrefs[index]);
          if (sameStory && samePrefs) return prev;

          const nextSession: StudySessionState = {
            ...prev,
            scenario: {
              ...prev.scenario,
              story: sessionInfo.scenario.story,
              narratorPreferenceTypes: sessionInfo.scenario.narratorPreferenceTypes,
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
                  />
                }
              />
              <Route
                path="/task-review"
                element={selectedScenarioId ? (
                  <ScenarioReviewPage
                    theme={theme}
                    onThemeToggle={handleThemeToggle}
                    studyMode={studyMode}
                    selectedScenarioId={selectedScenarioId}
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
                    theme={theme}
                    onThemeToggle={handleThemeToggle}
                    studyModePreset={studyMode}
                    studySession={studySession}
                    onStudySessionCleared={handleStudySessionCleared}
                  />
                ) : (
                  <Navigate to="/" replace />
                )}
              />
              <Route
                path="/end"
                element={
                  <StudyEndPage
                    theme={theme}
                    onThemeToggle={handleThemeToggle}
                    selectedMode={studyMode}
                    selectedScenarioTitle={selectedScenarioTitle}
                    onResetMode={handleStudyReset}
                  />
                }
              />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </div>
          <DevTools />
        </div>
      </DevToolsProvider>
    </BrowserRouter>
  );
}

export default App;
