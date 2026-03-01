/**
 * ActionBar Component for Stage System
 *
 * Back/Continue 버튼
 */

interface ActionBarProps {
  onBack?: () => void;
  onNext?: () => void;
  onStartOver?: () => void;
  backLabel?: string;
  nextLabel?: string;
  backDisabled?: boolean;
  nextDisabled?: boolean;
  showBack?: boolean;
}

export function ActionBar({
  onBack,
  onNext,
  onStartOver,
  backLabel = 'Back',
  nextLabel = 'Continue',
  backDisabled = false,
  nextDisabled = false,
  showBack = true,
}: ActionBarProps) {
  return (
    <div className="mt-6 flex flex-col items-center gap-3">
      <div className="flex justify-center gap-4">
        {showBack && onBack && (
          <button
            type="button"
            className={`px-6 py-3 rounded-lg transition-colors ${
              backDisabled
                ? 'bg-dark-border/50 text-fg-faint cursor-not-allowed'
                : 'bg-dark-border text-fg-strong hover:bg-dark-lighter'
            }`}
            onClick={onBack}
            disabled={backDisabled}
          >
            {backLabel}
          </button>
        )}

        {onNext && (
          <button
            type="button"
            className={`px-6 py-3 rounded-lg transition-colors ${
              nextDisabled
                ? 'bg-primary/50 text-primary-fg/50 cursor-not-allowed'
                : 'bg-primary hover:bg-primary-hover text-primary-fg'
            }`}
            onClick={onNext}
            disabled={nextDisabled}
          >
            {nextLabel}
          </button>
        )}
      </div>
      {onStartOver && (
        <button
          type="button"
          onClick={onStartOver}
          className="bg-transparent p-0 text-sm text-fg-muted underline underline-offset-4 transition-colors hover:text-fg-strong"
        >
          Start over
        </button>
      )}
    </div>
  );
}
