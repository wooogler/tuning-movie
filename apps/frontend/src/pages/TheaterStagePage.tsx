import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Layout } from '../components/Layout';
import { api } from '../api/client';
import { useBookingStore } from '../store/bookingStore';
import { convertTheaterStage } from '../converter/theaterStage';
import { SpecRenderer } from '../renderer';
import type { UISpec } from '../converter/types';
import type { Theater } from '../types';

export function TheaterStagePage() {
  const navigate = useNavigate();
  const { movie, setTheater } = useBookingStore();
  const [spec, setSpec] = useState<UISpec | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!movie) {
      navigate('/');
      return;
    }

    api
      .getTheatersByMovie(movie.id)
      .then((data) => setSpec(convertTheaterStage(data.theaters)))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [movie, navigate]);

  const handleAction = (actionName: string, data?: unknown) => {
    if (actionName === 'selectTheater') {
      setTheater(data as Theater);
      navigate('/date');
    }
    if (actionName === 'back') {
      navigate('/');
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
