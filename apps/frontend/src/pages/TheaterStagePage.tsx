import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Layout } from '../components/Layout';
import { api } from '../api/client';
import { useBookingStore } from '../store/bookingStore';
import type { Theater } from '../types';

export function TheaterStagePage() {
  const navigate = useNavigate();
  const { movie, setTheater, theater: selectedTheater } = useBookingStore();
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
      .then((data) => setTheaters(data.theaters))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [movie, navigate]);

  const handleSelect = (theater: Theater) => {
    setTheater(theater);
    navigate('/date');
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
        <p className="text-center text-[#e50914]">Error: {error}</p>
      </Layout>
    );
  }

  return (
    <Layout title="Select Theater" step={2}>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 max-w-4xl mx-auto">
        {theaters.map((theater) => (
          <div
            key={theater.id}
            className={`bg-[#1a1a1a] p-5 rounded-xl cursor-pointer transition-all
              hover:bg-[#2a2a2a]
              ${selectedTheater?.id === theater.id ? 'ring-2 ring-[#e50914] bg-[#2a1a1a]' : ''}
            `}
            onClick={() => handleSelect(theater)}
          >
            <h3 className="font-semibold mb-2">{theater.name}</h3>
            <p className="text-sm text-gray-400">{theater.location}</p>
            <p className="text-sm text-gray-500">{theater.screenCount} screens</p>
          </div>
        ))}
      </div>
      <div className="flex justify-center mt-6">
        <button
          className="px-6 py-3 bg-[#333] text-white rounded-lg hover:bg-[#444] transition-colors"
          onClick={() => navigate('/')}
        >
          Back
        </button>
      </div>
    </Layout>
  );
}
