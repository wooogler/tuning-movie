import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Layout } from '../components/Layout';
import { api } from '../api/client';
import { useBookingStore } from '../store/bookingStore';
import { useDevTools } from '../components/DevToolsContext';
import { generateSeatSpec, toggleItem, type UISpec, type SeatItem } from '../spec';
import { StageRenderer } from '../renderer';
import type { Seat } from '../types';

export function SeatStagePage() {
  const navigate = useNavigate();
  const { movie, theater, date, showing, setSelectedSeats } = useBookingStore();
  const { setBackendData, setUiSpec } = useDevTools();
  const [seats, setSeats] = useState<Seat[]>([]);
  const [spec, setSpec] = useState<UISpec<SeatItem> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!showing) {
      navigate('/');
      return;
    }

    api
      .getSeats(showing.id)
      .then((data) => {
        setSeats(data.seats);
        setBackendData({ seats: data.seats });
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [showing, navigate, setBackendData]);

  // Rebuild spec when seats change
  useEffect(() => {
    if (seats.length > 0 && movie && theater && date && showing) {
      const newSpec = generateSeatSpec(
        seats,
        movie.id,
        theater.id,
        date,
        showing.id
      );
      setSpec(newSpec);
      setUiSpec(newSpec);
    }
  }, [seats, movie, theater, date, showing, setUiSpec]);

  const handleToggle = useCallback(
    (id: string) => {
      if (spec) {
        const newSpec = toggleItem(spec, id);
        setSpec(newSpec);
        setUiSpec(newSpec);
      }
    },
    [spec, setUiSpec]
  );

  const handleBack = () => {
    navigate('/time');
  };

  const handleNext = () => {
    if (spec?.state.selectedIds && spec.state.selectedIds.length > 0) {
      // Convert selected IDs to Seat objects for the store
      const selectedSeatObjects = seats.filter((s) =>
        spec.state.selectedIds?.includes(s.id)
      );
      setSelectedSeats(selectedSeatObjects);
      navigate('/tickets');
    }
  };

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
      <StageRenderer
        spec={spec}
        onSelect={handleToggle}
        onToggle={handleToggle}
        onNext={handleNext}
        onBack={handleBack}
      />
    </Layout>
  );
}
