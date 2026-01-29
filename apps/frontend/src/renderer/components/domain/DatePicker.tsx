interface DatePickerProps {
  data?: string;
  onAction?: (actionName: string, data?: unknown) => void;
  action?: { type: string; event: string };
}

function formatDate(dateStr: string): { day: string; weekday: string } {
  const date = new Date(dateStr);
  const day = date.getDate().toString();
  const weekday = date.toLocaleDateString('en-US', { weekday: 'short' });
  return { day, weekday };
}

export function DatePicker({ data, onAction, action }: DatePickerProps) {
  if (!data) return null;

  const { day, weekday } = formatDate(data);

  const handleClick = () => {
    if (action && onAction) {
      onAction(action.event, data);
    }
  };

  return (
    <button
      className="flex flex-col items-center justify-center w-20 h-20 bg-dark-light rounded-xl hover:bg-primary transition-colors"
      onClick={handleClick}
    >
      <span className="text-2xl font-bold">{day}</span>
      <span className="text-sm text-gray-400">{weekday}</span>
    </button>
  );
}
