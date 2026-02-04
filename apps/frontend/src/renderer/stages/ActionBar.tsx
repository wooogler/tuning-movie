/**
 * ActionBar Component for Stage System
 *
 * Back/Continue 버튼
 */

interface ActionBarProps {
  onBack?: () => void;
  onNext?: () => void;
  backLabel?: string;
  nextLabel?: string;
  backDisabled?: boolean;
  nextDisabled?: boolean;
  showBack?: boolean;
}

export function ActionBar({
  onBack,
  onNext,
  backLabel = 'Back',
  nextLabel = 'Continue',
  backDisabled = false,
  nextDisabled = false,
  showBack = true,
}: ActionBarProps) {
  return (
    <div className="flex justify-center gap-4 mt-6">
      {showBack && onBack && (
        <button
          className={`px-6 py-3 rounded-lg transition-colors ${
            backDisabled
              ? 'bg-dark-border/50 text-gray-500 cursor-not-allowed'
              : 'bg-dark-border text-white hover:bg-dark-lighter'
          }`}
          onClick={onBack}
          disabled={backDisabled}
        >
          {backLabel}
        </button>
      )}

      {onNext && (
        <button
          className={`px-6 py-3 rounded-lg transition-colors ${
            nextDisabled
              ? 'bg-primary/50 text-white/50 cursor-not-allowed'
              : 'bg-primary hover:bg-primary-hover text-white'
          }`}
          onClick={onNext}
          disabled={nextDisabled}
        >
          {nextLabel}
        </button>
      )}
    </div>
  );
}
