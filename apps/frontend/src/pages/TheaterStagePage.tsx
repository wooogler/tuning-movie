import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Layout } from '../components/Layout';
import { api } from '../api/client';
import { useBookingStore } from '../store/bookingStore';
import { useDevTools } from '../components/DevToolsContext';
import { generateTheaterSpec, selectItem, type UISpec, type TheaterItem } from '../spec';
import { StageRenderer } from '../renderer';
import type { Theater } from '../types';

export function TheaterStagePage() {
  const navigate = useNavigate();
  const { movie, setTheater } = useBookingStore();
  const { setBackendData, setUiSpec } = useDevTools();
  const [spec, setSpec] = useState<UISpec<TheaterItem> | null>(null);
  const [theaters, setTheaters] = useState<Theater[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!movie) {
      navigate('/');
      return;
    }

    api
      .getTheatersByMovie(movie.id)
      .then((data) => {
        setTheaters(data.theaters);
        setBackendData({ theaters: data.theaters });
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [movie, navigate, setBackendData]);

  // Rebuild spec when theaters change
  useEffect(() => {
    if (theaters.length > 0 && movie) {
      const newSpec = generateTheaterSpec(theaters, movie.id);
      setSpec(newSpec);
      setUiSpec(newSpec);
    }
  }, [theaters, movie, setUiSpec]);

  const handleSelect = (id: string) => {
    if (spec) {
      const newSpec = selectItem(spec, id);
      setSpec(newSpec);
      setUiSpec(newSpec);
    }
  };

  const handleBack = () => {
    navigate('/');
  };

  const handleNext = () => {
    const selectedTheater = theaters.find((t) => t.id === spec?.state.selectedId);
    if (selectedTheater) {
      setTheater(selectedTheater);
      navigate('/date');
    }
  };

  if (loading) {
    return (
      <Layout title="Select Theater" step={2}>
        <p className="text-center text-gray-400">Loading...</p>
      </Layout>
    );
  }

  if (error) {
    return (
      <Layout title="Select Theater" step={2}>
        <p className="text-center text-primary">Error: {error}</p>
      </Layout>
    );
  }

  if (!spec) return null;

  return (
    <Layout title="Select Theater" step={2}>
      <StageRenderer
        spec={spec}
        onSelect={handleSelect}
        onNext={handleNext}
        onBack={handleBack}
      />
    </Layout>
  );
}
