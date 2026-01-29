import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Layout } from '../components/Layout';
import { api } from '../api/client';
import { useBookingStore } from '../store/bookingStore';
import { convertTimeStage } from '../converter/timeStage';
import { SpecRenderer } from '../renderer';
import type { UISpec } from '../converter/types';
import type { Showing } from '../types';

export function TimeStagePage() {
  const navigate = useNavigate();
  const { movie, theater, date, setShowing } = useBookingStore();
  const [spec, setSpec] = useState<UISpec | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!movie || !theater || !date) {
      navigate('/');
      return;
    }

    api
      .getTimes(movie.id, theater.id, date)
      .then((data) => setSpec(convertTimeStage(data.showings)))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [movie, theater, date, navigate]);

  const handleAction = (actionName: string, data?: unknown) => {
    if (actionName === 'selectTime') {
      setShowing(data as Showing);
      navigate('/seats');
    }
    if (actionName === 'back') {
      navigate('/date');
    }
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
        <p className="text-center text-primary">Error: {error}</p>
      </Layout>
    );
  }

  if (!spec) return null;

  return (
    <Layout title="Select Time" step={4}>
      <SpecRenderer spec={spec} onAction={handleAction} />
    </Layout>
  );
}
