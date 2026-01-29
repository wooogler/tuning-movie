import type { Movie } from '../../../types';

interface MovieCardProps {
  data?: Movie;
  onAction?: (actionName: string, data?: unknown) => void;
  action?: { type: string; event: string };
}

export function MovieCard({ data, onAction, action }: MovieCardProps) {
  if (!data) return null;

  const handleClick = () => {
    if (action && onAction) {
      onAction(action.event, data);
    }
  };

  return (
    <div
      className="bg-dark-light rounded-xl overflow-hidden cursor-pointer hover:ring-2 hover:ring-primary transition-all"
      onClick={handleClick}
    >
      <div className="aspect-[2/3] relative">
        {data.posterUrl ? (
          <img
            src={data.posterUrl}
            alt={data.title}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full bg-dark-lighter flex items-center justify-center">
            <span className="text-gray-500 text-sm">No Image</span>
          </div>
        )}
      </div>
      <div className="p-3">
        <h3 className="font-semibold text-sm truncate">{data.title}</h3>
        <p className="text-xs text-gray-400 mt-1 truncate">
          {data.genre.join(', ')}
        </p>
        <div className="flex justify-between items-center mt-2 text-xs text-gray-500">
          <span>{data.duration} min</span>
          <span className="text-primary">{data.rating}</span>
        </div>
      </div>
    </div>
  );
}
