import type { ReactNode } from 'react';

interface ColumnProps {
  children?: ReactNode;
  align?: 'start' | 'center' | 'end' | 'stretch';
  justify?: 'start' | 'center' | 'end' | 'between' | 'around';
  gap?: number;
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

export function Column({
  children,
  align = 'stretch',
  justify = 'start',
  gap = 4,
  className = '',
}: ColumnProps) {
  return (
    <div
      className={`flex flex-col ${alignMap[align]} ${justifyMap[justify]} ${className}`}
      style={{ gap: `${gap * 0.25}rem` }}
    >
      {children}
    </div>
  );
}
