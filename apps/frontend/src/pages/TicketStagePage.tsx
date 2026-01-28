import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Layout } from '../components/Layout';
import { api } from '../api/client';
import { useBookingStore } from '../store/bookingStore';
import type { TicketType } from '../types';

interface TicketSelection {
  ticketType: TicketType;
  quantity: number;
}

export function TicketStagePage() {
  const navigate = useNavigate();
  const { selectedSeats, setTickets, tickets: savedTickets } = useBookingStore();
  const [ticketTypes, setTicketTypes] = useState<TicketType[]>([]);
  const [selections, setSelections] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (selectedSeats.length === 0) {
      navigate('/');
      return;
    }

    api
      .getTicketTypes()
      .then((data) => {
        setTicketTypes(data.ticketTypes);
        if (savedTickets.length > 0) {
          const initial: Record<string, number> = {};
          savedTickets.forEach((t) => {
            initial[t.ticketType.id] = t.quantity;
          });
          setSelections(initial);
        }
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [selectedSeats, navigate, savedTickets]);

  const totalTickets = Object.values(selections).reduce((sum, qty) => sum + qty, 0);
  const requiredTickets = selectedSeats.length;

  const handleQuantityChange = (ticketTypeId: string, delta: number) => {
    setSelections((prev) => {
      const current = prev[ticketTypeId] || 0;
      const newValue = Math.max(0, current + delta);
      return { ...prev, [ticketTypeId]: newValue };
    });
  };

  const getTotalPrice = () => {
    return ticketTypes.reduce((total, tt) => {
      const qty = selections[tt.id] || 0;
      return total + tt.price * qty;
    }, 0);
  };

  const handleContinue = () => {
    if (totalTickets !== requiredTickets) return;

    const ticketSelections: TicketSelection[] = ticketTypes
      .filter((tt) => selections[tt.id] > 0)
      .map((tt) => ({
        ticketType: tt,
        quantity: selections[tt.id],
      }));

    setTickets(ticketSelections);
    navigate('/confirm');
  };

  if (loading) {
    return (
      <Layout title="Select Tickets" step={6}>
        <p className="text-center text-gray-400">Loading...</p>
      </Layout>
    );
  }

  if (error) {
    return (
      <Layout title="Select Tickets" step={6}>
        <p className="text-center text-[#e50914]">Error: {error}</p>
      </Layout>
    );
  }

  return (
    <Layout title="Select Tickets" step={6}>
      <p className="text-center text-gray-400 mb-6">
        You have selected <strong className="text-white">{requiredTickets}</strong> seat(s). Please
        select ticket types.
      </p>

      <div className="max-w-lg mx-auto space-y-4 mb-6">
        {ticketTypes.map((tt) => (
          <div
            key={tt.id}
            className="bg-[#1a1a1a] p-5 rounded-xl flex justify-between items-center"
          >
            <div>
              <h3 className="font-semibold mb-1">{tt.name}</h3>
              <p className="text-sm text-gray-400 mb-2">{tt.description}</p>
              <p className="text-lg font-bold text-[#e50914]">${tt.price.toFixed(2)}</p>
            </div>
            <div className="flex items-center gap-3">
              <button
                className="w-9 h-9 rounded-full bg-[#333] text-xl hover:bg-[#444] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                onClick={() => handleQuantityChange(tt.id, -1)}
                disabled={(selections[tt.id] || 0) === 0}
              >
                -
              </button>
              <span className="text-xl w-8 text-center">{selections[tt.id] || 0}</span>
              <button
                className="w-9 h-9 rounded-full bg-[#333] text-xl hover:bg-[#444] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                onClick={() => handleQuantityChange(tt.id, 1)}
                disabled={totalTickets >= requiredTickets}
              >
                +
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="text-center mb-6">
        <p>
          Total tickets: {totalTickets} / {requiredTickets}
          {totalTickets !== requiredTickets && (
            <span className="text-[#e50914]"> (must match seat count)</span>
          )}
        </p>
        <p className="text-2xl font-bold mt-2">Total: ${getTotalPrice().toFixed(2)}</p>
      </div>

      <div className="flex justify-center gap-4">
        <button
          className="px-6 py-3 bg-[#333] text-white rounded-lg hover:bg-[#444] transition-colors"
          onClick={() => navigate('/seats')}
        >
          Back
        </button>
        <button
          className={`px-6 py-3 rounded-lg transition-colors
            ${
              totalTickets !== requiredTickets
                ? 'bg-[#e50914]/50 cursor-not-allowed'
                : 'bg-[#e50914] hover:bg-[#f40612]'
            }
          `}
          onClick={handleContinue}
          disabled={totalTickets !== requiredTickets}
        >
          Continue
        </button>
      </div>
    </Layout>
  );
}
