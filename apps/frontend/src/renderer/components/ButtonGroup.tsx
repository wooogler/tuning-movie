/**
 * ButtonGroup Component
 *
 * Movie, Theater, Time Stage에서 사용하는 텍스트 버튼 목록
 * highlight/augment 지원
 */

import type { VisibleItem } from '../../spec';

interface ButtonGroupProps {
  items: VisibleItem[];
  selectedId?: string;
  onSelect: (id: string) => void;
  labelField: string;
  disabled?: boolean;
}

export function ButtonGroup({
  items,
  selectedId,
  onSelect,
  labelField,
  disabled = false,
}: ButtonGroupProps) {
  return (
    <div className="flex flex-col gap-3 w-full max-w-md">
      {items.map((item) => {
        const isSelected = item.id === selectedId;
        const label = String(item[labelField] ?? item.id);

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

        // Augment 뱃지
        const augmentBadge = item._augmented?.badge as string | undefined;
        const augmentText = item._augmented?.text as string | undefined;

        return (
          <button
            key={item.id}
            onClick={() => !disabled && onSelect(item.id)}
            disabled={disabled}
            className={`
              relative w-full px-6 py-4 rounded-xl text-left transition-all border
              ${
                isSelected
                  ? 'bg-primary text-dark font-semibold border-primary'
                  : 'bg-dark-light text-white hover:bg-dark-lighter border-gray-600 hover:border-gray-500'
              }
              ${highlightClass}
              ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
            `}
          >
            <span className="block">{label}</span>

            {/* Augment 추가 텍스트 */}
            {augmentText && (
              <span className="block text-sm text-gray-400 mt-1">
                {augmentText}
              </span>
            )}

            {/* Augment 뱃지 */}
            {augmentBadge && (
              <span className="absolute top-2 right-2 px-2 py-1 text-xs bg-yellow-400 text-dark rounded-full font-semibold">
                {augmentBadge}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
