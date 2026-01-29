import type { ReactNode } from 'react';

interface GridProps {
  children?: ReactNode;
  columns?: { sm?: number; md?: number; lg?: number } | number;
  gap?: number;
  className?: string;
}

export function Grid({
  children,
  columns = { sm: 1, md: 2, lg: 3 },
  gap = 4,
  className = '',
}: GridProps) {
  const cols = typeof columns === 'number' ? { sm: columns, md: columns, lg: columns } : columns;

  const gridCols = `grid-cols-${cols.sm || 1} md:grid-cols-${cols.md || 2} lg:grid-cols-${cols.lg || 3}`;

  return (
    <div
      className={`grid ${gridCols} ${className}`}
      style={{ gap: `${gap * 0.25}rem` }}
    >
      {children}
    </div>
  );
}
