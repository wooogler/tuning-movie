import type { Theater } from '../../../types';

interface TheaterCardProps {
  data?: Theater;
  onAction?: (actionName: string, data?: unknown) => void;
  action?: { type: string; event: string };
}

export function TheaterCard({ data, onAction, action }: TheaterCardProps) {
  if (!data) return null;

  const handleClick = () => {
    if (action && onAction) {
      onAction(action.event, data);
    }
  };

  return (
    <div
      className="bg-dark-light rounded-xl p-4 cursor-pointer hover:ring-2 hover:ring-primary transition-all"
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
