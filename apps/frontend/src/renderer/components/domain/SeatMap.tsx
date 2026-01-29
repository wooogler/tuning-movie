import type { Seat } from '../../../types';

interface SeatMapProps {
  data?: Seat[];
  selectedSeats?: string[];
  onAction?: (actionName: string, data?: unknown) => void;
}

export function SeatMap({ data, selectedSeats = [], onAction }: SeatMapProps) {
  if (!data || data.length === 0) return null;

  // Group seats by row
  const rows = data.reduce(
    (acc, seat) => {
      if (!acc[seat.row]) acc[seat.row] = [];
      acc[seat.row].push(seat);
      return acc;
    },
    {} as Record<string, Seat[]>,
  );

  const sortedRows = Object.keys(rows).sort();

  const getSeatClass = (seat: Seat) => {
    const isSelected = selectedSeats.includes(seat.id);
    const baseClass =
      'w-8 h-8 rounded-t-lg text-xs font-medium transition-colors flex items-center justify-center';

    if (seat.status === 'occupied') {
      return `${baseClass} bg-dark-border text-gray-600 cursor-not-allowed`;
    }

    if (isSelected) {
      return `${baseClass} bg-primary text-white`;
    }

    if (seat.type === 'premium') {
      return `${baseClass} bg-amber-600 hover:bg-amber-500 cursor-pointer`;
    }

    if (seat.type === 'couple') {
      return `${baseClass} w-16 bg-purple-600 hover:bg-purple-500 cursor-pointer`;
    }

    return `${baseClass} bg-dark-lighter hover:bg-gray-600 cursor-pointer`;
  };

  const handleSeatClick = (seat: Seat) => {
    if (seat.status === 'occupied') return;
    onAction?.('toggleSeat', seat);
  };

  return (
    <div className="flex flex-col items-center gap-2">
      {sortedRows.map((row) => (
        <div key={row} className="flex items-center gap-2">
          <span className="w-6 text-center text-gray-400 text-sm">{row}</span>
          <div className="flex gap-1">
            {rows[row]
              .sort((a, b) => a.number - b.number)
              .map((seat) => (
                <button
                  key={seat.id}
                  className={getSeatClass(seat)}
                  onClick={() => handleSeatClick(seat)}
                  disabled={seat.status === 'occupied'}
                >
                  {seat.number}
                </button>
              ))}
          </div>
        </div>
      ))}
    </div>
  );
}
