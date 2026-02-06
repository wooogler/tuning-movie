/**
 * ButtonGroup Component
 *
 * Movie, Theater, Time Stage에서 사용하는 텍스트 버튼 목록
 * DisplayItem의 value를 직접 렌더링
 */

import type { DisplayItem, HighlightStyle } from '../../spec';

interface ButtonGroupProps {
  items: DisplayItem[];
  onSelect: (id: string) => void;
  selectedId?: string;
  highlightedIds?: string[];
  highlightStyle?: HighlightStyle;
  disabled?: boolean;
}

export function ButtonGroup({
  items,
  onSelect,
  selectedId,
  highlightedIds = [],
  highlightStyle = 'border',
  disabled = false,
}: ButtonGroupProps) {
  const highlightSet = new Set(highlightedIds);

  return (
    <div className="flex flex-col gap-3 w-full max-w-md">
      {items.map((item) => {
        const isSelected = item.id === selectedId;
        const isHighlighted = highlightSet.has(item.id);

        // Highlight 스타일
        let highlightClass = '';
        if (isHighlighted) {
          switch (highlightStyle) {
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

        const isDisabled = disabled || item.isDisabled;

        return (
          <button
            key={item.id}
            onClick={() => !isDisabled && onSelect(item.id)}
            disabled={isDisabled}
            className={`
              relative w-full px-6 py-4 rounded-xl text-left transition-all border
              ${
                isSelected
                  ? 'bg-primary text-dark font-semibold border-primary'
                  : 'bg-dark-light text-white hover:bg-dark-lighter border-gray-600 hover:border-gray-500'
              }
              ${highlightClass}
              ${isDisabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
            `}
          >
            <span className="block">{item.value}</span>
          </button>
        );
      })}
    </div>
  );
}
