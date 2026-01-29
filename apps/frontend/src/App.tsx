import { BrowserRouter, Routes, Route } from 'react-router-dom';
import {
  MovieStagePage,
  TheaterStagePage,
  DateStagePage,
  TimeStagePage,
  SeatStagePage,
  TicketStagePage,
  ConfirmPage,
} from './pages';
import { DevToolsProvider } from './components/DevToolsContext';
import { DevTools } from './components/DevTools';
import './App.css';

function App() {
  return (
    <BrowserRouter>
      <DevToolsProvider>
        <div className="flex h-screen">
          <div className="flex-1 flex items-center justify-center overflow-auto bg-dark">
            <Routes>
              <Route path="/" element={<MovieStagePage />} />
              <Route path="/theater" element={<TheaterStagePage />} />
              <Route path="/date" element={<DateStagePage />} />
              <Route path="/time" element={<TimeStagePage />} />
              <Route path="/seats" element={<SeatStagePage />} />
              <Route path="/tickets" element={<TicketStagePage />} />
              <Route path="/confirm" element={<ConfirmPage />} />
            </Routes>
          </div>
          <DevTools />
        </div>
      </DevToolsProvider>
    </BrowserRouter>
  );
}

export default App;
