import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Layout } from '../components/Layout';
import { api } from '../api/client';
import { useBookingStore } from '../store/bookingStore';
import type { Showing } from '../types';

export function TimeStagePage() {
  const navigate = useNavigate();
  const { movie, theater, date, setShowing, showing: selectedShowing } = useBookingStore();
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
      .then((data) => setShowings(data.showings))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [movie, theater, date, navigate]);

  const handleSelect = (showing: Showing) => {
    setShowing(showing);
    navigate('/seats');
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
        <p className="text-center text-[#e50914]">Error: {error}</p>
      </Layout>
    );
  }

  return (
    <Layout title="Select Time" step={4}>
      <div className="flex flex-wrap justify-center gap-4">
        {showings.map((showing) => (
          <div
            key={showing.id}
            className={`px-6 py-4 rounded-lg cursor-pointer transition-all text-center min-w-[140px]
              ${selectedShowing?.id === showing.id ? 'bg-[#e50914]' : 'bg-[#1a1a1a] hover:bg-[#2a2a2a]'}
            `}
            onClick={() => handleSelect(showing)}
          >
            <span className="block text-xl font-bold mb-1">{showing.time}</span>
            <span
              className={`block text-sm ${selectedShowing?.id === showing.id ? 'text-white/80' : 'text-gray-400'}`}
            >
              Screen {showing.screenNumber}
            </span>
            <span
              className={`block text-sm ${selectedShowing?.id === showing.id ? 'text-white/80' : 'text-gray-500'}`}
            >
              {showing.availableSeats}/{showing.totalSeats} available
            </span>
          </div>
        ))}
      </div>
      <div className="flex justify-center mt-6">
        <button
          className="px-6 py-3 bg-[#333] text-white rounded-lg hover:bg-[#444] transition-colors"
          onClick={() => navigate('/date')}
        >
          Back
        </button>
      </div>
    </Layout>
  );
}
