import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Layout } from '../components/Layout';
import { api } from '../api/client';
import { useBookingStore } from '../store/bookingStore';
import { convertDateStage } from '../converter/dateStage';
import { SpecRenderer } from '../renderer';
import type { UISpec } from '../converter/types';

export function DateStagePage() {
  const navigate = useNavigate();
  const { movie, theater, setDate } = useBookingStore();
  const [spec, setSpec] = useState<UISpec | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!movie || !theater) {
      navigate('/');
      return;
    }

    api
      .getDates(movie.id, theater.id)
      .then((data) => setSpec(convertDateStage(data.dates)))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [movie, theater, navigate]);

  const handleAction = (actionName: string, data?: unknown) => {
    if (actionName === 'selectDate') {
      setDate(data as string);
      navigate('/time');
    }
    if (actionName === 'back') {
      navigate('/theater');
    }
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
        <p className="text-center text-primary">Error: {error}</p>
      </Layout>
    );
  }

  if (!spec) return null;

  return (
    <Layout title="Select Date" step={3}>
      <SpecRenderer spec={spec} onAction={handleAction} />
    </Layout>
  );
}
