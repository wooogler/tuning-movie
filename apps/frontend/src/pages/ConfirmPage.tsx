import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Layout } from '../components/Layout';
import { api } from '../api/client';
import { useBookingStore } from '../store/bookingStore';
import { convertConfirmStage, convertBookingResultStage } from '../converter/confirmStage';
import { SpecRenderer } from '../renderer';
import type { UISpec } from '../converter/types';
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
    customerName,
    customerEmail,
    setCustomerInfo,
    getTotalPrice,
    reset,
  } = useBookingStore();

  const [booking, setBooking] = useState<Booking | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Redirect if missing required data
  if (!movie || !theater || !date || !showing || selectedSeats.length === 0) {
    navigate('/');
    return null;
  }

  const totalPrice = getTotalPrice();

  const spec: UISpec = booking
    ? convertBookingResultStage(booking)
    : convertConfirmStage({
        movie,
        theater,
        date,
        showing,
        selectedSeats,
        tickets,
        totalPrice,
        customerName,
        customerEmail,
      });

  const handleAction = useCallback(
    async (actionName: string, data?: unknown) => {
      if (actionName === 'submit') {
        const { customerName: name, customerEmail: email } = data as {
          customerName: string;
          customerEmail: string;
        };
        setCustomerInfo(name, email);
        setLoading(true);
        setError(null);

        try {
          const result = await api.createBooking({
            showingId: showing!.id,
            seats: selectedSeats.map((s) => s.id),
            tickets: tickets.map((t) => ({
              ticketTypeId: t.ticketType.id,
              quantity: t.quantity,
            })),
            customerName: name,
            customerEmail: email,
          });
          setBooking(result.booking);
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Booking failed');
        } finally {
          setLoading(false);
        }
      }
      if (actionName === 'back') {
        navigate('/tickets');
      }
      if (actionName === 'bookAnother') {
        reset();
        navigate('/');
      }
    },
    [showing, selectedSeats, tickets, setCustomerInfo, reset, navigate],
  );

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

  return (
    <Layout title={booking ? 'Booking Complete' : 'Confirm Booking'} step={7}>
      <SpecRenderer spec={spec} onAction={handleAction} />
    </Layout>
  );
}
