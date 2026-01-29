import type { Showing } from '../../../types';

interface TimePickerProps {
  data?: Showing;
  onAction?: (actionName: string, data?: unknown) => void;
  action?: { type: string; event: string };
}

export function TimePicker({ data, onAction, action }: TimePickerProps) {
  if (!data) return null;

  const handleClick = () => {
    if (action && onAction) {
      onAction(action.event, data);
    }
  };

  return (
    <button
      className="flex flex-col items-center justify-center p-4 bg-dark-light rounded-xl hover:bg-primary transition-colors min-w-32"
      onClick={handleClick}
    >
      <span className="text-xl font-bold">{data.time}</span>
      <span className="text-sm text-gray-400">Screen {data.screenNumber}</span>
      <span className="text-xs text-gray-500 mt-1">
        {data.availableSeats}/{data.totalSeats} seats
      </span>
    </button>
  );
}
