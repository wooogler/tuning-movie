/**
 * DateStage Component
 *
 * 날짜 선택 Stage - Full Calendar with month navigation
 */

import { useState, useMemo } from 'react';
import type { DateItem } from '../../spec';
import { ActionBar } from './ActionBar';
import type { StageProps } from './types';

interface CalendarDay {
  date: string; // YYYY-MM-DD
  dayNum: number;
  isCurrentMonth: boolean;
  isToday: boolean;
  isAvailable: boolean;
  isSelected: boolean;
  isHighlighted: boolean;
}

function generateCalendarDays(
  year: number,
  month: number,
  items: DateItem[],
  selectedId?: string,
  highlightedIds?: string[]
): CalendarDay[] {
  const days: CalendarDay[] = [];
  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];

  // First day of the month
  const firstDay = new Date(year, month, 1);
  const startDayOfWeek = firstDay.getDay();

  // Last day of the month
  const lastDay = new Date(year, month + 1, 0);
  const totalDays = lastDay.getDate();

  // Create maps for quick lookup
  const itemMap = new Map<string, DateItem>();
  items.forEach((item) => itemMap.set(item.id, item));

  const highlightSet = new Set(highlightedIds ?? []);

  // Add empty slots for days before the first day of month
  for (let i = 0; i < startDayOfWeek; i++) {
    const prevMonthDay = new Date(year, month, -startDayOfWeek + i + 1);
    const dateStr = prevMonthDay.toISOString().split('T')[0];
    days.push({
      date: dateStr,
      dayNum: prevMonthDay.getDate(),
      isCurrentMonth: false,
      isToday: dateStr === todayStr,
      isAvailable: false,
      isSelected: false,
      isHighlighted: false,
    });
  }

  // Add days of the current month
  for (let day = 1; day <= totalDays; day++) {
    const date = new Date(year, month, day);
    const dateStr = date.toISOString().split('T')[0];
    const item = itemMap.get(dateStr);
    const isHighlighted = highlightSet.has(dateStr);

    days.push({
      date: dateStr,
      dayNum: day,
      isCurrentMonth: true,
      isToday: dateStr === todayStr,
      isAvailable: item?.available ?? false,
      isSelected: dateStr === selectedId,
      isHighlighted,
    });
  }

  // Add empty slots to complete the last week
  const remainingDays = 7 - (days.length % 7);
  if (remainingDays < 7) {
    for (let i = 1; i <= remainingDays; i++) {
      const nextMonthDay = new Date(year, month + 1, i);
      const dateStr = nextMonthDay.toISOString().split('T')[0];
      days.push({
        date: dateStr,
        dayNum: i,
        isCurrentMonth: false,
        isToday: dateStr === todayStr,
        isAvailable: false,
        isSelected: false,
        isHighlighted: false,
      });
    }
  }

  return days;
}

export function DateStage({
  spec,
  onSelect,
  onNext,
  onBack,
}: StageProps<DateItem>) {
  const canProceed = !!spec.state.selected;

  // Current viewed month (initialized to today)
  const today = new Date();
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());

  // Generate calendar days for current view
  const calendarDays = useMemo(
    () => generateCalendarDays(
      viewYear,
      viewMonth,
      spec.items,
      spec.state.selected?.id,
      spec.modification.highlight?.itemIds
    ),
    [viewYear, viewMonth, spec.items, spec.state.selected?.id, spec.modification.highlight]
  );

  // Month navigation
  const goToPrevMonth = () => {
    if (viewMonth === 0) {
      setViewYear(viewYear - 1);
      setViewMonth(11);
    } else {
      setViewMonth(viewMonth - 1);
    }
  };

  const goToNextMonth = () => {
    if (viewMonth === 11) {
      setViewYear(viewYear + 1);
      setViewMonth(0);
    } else {
      setViewMonth(viewMonth + 1);
    }
  };

  // Format month display
  const monthYearDisplay = new Date(viewYear, viewMonth).toLocaleString('en-US', {
    month: 'long',
    year: 'numeric',
  });

  // 선택된 날짜 정보
  const selectedDate = spec.items.find(
    (item) => item.id === spec.state.selected?.id
  );

  return (
    <div className="flex flex-col items-center gap-6">
      {/* Month navigation header */}
      <div className="flex items-center justify-between w-full max-w-md">
        <button
          onClick={goToPrevMonth}
          className="p-2 rounded-lg bg-dark-light hover:bg-dark-lighter text-white transition-colors"
          aria-label="Previous month"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>

        <div className="text-xl font-semibold text-white">{monthYearDisplay}</div>

        <button
          onClick={goToNextMonth}
          className="p-2 rounded-lg bg-dark-light hover:bg-dark-lighter text-white transition-colors"
          aria-label="Next month"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>

      {/* Calendar grid */}
      <div className="grid grid-cols-7 gap-1 w-full max-w-md">
        {/* 요일 헤더 */}
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
          <div
            key={day}
            className="text-center text-sm text-gray-500 py-2 font-medium"
          >
            {day}
          </div>
        ))}

        {/* Calendar days */}
        {calendarDays.map((day, index) => {
          const highlightClass = day.isHighlighted ? 'ring-2 ring-primary' : '';

          return (
            <button
              key={`${day.date}-${index}`}
              onClick={() => day.isAvailable && day.isCurrentMonth && onSelect(day.date)}
              disabled={!day.isAvailable || !day.isCurrentMonth}
              className={`
                relative aspect-square flex items-center justify-center rounded-lg transition-all text-sm
                ${!day.isCurrentMonth
                  ? 'text-gray-700'
                  : day.isSelected
                  ? 'bg-primary text-dark font-semibold'
                  : day.isAvailable
                  ? 'bg-dark-light text-white hover:bg-dark-lighter'
                  : 'bg-dark-border/50 text-gray-600 cursor-not-allowed'
                }
                ${day.isToday && !day.isSelected ? 'ring-1 ring-primary/50' : ''}
                ${highlightClass}
              `}
            >
              {day.dayNum}

              {/* Today indicator */}
              {day.isToday && !day.isSelected && day.isCurrentMonth && (
                <span className="absolute bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 bg-primary rounded-full" />
              )}
            </button>
          );
        })}
      </div>

      {/* 선택된 날짜 표시 */}
      {selectedDate && (
        <div className="text-gray-400">
          Selected: {selectedDate.displayText}
        </div>
      )}

      <ActionBar
        onBack={onBack}
        onNext={onNext}
        nextDisabled={!canProceed}
      />
    </div>
  );
}
