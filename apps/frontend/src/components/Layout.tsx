import type { ReactNode } from 'react';
import { useBookingStore } from '../store/bookingStore';

interface LayoutProps {
  children: ReactNode;
  title: string;
  step: number;
}

const steps = ['Movie', 'Theater', 'Date', 'Time', 'Seats', 'Tickets', 'Confirm'];

export function Layout({ children, title, step }: LayoutProps) {
  const { movie, theater, date, showing, selectedSeats } = useBookingStore();

  return (
    <div className="min-h-screen bg-dark text-white">
      <div className="max-w-6xl mx-auto px-4 py-6">
        <header className="text-center mb-10">
          <h1 className="text-3xl font-bold text-primary mb-6">Movie Booking</h1>
          <div className="flex justify-center gap-2 flex-wrap">
            {steps.map((s, i) => (
              <div
                key={i}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-full text-sm transition-all
                  ${i + 1 <= step ? 'opacity-100' : 'opacity-50'}
                  ${i + 1 === step ? 'bg-primary' : 'bg-dark-light'}
                `}
              >
                <span
                  className={`w-5 h-5 rounded-full flex items-center justify-center text-xs
                    ${i + 1 === step ? 'bg-white text-primary' : 'bg-dark-border'}
                  `}
                >
                  {i + 1}
                </span>
                <span className="hidden sm:inline">{s}</span>
              </div>
            ))}
          </div>
        </header>

        <main className="mb-8">
          <h2 className="text-2xl font-semibold text-center mb-6">{title}</h2>
          {children}
        </main>

        {(movie || theater || date || showing || selectedSeats.length > 0) && (
          <aside className="fixed right-5 top-1/2 -translate-y-1/2 bg-dark-light p-5 rounded-xl w-60 shadow-xl hidden lg:block">
            <h3 className="text-primary font-semibold mb-4">Booking Summary</h3>
            {movie && (
              <p className="text-sm text-gray-300 mb-2">
                <strong className="text-white">Movie:</strong> {movie.title}
              </p>
            )}
            {theater && (
              <p className="text-sm text-gray-300 mb-2">
                <strong className="text-white">Theater:</strong> {theater.name}
              </p>
            )}
            {date && (
              <p className="text-sm text-gray-300 mb-2">
                <strong className="text-white">Date:</strong> {date}
              </p>
            )}
            {showing && (
              <p className="text-sm text-gray-300 mb-2">
                <strong className="text-white">Time:</strong> {showing.time}
              </p>
            )}
            {selectedSeats.length > 0 && (
              <p className="text-sm text-gray-300">
                <strong className="text-white">Seats:</strong>{' '}
                {selectedSeats.map((s) => `${s.row}${s.number}`).join(', ')}
              </p>
            )}
          </aside>
        )}
      </div>
    </div>
  );
}
