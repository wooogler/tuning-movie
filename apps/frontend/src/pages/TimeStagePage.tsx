import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Layout } from '../components/Layout';
import { api } from '../api/client';
import { useBookingStore } from '../store/bookingStore';
import { useDevTools } from '../components/DevToolsContext';
import { generateTimeSpec, selectItem, type UISpec, type TimeItem } from '../spec';
import { StageRenderer } from '../renderer';
import type { Showing } from '../types';

export function TimeStagePage() {
  const navigate = useNavigate();
  const { movie, theater, date, setShowing } = useBookingStore();
  const { setBackendData, setUiSpec } = useDevTools();
  const [spec, setSpec] = useState<UISpec<TimeItem> | null>(null);
  const [showings, setShowings] = useState<Showing[]>([]);
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

  // Rebuild spec when showings change
  useEffect(() => {
    if (showings.length > 0 && movie && theater && date) {
      const newSpec = generateTimeSpec(showings, movie.id, theater.id, date);
      setSpec(newSpec);
      setUiSpec(newSpec);
    }
  }, [showings, movie, theater, date, setUiSpec]);

  const handleSelect = (id: string) => {
    if (spec) {
      const newSpec = selectItem(spec, id);
      setSpec(newSpec);
      setUiSpec(newSpec);
    }
  };

  const handleBack = () => {
    navigate('/date');
  };

  const handleNext = () => {
    const selectedShowing = showings.find((s) => s.id === spec?.state.selectedId);
    if (selectedShowing) {
      setShowing(selectedShowing);
      navigate('/seats');
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
      <StageRenderer
        spec={spec}
        onSelect={handleSelect}
        onNext={handleNext}
        onBack={handleBack}
      />
    </Layout>
  );
}
