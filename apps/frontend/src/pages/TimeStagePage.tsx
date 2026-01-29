import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Layout } from '../components/Layout';
import { api } from '../api/client';
import { useBookingStore } from '../store/bookingStore';
import { useDevTools } from '../components/DevToolsContext';
import { convertTimeStage } from '../converter/timeStage';
import { SpecRenderer } from '../renderer';
import type { UISpec } from '../converter/types';
import type { Showing } from '../types';

export function TimeStagePage() {
  const navigate = useNavigate();
  const { movie, theater, date, setShowing } = useBookingStore();
  const { setBackendData, setUiSpec } = useDevTools();
  const [spec, setSpec] = useState<UISpec | null>(null);
  const [showings, setShowings] = useState<Showing[]>([]);
  const [selectedShowingId, setSelectedShowingId] = useState<string | undefined>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!movie || !theater || !date) {
      navigate('/');
      return;
    }

    api
      .getTimes(movie.id, theater.id, date)
      .then((data) => {
        setShowings(data.showings);
        setBackendData({ showings: data.showings });
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [movie, theater, date, navigate, setBackendData]);

  // Rebuild spec when showings or selection changes
  useEffect(() => {
    if (showings.length > 0) {
      const newSpec = convertTimeStage(showings, selectedShowingId);
      setSpec(newSpec);
      setUiSpec(newSpec);
    }
  }, [showings, selectedShowingId, setUiSpec]);

  const handleAction = (actionName: string, data?: unknown) => {
    if (actionName === 'selectTime') {
      setSelectedShowingId(data as string);
    }
    if (actionName === 'back') {
      navigate('/date');
    }
    if (actionName === 'next') {
      const selectedShowing = showings.find((s) => s.id === selectedShowingId);
      if (selectedShowing) {
        setShowing(selectedShowing);
        navigate('/seats');
      }
    }
  };

  if (loading) {
    return (
      <Layout title="Select Time" step={4}>
        <p className="text-center text-gray-400">Loading...</p>
      </Layout>
    );
  }

  if (error) {
    return (
      <Layout title="Select Time" step={4}>
        <p className="text-center text-primary">Error: {error}</p>
      </Layout>
    );
  }

  if (!spec) return null;

  return (
    <Layout title="Select Time" step={4}>
      <SpecRenderer spec={spec} onAction={handleAction} />
    </Layout>
  );
}
