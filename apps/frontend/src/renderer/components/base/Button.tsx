interface ButtonProps {
  label?: string;
  variant?: 'primary' | 'secondary';
  disabled?: boolean;
  action?: { type: string; event: string };
  onAction?: (actionName: string, data?: unknown) => void;
  className?: string;
  children?: React.ReactNode;
}

const variantClasses = {
  primary: 'bg-primary hover:bg-primary-hover text-white',
  secondary: 'bg-dark-border hover:bg-dark-lighter text-white',
};

export function Button({
  label,
  variant = 'primary',
  disabled = false,
  action,
  onAction,
  className = '',
  children,
}: ButtonProps) {
  const handleClick = () => {
    if (action && onAction) {
      onAction(action.event);
    }
  };

  return (
    <button
      className={`px-6 py-3 rounded-lg transition-colors ${variantClasses[variant]} ${disabled ? 'opacity-50 cursor-not-allowed' : ''} ${className}`}
      onClick={handleClick}
      disabled={disabled}
    >
      {label ?? children}
    </button>
  );
}
