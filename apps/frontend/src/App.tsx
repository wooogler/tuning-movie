import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { ChatPage } from './pages/ChatPage';
import { DevToolsProvider } from './components/DevToolsContext';
import { DevTools } from './components/DevTools';
import './App.css';

function App() {
  return (
    <BrowserRouter>
      <DevToolsProvider>
        <div className="flex h-screen">
          <div className="flex-1 overflow-hidden bg-dark">
            <Routes>
              <Route path="/" element={<ChatPage />} />
            </Routes>
          </div>
          <DevTools />
        </div>
      </DevToolsProvider>
    </BrowserRouter>
  );
}

export default App;
