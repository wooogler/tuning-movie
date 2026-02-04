import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Layout } from '../components/Layout';
import { api } from '../api/client';
import { useBookingStore } from '../store/bookingStore';
import { useDevTools } from '../components/DevToolsContext';
import { generateTicketSpec, setQuantity, type UISpec, type TicketItem } from '../spec';
import { StageRenderer } from '../renderer';
import type { TicketType } from '../types';

export function TicketStagePage() {
  const navigate = useNavigate();
  const { selectedSeats, tickets, setTickets } = useBookingStore();
  const { setBackendData, setUiSpec } = useDevTools();
  const [ticketTypes, setTicketTypes] = useState<TicketType[]>([]);
  const [spec, setSpec] = useState<UISpec<TicketItem> | null>(null);
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
        setBackendData({ ticketTypes: data.ticketTypes });
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [selectedSeats, navigate, setBackendData]);

  // Rebuild spec when ticketTypes change
  useEffect(() => {
    if (ticketTypes.length > 0) {
      // Convert store tickets to quantities
      const quantities: Record<string, number> = {};
      ticketTypes.forEach((t) => {
        const existing = tickets.find((ticket) => ticket.ticketType.id === t.id);
        quantities[t.id] = existing?.quantity ?? 0;
      });

      const newSpec = generateTicketSpec(
        ticketTypes,
        selectedSeats.map((s) => s.id),
        quantities
      );
      setSpec(newSpec);
      setUiSpec(newSpec);
    }
  }, [ticketTypes, selectedSeats, tickets, setUiSpec]);

  const handleQuantityChange = useCallback(
    (typeId: string, quantity: number) => {
      if (spec) {
        const newSpec = setQuantity(spec, typeId, quantity);
        setSpec(newSpec);
        setUiSpec(newSpec);

        // Update store
        const ticketType = ticketTypes.find((t) => t.id === typeId);
        if (ticketType) {
          const newTickets = tickets.filter((t) => t.ticketType.id !== typeId);
          if (quantity > 0) {
            newTickets.push({ ticketType, quantity });
          }
          setTickets(newTickets);
        }
      }
    },
    [spec, ticketTypes, tickets, setTickets, setUiSpec]
  );

  const handleBack = () => {
    navigate('/seats');
  };

  const handleNext = () => {
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
        <p className="text-center text-primary">Error: {error}</p>
      </Layout>
    );
  }

  if (!spec) return null;

  return (
    <Layout title="Select Tickets" step={6}>
      <StageRenderer
        spec={spec}
        onSelect={() => {}}
        onQuantityChange={handleQuantityChange}
        onNext={handleNext}
        onBack={handleBack}
      />
    </Layout>
  );
}
