import type { Movie, Theater, Showing, Seat, TicketType } from '../../../types';

interface TicketSelection {
  ticketType: TicketType;
  quantity: number;
}

interface BookingSummaryProps {
  data?: {
    movie: Movie;
    theater: Theater;
    date: string;
    showing: Showing;
    selectedSeats: Seat[];
    tickets: TicketSelection[];
    totalPrice: number;
  };
}

export function BookingSummary({ data }: BookingSummaryProps) {
  if (!data) return null;

  const { movie, theater, date, showing, selectedSeats, tickets, totalPrice } =
    data;

  return (
    <div className="bg-dark-light p-6 rounded-xl space-y-4">
      <h3 className="text-lg font-semibold text-primary">Booking Summary</h3>

      <div className="space-y-2 text-sm">
        <div className="flex justify-between">
          <span className="text-gray-400">Movie</span>
          <span>{movie.title}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-400">Theater</span>
          <span>{theater.name}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-400">Date</span>
          <span>{date}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-400">Time</span>
          <span>{showing.time}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-400">Screen</span>
          <span>{showing.screenNumber}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-400">Seats</span>
          <span>
            {selectedSeats.map((s) => `${s.row}${s.number}`).join(', ')}
          </span>
        </div>
      </div>

      <div className="border-t border-dark-border pt-4 space-y-2 text-sm">
        {tickets.map((t) => (
          <div key={t.ticketType.id} className="flex justify-between">
            <span className="text-gray-400">
              {t.ticketType.name} x {t.quantity}
            </span>
            <span>${(t.ticketType.price * t.quantity).toLocaleString()}</span>
          </div>
        ))}
      </div>

      <div className="border-t border-dark-border pt-4 flex justify-between font-bold">
        <span>Total</span>
        <span className="text-primary">${totalPrice.toLocaleString()}</span>
      </div>
    </div>
  );
}
