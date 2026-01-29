import type { TicketType } from '../../../types';

interface TicketCounterProps {
  data?: TicketType;
  quantity?: number;
  onAction?: (actionName: string, data?: unknown) => void;
}

export function TicketCounter({
  data,
  quantity = 0,
  onAction,
}: TicketCounterProps) {
  if (!data) return null;

  const handleIncrement = () => {
    onAction?.('incrementTicket', { ticketType: data, delta: 1 });
  };

  const handleDecrement = () => {
    if (quantity > 0) {
      onAction?.('decrementTicket', { ticketType: data, delta: -1 });
    }
  };

  return (
    <div className="flex items-center justify-between p-4 bg-dark-light rounded-xl">
      <div className="flex-1">
        <h3 className="font-semibold">{data.name}</h3>
        <p className="text-sm text-gray-400">{data.description}</p>
        <p className="text-primary font-bold mt-1">
          ${data.price.toLocaleString()}
        </p>
      </div>
      <div className="flex items-center gap-3">
        <button
          className="w-8 h-8 rounded-full bg-dark-border hover:bg-dark-lighter transition-colors flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed"
          onClick={handleDecrement}
          disabled={quantity === 0}
        >
          -
        </button>
        <span className="w-8 text-center font-bold">{quantity}</span>
        <button
          className="w-8 h-8 rounded-full bg-primary hover:bg-primary-hover transition-colors flex items-center justify-center"
          onClick={handleIncrement}
        >
          +
        </button>
      </div>
    </div>
  );
}
