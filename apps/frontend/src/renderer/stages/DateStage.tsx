/**
 * DateStage Component
 *
 * 날짜 선택 Stage - Calendar 사용
 */

import { getVisibleItems, type DateItem } from '../../spec';
import { ActionBar } from './ActionBar';
import type { StageProps } from './types';

export function DateStage({
  spec,
  onSelect,
  onNext,
  onBack,
}: StageProps<DateItem>) {
  const visibleItems = getVisibleItems(spec);
  const canProceed = !!spec.state.selectedId;

  // 현재 선택된 날짜 정보
  const selectedDate = visibleItems.find(
    (item) => item.id === spec.state.selectedId
  );

  // 날짜를 주별로 그룹화
  const today = new Date();
  const currentMonth = today.toLocaleString('en-US', { month: 'long', year: 'numeric' });

  return (
    <div className="flex flex-col items-center gap-6">
      {/* 월 표시 */}
      <div className="text-xl font-semibold text-white">{currentMonth}</div>

      {/* 날짜 그리드 */}
      <div className="grid grid-cols-7 gap-2 w-full max-w-md">
        {/* 요일 헤더 */}
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
          <div
            key={day}
            className="text-center text-sm text-gray-500 py-2"
          >
            {day}
          </div>
        ))}

        {/* 날짜 버튼 */}
        {visibleItems.map((item) => {
          const isSelected = item.id === spec.state.selectedId;
          const isAvailable = item.available;
          const dayNum = new Date(item.date).getDate();

          // Highlight 스타일
          let highlightClass = '';
          if (item._highlighted) {
            switch (item._highlightStyle) {
              case 'glow':
                highlightClass = 'shadow-lg shadow-primary/50';
                break;
              case 'badge':
                highlightClass = 'ring-2 ring-yellow-400';
                break;
              case 'border':
              default:
                highlightClass = 'ring-2 ring-primary';
                break;
            }
          }

          return (
            <button
              key={item.id}
              onClick={() => isAvailable && onSelect(item.id)}
              disabled={!isAvailable}
              className={`
                relative aspect-square flex items-center justify-center rounded-lg transition-all
                ${
                  isSelected
                    ? 'bg-primary text-dark font-semibold'
                    : isAvailable
                    ? 'bg-dark-light text-white hover:bg-dark-lighter'
                    : 'bg-dark-border text-gray-600 cursor-not-allowed'
                }
                ${highlightClass}
              `}
            >
              {dayNum}

              {/* Augment 뱃지 */}
              {item._augmented?.badge && (
                <span className="absolute -top-1 -right-1 w-3 h-3 bg-yellow-400 rounded-full" />
              )}
            </button>
          );
        })}
      </div>

      {/* 선택된 날짜 표시 */}
      {selectedDate && (
        <div className="text-gray-400">
          Selected: {selectedDate.date} ({selectedDate.dayOfWeek})
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
