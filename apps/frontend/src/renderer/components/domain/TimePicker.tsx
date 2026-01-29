import type { Showing } from '../../../types';

interface TimePickerProps {
  data?: Showing;
  onAction?: (actionName: string, data?: unknown) => void;
  action?: { type: string; event: string };
  selectedId?: string;
}

export function TimePicker({ data, onAction, action, selectedId }: TimePickerProps) {
  if (!data) return null;

  const isSelected = selectedId === data.id;

  const handleClick = () => {
    if (action && onAction) {
      onAction(action.event, data.id);
    }
  };

  return (
    <button
      className={`flex flex-col items-center justify-center p-4 rounded-xl transition-all min-w-32 ${
        isSelected
          ? 'bg-primary scale-110'
          : 'bg-dark-light hover:bg-primary hover:scale-110'
      }`}
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
