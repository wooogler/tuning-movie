import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Layout } from '../components/Layout';
import { api } from '../api/client';
import { useBookingStore } from '../store/bookingStore';
import { convertTicketStage } from '../converter/ticketStage';
import { SpecRenderer } from '../renderer';
import type { UISpec } from '../converter/types';
import type { TicketType } from '../types';

export function TicketStagePage() {
  const navigate = useNavigate();
  const { selectedSeats, tickets, setTickets } = useBookingStore();
  const [ticketTypes, setTicketTypes] = useState<TicketType[]>([]);
  const [spec, setSpec] = useState<UISpec | null>(null);
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
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [selectedSeats, navigate]);

  // Rebuild spec when ticketTypes or tickets change
  useEffect(() => {
    if (ticketTypes.length > 0) {
      setSpec(convertTicketStage(ticketTypes, selectedSeats.length, tickets));
    }
  }, [ticketTypes, selectedSeats.length, tickets]);

  const handleAction = useCallback(
    (actionName: string, data?: unknown) => {
      if (actionName === 'incrementTicket' || actionName === 'decrementTicket') {
        const { ticketType, delta } = data as {
          ticketType: TicketType;
          delta: number;
        };
        const existing = tickets.find((t) => t.ticketType.id === ticketType.id);
        if (existing) {
          const newQuantity = existing.quantity + delta;
          if (newQuantity <= 0) {
            setTickets(tickets.filter((t) => t.ticketType.id !== ticketType.id));
          } else {
            setTickets(
              tickets.map((t) =>
                t.ticketType.id === ticketType.id
                  ? { ...t, quantity: newQuantity }
                  : t,
              ),
            );
          }
        } else if (delta > 0) {
          setTickets([...tickets, { ticketType, quantity: 1 }]);
        }
      }
      if (actionName === 'back') {
        navigate('/seats');
      }
      if (actionName === 'next') {
        navigate('/confirm');
      }
    },
    [tickets, setTickets, navigate],
  );

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
        <p className="text-center text-primary">Error: {error}</p>
      </Layout>
    );
  }

  if (!spec) return null;

  return (
    <Layout title="Select Tickets" step={6}>
      <SpecRenderer spec={spec} onAction={handleAction} />
    </Layout>
  );
}
