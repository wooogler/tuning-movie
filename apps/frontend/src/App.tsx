import { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ChatPage } from './pages/ChatPage';
import { StudyStartPage } from './pages/StudyStartPage';
import { StudyEndPage } from './pages/StudyEndPage';
import { DEFAULT_STUDY_MODE, type StudyModeId } from './pages/studyOptions';
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
  const [studyMode, setStudyMode] = useState<StudyModeId>(DEFAULT_STUDY_MODE);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [theme]);

  const handleThemeToggle = () => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  };

  const handleStudyReset = () => {
    setStudyMode(DEFAULT_STUDY_MODE);
  };

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
                  />
                }
              />
              <Route
                path="/booking"
                element={
                  <ChatPage
                    theme={theme}
                    onThemeToggle={handleThemeToggle}
                    studyModePreset={studyMode}
                  />
                }
              />
              <Route
                path="/end"
                element={
                  <StudyEndPage
                    theme={theme}
                    onThemeToggle={handleThemeToggle}
                    selectedMode={studyMode}
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
