import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Layout } from '../components/Layout';
import { api } from '../api/client';
import { useBookingStore } from '../store/bookingStore';
import type { Seat } from '../types';

export function SeatStagePage() {
  const navigate = useNavigate();
  const { showing, selectedSeats, toggleSeat } = useBookingStore();
  const [seats, setSeats] = useState<Seat[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!showing) {
      navigate('/');
      return;
    }

    api
      .getSeats(showing.id)
      .then((data) => setSeats(data.seats))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [showing, navigate]);

  const handleSeatClick = (seat: Seat) => {
    if (seat.status === 'occupied') return;
    toggleSeat(seat);
  };

  const handleContinue = () => {
    if (selectedSeats.length === 0) return;
    navigate('/tickets');
  };

  const isSelected = (seat: Seat) => selectedSeats.some((s) => s.id === seat.id);

  const seatsByRow = seats.reduce(
    (acc, seat) => {
      if (!acc[seat.row]) acc[seat.row] = [];
      acc[seat.row].push(seat);
      return acc;
    },
    {} as Record<string, Seat[]>
  );

  const rows = Object.keys(seatsByRow).sort();

  if (loading) {
    return (
      <Layout title="Select Seats" step={5}>
        <p className="text-center text-gray-400">Loading...</p>
      </Layout>
    );
  }

  if (error) {
    return (
      <Layout title="Select Seats" step={5}>
        <p className="text-center text-[#e50914]">Error: {error}</p>
      </Layout>
    );
  }

  return (
    <Layout title="Select Seats" step={5}>
      <div className="text-center py-3 bg-gradient-to-b from-gray-600 to-gray-800 rounded mb-10 text-sm tracking-widest">
        SCREEN
      </div>

      <div className="flex flex-col items-center gap-2 mb-8">
        {rows.map((row) => (
          <div key={row} className="flex items-center gap-2">
            <span className="w-6 text-center font-bold text-gray-500">{row}</span>
            <div className="flex gap-1.5">
              {seatsByRow[row]
                .sort((a, b) => a.number - b.number)
                .map((seat) => (
                  <button
                    key={seat.id}
                    className={`w-8 h-8 rounded text-xs font-medium transition-all
                      ${seat.type === 'couple' ? 'w-16' : ''}
                      ${
                        isSelected(seat)
                          ? 'bg-[#e50914] text-white'
                          : seat.status === 'occupied'
                            ? 'bg-[#1a1a1a] text-gray-600 cursor-not-allowed'
                            : seat.type === 'premium'
                              ? 'bg-amber-900 hover:bg-amber-800'
                              : seat.type === 'couple'
                                ? 'bg-purple-900 hover:bg-purple-800'
                                : 'bg-[#2a2a2a] hover:bg-[#3a3a3a]'
                      }
                    `}
                    onClick={() => handleSeatClick(seat)}
                    disabled={seat.status === 'occupied'}
                  >
                    {seat.number}
                  </button>
                ))}
            </div>
          </div>
        ))}
      </div>

      <div className="flex justify-center gap-6 flex-wrap mb-8">
        <div className="flex items-center gap-2 text-sm">
          <span className="w-5 h-5 rounded bg-[#2a2a2a]"></span> Available
        </div>
        <div className="flex items-center gap-2 text-sm">
          <span className="w-5 h-5 rounded bg-[#e50914]"></span> Selected
        </div>
        <div className="flex items-center gap-2 text-sm">
          <span className="w-5 h-5 rounded bg-[#1a1a1a]"></span> Occupied
        </div>
        <div className="flex items-center gap-2 text-sm">
          <span className="w-5 h-5 rounded bg-amber-900"></span> Premium
        </div>
        <div className="flex items-center gap-2 text-sm">
          <span className="w-5 h-5 rounded bg-purple-900"></span> Couple
        </div>
      </div>

      <div className="flex justify-center gap-4">
        <button
          className="px-6 py-3 bg-[#333] text-white rounded-lg hover:bg-[#444] transition-colors"
          onClick={() => navigate('/time')}
        >
          Back
        </button>
        <button
          className={`px-6 py-3 rounded-lg transition-colors
            ${
              selectedSeats.length === 0
                ? 'bg-[#e50914]/50 cursor-not-allowed'
                : 'bg-[#e50914] hover:bg-[#f40612]'
            }
          `}
          onClick={handleContinue}
          disabled={selectedSeats.length === 0}
        >
          Continue ({selectedSeats.length} selected)
        </button>
      </div>
    </Layout>
  );
}
