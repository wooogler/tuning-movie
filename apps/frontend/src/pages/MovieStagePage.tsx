import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Layout } from '../components/Layout';
import { api } from '../api/client';
import { useBookingStore } from '../store/bookingStore';
import { convertMovieStage } from '../converter/movieStage';
import { SpecRenderer } from '../renderer';
import type { UISpec } from '../converter/types';
import type { Movie } from '../types';

export function MovieStagePage() {
  const navigate = useNavigate();
  const { setMovie } = useBookingStore();
  const [spec, setSpec] = useState<UISpec | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .getMovies()
      .then((data) => setSpec(convertMovieStage(data.movies)))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const handleAction = (actionName: string, data?: unknown) => {
    if (actionName === 'selectMovie') {
      setMovie(data as Movie);
      navigate('/theater');
    }
  };

  if (loading) {
    return (
      <Layout title="Select Movie" step={1}>
        <p className="text-center text-gray-400">Loading...</p>
      </Layout>
    );
  }

  if (error) {
    return (
      <Layout title="Select Movie" step={1}>
        <p className="text-center text-primary">Error: {error}</p>
      </Layout>
    );
  }

  if (!spec) return null;

  return (
    <Layout title="Select Movie" step={1}>
      <SpecRenderer spec={spec} onAction={handleAction} />
    </Layout>
  );
}
