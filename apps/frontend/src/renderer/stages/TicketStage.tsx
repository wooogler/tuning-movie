/**
 * TicketStage Component
 *
 * 티켓 종류별 수량 선택 Stage - TicketCounter 사용
 */

import type { TicketItem, HighlightStyle } from '../../spec';
import { ActionBar } from './ActionBar';
import type { StageProps } from './types';

interface TicketStageProps extends StageProps<TicketItem> {
  onQuantityChange: (typeId: string, quantity: number) => void;
}

export function TicketStage({
  spec,
  onQuantityChange,
  onNext,
  onBack,
}: TicketStageProps) {
  const quantities = spec.state.quantities ?? [];
  const maxTotal = (spec.meta?.maxTotal as number) ?? 0;

  // ID → count 맵 생성
  const quantityMap = new Map(quantities.map((q) => [q.item.id, q.count]));

  // Highlight 정보
  const highlightedIds = new Set(spec.modification.highlight?.itemIds ?? []);
  const highlightStyle: HighlightStyle = spec.modification.highlight?.style ?? 'border';

  // 현재 총 수량
  const currentTotal = quantities.reduce((sum, q) => sum + q.count, 0);
  const canProceed = currentTotal === maxTotal && maxTotal > 0;

  return (
    <div className="flex flex-col items-center gap-6">
      <div className="w-full max-w-md space-y-4">
        {spec.items.map((ticket) => {
          const quantity = quantityMap.get(ticket.id) ?? 0;
          const canIncrease = currentTotal < maxTotal;
          const canDecrease = quantity > 0;
          const isHighlighted = highlightedIds.has(ticket.id);

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

          return (
            <div
              key={ticket.id}
              className={`
                flex items-center justify-between p-4 rounded-xl bg-dark-light
                ${highlightClass}
              `}
            >
              {/* Ticket info */}
              <div>
                <div className="font-semibold text-white">{ticket.name}</div>
                <div className="text-sm text-gray-400">
                  {ticket.priceDisplay}
                </div>
                {ticket.description && (
                  <div className="text-xs text-gray-500 mt-1">
                    {ticket.description}
                  </div>
                )}
              </div>

              {/* Quantity controls */}
              <div className="flex items-center gap-3">
                <button
                  onClick={() => canDecrease && onQuantityChange(ticket.id, quantity - 1)}
                  disabled={!canDecrease}
                  className={`
                    w-10 h-10 rounded-lg text-xl font-bold transition-colors
                    ${
                      canDecrease
                        ? 'bg-dark-lighter text-white hover:bg-dark-border'
                        : 'bg-dark-border text-gray-600 cursor-not-allowed'
                    }
                  `}
                >
                  -
                </button>

                <span className="w-8 text-center text-xl font-semibold text-white">
                  {quantity}
                </span>

                <button
                  onClick={() => canIncrease && onQuantityChange(ticket.id, quantity + 1)}
                  disabled={!canIncrease}
                  className={`
                    w-10 h-10 rounded-lg text-xl font-bold transition-colors
                    ${
                      canIncrease
                        ? 'bg-primary text-dark hover:bg-primary-hover'
                        : 'bg-dark-border text-gray-600 cursor-not-allowed'
                    }
                  `}
                >
                  +
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Total info */}
      <div className="text-center">
        <div className="text-gray-400">
          {currentTotal} / {maxTotal} tickets selected
        </div>
        {currentTotal !== maxTotal && (
          <div className="text-sm text-yellow-400 mt-1">
            Please select {maxTotal} tickets (same as seats)
          </div>
        )}
      </div>

      <ActionBar
        onBack={onBack}
        onNext={onNext}
        nextDisabled={!canProceed}
      />
    </div>
  );
}
