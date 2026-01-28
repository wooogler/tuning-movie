import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Layout } from '../components/Layout';
import { api } from '../api/client';
import { useBookingStore } from '../store/bookingStore';
import type { Movie } from '../types';

export function MovieStagePage() {
  const navigate = useNavigate();
  const { setMovie, movie: selectedMovie } = useBookingStore();
  const [movies, setMovies] = useState<Movie[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .getMovies()
      .then((data) => setMovies(data.movies))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const handleSelect = (movie: Movie) => {
    setMovie(movie);
    navigate('/theater');
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
        <p className="text-center text-[#e50914]">Error: {error}</p>
      </Layout>
    );
  }

  return (
    <Layout title="Select Movie" step={1}>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-6">
        {movies.map((movie) => (
          <div
            key={movie.id}
            className={`bg-[#1a1a1a] rounded-xl overflow-hidden cursor-pointer transition-all duration-200
              hover:-translate-y-1 hover:shadow-lg hover:shadow-[#e50914]/30
              ${selectedMovie?.id === movie.id ? 'ring-2 ring-[#e50914]' : ''}
            `}
            onClick={() => handleSelect(movie)}
          >
            <img
              src={movie.posterUrl}
              alt={movie.title}
              className="w-full h-64 object-cover"
            />
            <div className="p-4">
              <h3 className="font-semibold text-sm mb-2 line-clamp-2">{movie.title}</h3>
              <p className="text-xs text-gray-400 mb-1">{movie.genre.join(', ')}</p>
              <p className="text-xs text-gray-500">{movie.duration} min</p>
              <p className="text-xs text-gray-500">{movie.rating}</p>
            </div>
          </div>
        ))}
      </div>
    </Layout>
  );
}
