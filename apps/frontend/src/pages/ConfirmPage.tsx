import { useState, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Layout } from '../components/Layout';
import { api } from '../api/client';
import { useBookingStore } from '../store/bookingStore';
import { useDevTools } from '../components/DevToolsContext';
import { generateConfirmSpec, type UISpec, type ConfirmMeta } from '../spec';
import { StageRenderer } from '../renderer';
import type { Booking } from '../types';

export function ConfirmPage() {
  const navigate = useNavigate();
  const {
    movie,
    theater,
    date,
    showing,
    selectedSeats,
    tickets,
    getTotalPrice,
    reset,
  } = useBookingStore();
  const { setUiSpec } = useDevTools();

  const [booking, setBooking] = useState<Booking | null>(null);
  const [spec, setSpec] = useState<UISpec | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Redirect if missing required data
  useEffect(() => {
    if (!movie || !theater || !date || !showing || selectedSeats.length === 0) {
      navigate('/');
      return;
    }

    const meta: ConfirmMeta = {
      movie: { id: movie.id, title: movie.title },
      theater: { id: theater.id, name: theater.name },
      date,
      time: showing.time,
      seats: selectedSeats.map((s) => s.id),
      tickets: tickets.map((t) => ({
        type: t.ticketType.name,
        quantity: t.quantity,
        price: t.ticketType.price,
      })),
      totalPrice: getTotalPrice(),
    };

    const newSpec = generateConfirmSpec(meta);
    setSpec(newSpec);
    setUiSpec(newSpec);
  }, [movie, theater, date, showing, selectedSeats, tickets, getTotalPrice, navigate, setUiSpec]);

  const handleBack = () => {
    navigate('/tickets');
  };

  const handleConfirm = useCallback(async () => {
    if (!showing) return;

    setLoading(true);
    setError(null);

    try {
      const result = await api.createBooking({
        showingId: showing.id,
        seats: selectedSeats.map((s) => s.id),
        tickets: tickets.map((t) => ({
          ticketTypeId: t.ticketType.id,
          quantity: t.quantity,
        })),
        customerName: 'Guest',
        customerEmail: 'guest@example.com',
      });
      setBooking(result.booking);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Booking failed');
    } finally {
      setLoading(false);
    }
  }, [showing, selectedSeats, tickets]);

  const handleBookAnother = () => {
    reset();
    navigate('/');
  };

  if (loading) {
    return (
      <Layout title="Confirming..." step={7}>
        <p className="text-center text-gray-400">Processing your booking...</p>
      </Layout>
    );
  }

  if (error) {
    return (
      <Layout title="Confirm Booking" step={7}>
        <div className="text-center">
          <p className="text-primary mb-4">Error: {error}</p>
          <button
            className="px-6 py-3 bg-dark-border text-white rounded-lg hover:bg-dark-lighter"
            onClick={() => setError(null)}
          >
            Try Again
          </button>
        </div>
      </Layout>
    );
  }

  if (booking) {
    return (
      <Layout title="Booking Complete" step={7}>
        <div className="flex flex-col items-center gap-6">
          <div className="w-full max-w-md bg-dark-light rounded-xl p-6 text-center">
            <div className="text-4xl mb-4">🎉</div>
            <h2 className="text-xl font-semibold text-white mb-2">
              Booking Confirmed!
            </h2>
            <p className="text-gray-400 mb-4">
              Booking ID: {booking.id}
            </p>
            <p className="text-primary font-semibold">
              Total: ₩{booking.totalPrice.toLocaleString()}
            </p>
          </div>

          <button
            className="px-6 py-3 bg-primary hover:bg-primary-hover text-white rounded-lg"
            onClick={handleBookAnother}
          >
            Book Another
          </button>
        </div>
      </Layout>
    );
  }

  if (!spec) return null;

  return (
    <Layout title={spec.title} description={spec.description} step={7}>
      <StageRenderer
        spec={spec}
        onSelect={() => {}}
        onNext={handleConfirm}
        onBack={handleBack}
        onConfirm={handleConfirm}
      />
    </Layout>
  );
}
