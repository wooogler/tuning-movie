import type { ReactNode } from 'react';

interface LayoutProps {
  children: ReactNode;
  title: string;
  description?: string;
  step: number;
}

const steps = ['Movie', 'Theater', 'Date', 'Time', 'Seats', 'Tickets', 'Confirm'];

export function Layout({ children, title, description, step }: LayoutProps) {
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
          <div className="text-center mb-6">
            <h2 className="text-2xl font-semibold mb-2">{title}</h2>
            {description && (
              <p className="text-gray-400 text-sm">{description}</p>
            )}
          </div>
          {children}
        </main>
      </div>
    </div>
  );
}
