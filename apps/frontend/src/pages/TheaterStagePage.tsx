import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Layout } from '../components/Layout';
import { api } from '../api/client';
import { useBookingStore } from '../store/bookingStore';
import { useDevTools } from '../components/DevToolsContext';
import { convertTheaterStage } from '../converter/theaterStage';
import { SpecRenderer } from '../renderer';
import type { UISpec } from '../converter/types';
import type { Theater } from '../types';

export function TheaterStagePage() {
  const navigate = useNavigate();
  const { movie, setTheater } = useBookingStore();
  const { setBackendData, setUiSpec } = useDevTools();
  const [spec, setSpec] = useState<UISpec | null>(null);
  const [theaters, setTheaters] = useState<Theater[]>([]);
  const [selectedTheaterId, setSelectedTheaterId] = useState<string | undefined>();
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

  // Rebuild spec when theaters or selection changes
  useEffect(() => {
    if (theaters.length > 0) {
      const newSpec = convertTheaterStage(theaters, selectedTheaterId);
      setSpec(newSpec);
      setUiSpec(newSpec);
    }
  }, [theaters, selectedTheaterId, setUiSpec]);

  const handleAction = (actionName: string, data?: unknown) => {
    if (actionName === 'selectTheater') {
      setSelectedTheaterId(data as string);
    }
    if (actionName === 'back') {
      navigate('/');
    }
    if (actionName === 'next') {
      const selectedTheater = theaters.find((t) => t.id === selectedTheaterId);
      if (selectedTheater) {
        setTheater(selectedTheater);
        navigate('/date');
      }
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
      <SpecRenderer spec={spec} onAction={handleAction} />
    </Layout>
  );
}
