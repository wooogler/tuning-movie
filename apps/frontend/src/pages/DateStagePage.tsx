import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Layout } from '../components/Layout';
import { api } from '../api/client';
import { useBookingStore } from '../store/bookingStore';
import { useDevTools } from '../components/DevToolsContext';
import { generateDateSpec, createDateItems, selectItem, type UISpec, type DateItem } from '../spec';
import { StageRenderer } from '../renderer';

export function DateStagePage() {
  const navigate = useNavigate();
  const { movie, theater, setDate } = useBookingStore();
  const { setBackendData, setUiSpec } = useDevTools();
  const [spec, setSpec] = useState<UISpec<DateItem> | null>(null);
  const [availableDates, setAvailableDates] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!movie || !theater) {
      navigate('/');
      return;
    }

    api
      .getDates(movie.id, theater.id)
      .then((data) => {
        setAvailableDates(data.dates);
        setBackendData({ dates: data.dates });
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [movie, theater, navigate, setBackendData]);

  // Rebuild spec when dates change
  useEffect(() => {
    if (availableDates.length > 0 && movie && theater) {
      // Create date items for the next 14 days
      const dateItems = createDateItems(new Date(), 14, availableDates);
      const newSpec = generateDateSpec(dateItems, movie.id, theater.id);
      setSpec(newSpec);
      setUiSpec(newSpec);
    }
  }, [availableDates, movie, theater, setUiSpec]);

  const handleSelect = (id: string) => {
    if (spec) {
      const newSpec = selectItem(spec, id);
      setSpec(newSpec);
      setUiSpec(newSpec);
    }
  };

  const handleBack = () => {
    navigate('/theater');
  };

  const handleNext = () => {
    if (spec?.state.selectedId) {
      setDate(spec.state.selectedId);
      navigate('/time');
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
      <StageRenderer
        spec={spec}
        onSelect={handleSelect}
        onNext={handleNext}
        onBack={handleBack}
      />
    </Layout>
  );
}
