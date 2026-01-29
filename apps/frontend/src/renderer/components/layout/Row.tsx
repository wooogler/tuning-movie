import type { ReactNode } from 'react';

interface RowProps {
  children?: ReactNode;
  align?: 'start' | 'center' | 'end' | 'stretch';
  justify?: 'start' | 'center' | 'end' | 'between' | 'around';
  gap?: number;
  wrap?: boolean;
  className?: string;
}

const alignMap = {
  start: 'items-start',
  center: 'items-center',
  end: 'items-end',
  stretch: 'items-stretch',
};

const justifyMap = {
  start: 'justify-start',
  center: 'justify-center',
  end: 'justify-end',
  between: 'justify-between',
  around: 'justify-around',
};

export function Row({
  children,
  align = 'center',
  justify = 'start',
  gap = 4,
  wrap = false,
  className = '',
}: RowProps) {
  return (
    <div
      className={`flex flex-row ${alignMap[align]} ${justifyMap[justify]} ${wrap ? 'flex-wrap' : ''} ${className}`}
      style={{ gap: `${gap * 0.25}rem` }}
    >
      {children}
    </div>
  );
}
