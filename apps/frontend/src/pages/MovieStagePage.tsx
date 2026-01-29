import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Layout } from '../components/Layout';
import { api } from '../api/client';
import { useBookingStore } from '../store/bookingStore';
import { useDevTools } from '../components/DevToolsContext';
import { convertMovieStage } from '../converter/movieStage';
import { SpecRenderer } from '../renderer';
import type { UISpec } from '../converter/types';
import type { Movie } from '../types';

export function MovieStagePage() {
  const navigate = useNavigate();
  const { setMovie } = useBookingStore();
  const { setBackendData, setUiSpec } = useDevTools();
  const [spec, setSpec] = useState<UISpec | null>(null);
  const [movies, setMovies] = useState<Movie[]>([]);
  const [selectedMovieId, setSelectedMovieId] = useState<string | undefined>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .getMovies()
      .then((data) => {
        setMovies(data.movies);
        setBackendData({ movies: data.movies });
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [setBackendData]);

  // Rebuild spec when movies or selection changes
  useEffect(() => {
    if (movies.length > 0) {
      const newSpec = convertMovieStage(movies, selectedMovieId);
      setSpec(newSpec);
      setUiSpec(newSpec);
    }
  }, [movies, selectedMovieId, setUiSpec]);

  const handleAction = (actionName: string, data?: unknown) => {
    if (actionName === 'selectMovie') {
      setSelectedMovieId(data as string);
    }
    if (actionName === 'next') {
      const selectedMovie = movies.find((m) => m.id === selectedMovieId);
      if (selectedMovie) {
        setMovie(selectedMovie);
        navigate('/theater');
      }
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
