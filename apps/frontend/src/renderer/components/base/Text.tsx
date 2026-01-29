interface TextProps {
  text?: string;
  variant?: 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'body' | 'caption';
  className?: string;
  children?: React.ReactNode;
}

const variantClasses = {
  h1: 'text-4xl font-bold',
  h2: 'text-3xl font-bold',
  h3: 'text-2xl font-semibold',
  h4: 'text-xl font-semibold',
  h5: 'text-lg font-medium',
  body: 'text-base',
  caption: 'text-sm text-gray-400',
};

export function Text({
  text,
  variant = 'body',
  className = '',
  children,
}: TextProps) {
  const content = text ?? children;

  return (
    <span className={`${variantClasses[variant]} ${className}`}>{content}</span>
  );
}
