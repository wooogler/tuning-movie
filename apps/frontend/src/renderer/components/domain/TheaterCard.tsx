import type { Theater } from '../../../types';

interface TheaterCardProps {
  data?: Theater;
  onAction?: (actionName: string, data?: unknown) => void;
  action?: { type: string; event: string };
  selectedId?: string;
}

export function TheaterCard({ data, onAction, action, selectedId }: TheaterCardProps) {
  if (!data) return null;

  const isSelected = selectedId === data.id;

  const handleClick = () => {
    if (action && onAction) {
      onAction(action.event, data.id);
    }
  };

  return (
    <div
      className={`bg-dark-light rounded-xl p-4 cursor-pointer transition-all ${
        isSelected
          ? 'ring-2 ring-primary scale-105'
          : 'hover:ring-2 hover:ring-primary hover:scale-105'
      }`}
      onClick={handleClick}
    >
      <h3 className="font-semibold text-lg">{data.name}</h3>
      <p className="text-sm text-gray-400 mt-1">{data.location}</p>
      <p className="text-xs text-gray-500 mt-2">
        {data.screenCount} screen{data.screenCount > 1 ? 's' : ''}
      </p>
    </div>
  );
}
