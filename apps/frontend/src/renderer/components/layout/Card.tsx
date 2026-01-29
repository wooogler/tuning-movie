import type { ReactNode } from 'react';

interface CardProps {
  onClick?: () => void;
  className?: string;
  children?: ReactNode;
}

export function Card({ onClick, className = '', children }: CardProps) {
  return (
    <div
      className={`bg-dark-light rounded-xl overflow-hidden ${onClick ? 'cursor-pointer hover:bg-dark-lighter transition-all' : ''} ${className}`}
      onClick={onClick}
    >
      {children}
    </div>
  );
}
