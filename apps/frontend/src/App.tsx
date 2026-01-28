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
import './App.css';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<MovieStagePage />} />
        <Route path="/theater" element={<TheaterStagePage />} />
        <Route path="/date" element={<DateStagePage />} />
        <Route path="/time" element={<TimeStagePage />} />
        <Route path="/seats" element={<SeatStagePage />} />
        <Route path="/tickets" element={<TicketStagePage />} />
        <Route path="/confirm" element={<ConfirmPage />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
