import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Layout } from '../components/Layout';
import { api } from '../api/client';
import { useBookingStore } from '../store/bookingStore';

export function DateStagePage() {
  const navigate = useNavigate();
  const { movie, theater, setDate, date: selectedDate } = useBookingStore();
  const [dates, setDates] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!movie || !theater) {
      navigate('/');
      return;
    }

    api
      .getDates(movie.id, theater.id)
      .then((data) => setDates(data.dates))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [movie, theater, navigate]);

  const handleSelect = (date: string) => {
    setDate(date);
    navigate('/time');
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    });
  };

  if (loading) {
    return (
      <Layout title="Select Date" step={3}>
        <p className="text-center text-gray-400">Loading...</p>
      </Layout>
    );
  }

  if (error) {
    return (
      <Layout title="Select Date" step={3}>
        <p className="text-center text-[#e50914]">Error: {error}</p>
      </Layout>
    );
  }

  return (
    <Layout title="Select Date" step={3}>
      <div className="flex flex-wrap justify-center gap-3">
        {dates.map((date) => (
          <div
            key={date}
            className={`px-6 py-4 rounded-lg cursor-pointer transition-all
              ${selectedDate === date ? 'bg-[#e50914]' : 'bg-[#1a1a1a] hover:bg-[#2a2a2a]'}
            `}
            onClick={() => handleSelect(date)}
          >
            <span className="text-sm font-medium">{formatDate(date)}</span>
          </div>
        ))}
      </div>
      <div className="flex justify-center mt-6">
        <button
          className="px-6 py-3 bg-[#333] text-white rounded-lg hover:bg-[#444] transition-colors"
          onClick={() => navigate('/theater')}
        >
          Back
        </button>
      </div>
    </Layout>
  );
}
