import { useEffect, useState, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Layout } from '../components/Layout';
import { api } from '../api/client';
import { useBookingStore } from '../store/bookingStore';
import { useDevTools } from '../components/DevToolsContext';
import { convertSeatStage } from '../converter/seatStage';
import { SpecRenderer } from '../renderer';
import type { UISpec } from '../converter/types';
import type { Seat } from '../types';

export function SeatStagePage() {
  const navigate = useNavigate();
  const { showing, selectedSeats, toggleSeat } = useBookingStore();
  const { setBackendData, setUiSpec } = useDevTools();
  const [seats, setSeats] = useState<Seat[]>([]);
  const [spec, setSpec] = useState<UISpec | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const selectedSeatIds = useMemo(() => selectedSeats.map((s) => s.id), [selectedSeats]);

  useEffect(() => {
    if (!showing) {
      navigate('/');
      return;
    }

    api
      .getSeats(showing.id)
      .then((data) => {
        setSeats(data.seats);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [showing, navigate]);

  // Rebuild spec when seats or selection changes
  useEffect(() => {
    if (seats.length > 0) {
      const newSpec = convertSeatStage(seats, selectedSeatIds);
      setSpec(newSpec);
      setBackendData({ seats });
      setUiSpec(newSpec);
    }
  }, [seats, selectedSeatIds, setBackendData, setUiSpec]);

  const handleAction = useCallback(
    (actionName: string, data?: unknown) => {
      if (actionName === 'toggleSeat') {
        toggleSeat(data as Seat);
      }
      if (actionName === 'back') {
        navigate('/time');
      }
      if (actionName === 'next') {
        navigate('/tickets');
      }
    },
    [toggleSeat, navigate],
  );

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
        <p className="text-center text-primary">Error: {error}</p>
      </Layout>
    );
  }

  if (!spec) return null;

  return (
    <Layout title="Select Seats" step={5}>
      <SpecRenderer spec={spec} onAction={handleAction} />
    </Layout>
  );
}
