interface ActionBarProps {
  back?: { to: string; label?: string };
  next?: { to: string; label?: string; requires?: string; disabled?: boolean };
  onAction?: (actionName: string, data?: unknown) => void;
  data?: unknown;
}

export function ActionBar({ back, next, onAction }: ActionBarProps) {
  return (
    <div className="flex justify-center gap-4">
      {back && (
        <button
          className="px-6 py-3 bg-dark-border text-white rounded-lg hover:bg-dark-lighter transition-colors"
          onClick={() => onAction?.('back', { to: back.to })}
        >
          {back.label ?? 'Back'}
        </button>
      )}
      {next && (
        <button
          className={`px-6 py-3 rounded-lg transition-colors ${
            next.disabled
              ? 'bg-primary/50 cursor-not-allowed'
              : 'bg-primary hover:bg-primary-hover text-white'
          }`}
          onClick={() => !next.disabled && onAction?.('next', { to: next.to })}
          disabled={next.disabled}
        >
          {next.label ?? 'Continue'}
        </button>
      )}
    </div>
  );
}
