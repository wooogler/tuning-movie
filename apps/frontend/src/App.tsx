import { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { ChatPage } from './pages/ChatPage';
import { DevToolsProvider } from './components/DevToolsContext';
import { DevTools } from './components/DevTools';
import './App.css';

type Theme = 'dark' | 'light';

const THEME_STORAGE_KEY = 'tuning-movie-theme';

function getInitialTheme(): Theme {
  if (typeof window === 'undefined') return 'dark';

  const storedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
  return storedTheme === 'light' || storedTheme === 'dark' ? storedTheme : 'dark';
}

function App() {
  const [theme, setTheme] = useState<Theme>(getInitialTheme);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [theme]);

  const handleThemeToggle = () => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
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
                  <ChatPage
                    theme={theme}
                    onThemeToggle={handleThemeToggle}
                  />
                }
              />
            </Routes>
          </div>
          <DevTools />
        </div>
      </DevToolsProvider>
    </BrowserRouter>
  );
}

export default App;
