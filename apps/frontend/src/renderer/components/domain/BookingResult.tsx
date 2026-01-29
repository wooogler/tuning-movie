import type { Booking } from '../../../types';

interface BookingResultProps {
  data?: Booking;
  onAction?: (actionName: string, data?: unknown) => void;
}

export function BookingResult({ data, onAction }: BookingResultProps) {
  if (!data) return null;

  return (
    <div className="text-center space-y-6">
      <div className="w-20 h-20 mx-auto bg-green-500 rounded-full flex items-center justify-center">
        <svg
          className="w-10 h-10 text-white"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M5 13l4 4L19 7"
          />
        </svg>
      </div>
      <div>
        <h3 className="text-2xl font-bold text-green-500">Booking Confirmed!</h3>
        <p className="text-gray-400 mt-2">
          Confirmation ID: <span className="text-white font-mono">{data.id}</span>
        </p>
      </div>
      <div className="bg-dark-light p-4 rounded-xl text-left space-y-2">
        <p>
          <span className="text-gray-400">Name:</span>{' '}
          <span className="text-white">{data.customerName}</span>
        </p>
        <p>
          <span className="text-gray-400">Email:</span>{' '}
          <span className="text-white">{data.customerEmail}</span>
        </p>
        <p>
          <span className="text-gray-400">Total:</span>{' '}
          <span className="text-primary font-bold">
            ${data.totalPrice.toLocaleString()}
          </span>
        </p>
      </div>
      <button
        className="px-6 py-3 bg-primary hover:bg-primary-hover text-white rounded-lg transition-colors"
        onClick={() => onAction?.('bookAnother')}
      >
        Book Another Movie
      </button>
    </div>
  );
}
