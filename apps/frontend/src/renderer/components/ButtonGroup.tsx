/**
 * ButtonGroup Component
 *
 * Movie, Theater, Time Stage에서 사용하는 텍스트 버튼 목록
 * DisplayItem의 value를 직접 렌더링
 */

import type { DisplayItem } from '../../spec';

interface ButtonGroupProps {
  items: DisplayItem[];
  onSelect: (id: string) => void;
  selectedId?: string;
  highlightedIds?: string[];
  disabled?: boolean;
}

export function ButtonGroup({
  items,
  onSelect,
  selectedId,
  highlightedIds = [],
  disabled = false,
}: ButtonGroupProps) {
  const highlightSet = new Set(highlightedIds);

  return (
    <div className="flex flex-col gap-3 w-full max-w-md">
      {items.map((item) => {
        const isSelected = item.id === selectedId;
        const isHighlighted = highlightSet.has(item.id);

        const highlightClass = isHighlighted ? 'ring-2 ring-primary' : '';

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
                  ? 'bg-primary text-primary-fg font-semibold border-primary'
                  : 'bg-dark-light text-fg-strong hover:bg-dark-lighter border-dark-border hover:border-dark-border'
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
