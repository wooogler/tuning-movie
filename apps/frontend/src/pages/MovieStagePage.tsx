import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Layout } from '../components/Layout';
import { api } from '../api/client';
import { useBookingStore } from '../store/bookingStore';
import { useDevTools } from '../components/DevToolsContext';
import { useToolHandler } from '../hooks';
import { generateMovieSpec, selectItem, type UISpec, type MovieItem } from '../spec';
import { StageRenderer } from '../renderer';
import type { Movie } from '../types';

export function MovieStagePage() {
  const navigate = useNavigate();
  const { setMovie } = useBookingStore();
  const { setBackendData, setUiSpec } = useDevTools();
  const [spec, setSpec] = useState<UISpec<MovieItem> | null>(null);
  const [movies, setMovies] = useState<Movie[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const handleNext = useCallback(() => {
    const selectedMovie = movies.find((m) => m.id === spec?.state.selected?.id);
    if (selectedMovie) {
      setMovie(selectedMovie);
      navigate('/theater');
    }
  }, [movies, spec?.state.selected?.id, setMovie, navigate]);

  // Tool handler
  useToolHandler({
    spec,
    setSpec,
    onNext: handleNext,
    // No onBack for first stage
  });

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

  // Rebuild spec when movies change
  useEffect(() => {
    if (movies.length > 0) {
      const newSpec = generateMovieSpec(movies);
      setSpec(newSpec);
      setUiSpec(newSpec);
    }
  }, [movies, setUiSpec]);

  const handleSelect = (id: string) => {
    if (spec) {
      const newSpec = selectItem(spec, id);
      setSpec(newSpec);
      setUiSpec(newSpec);
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
    <Layout title={spec.title} description={spec.description} step={1}>
      <StageRenderer
        spec={spec}
        onSelect={handleSelect}
        onNext={handleNext}
      />
    </Layout>
  );
}
