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

  // Map to complete Tailwind class names (required for JIT mode)
  const colsMap: Record<number, string> = {
    1: 'grid-cols-1',
    2: 'grid-cols-2',
    3: 'grid-cols-3',
    4: 'grid-cols-4',
    5: 'grid-cols-5',
    6: 'grid-cols-6',
  };

  const mdColsMap: Record<number, string> = {
    1: 'md:grid-cols-1',
    2: 'md:grid-cols-2',
    3: 'md:grid-cols-3',
    4: 'md:grid-cols-4',
    5: 'md:grid-cols-5',
    6: 'md:grid-cols-6',
  };

  const lgColsMap: Record<number, string> = {
    1: 'lg:grid-cols-1',
    2: 'lg:grid-cols-2',
    3: 'lg:grid-cols-3',
    4: 'lg:grid-cols-4',
    5: 'lg:grid-cols-5',
    6: 'lg:grid-cols-6',
  };

  const gridCols = [
    colsMap[cols.sm || 1],
    mdColsMap[cols.md || 2],
    lgColsMap[cols.lg || 3],
  ].join(' ');

  return (
    <div
      className={`grid ${gridCols} ${className}`}
      style={{ gap: `${gap * 0.25}rem` }}
    >
      {children}
    </div>
  );
}
