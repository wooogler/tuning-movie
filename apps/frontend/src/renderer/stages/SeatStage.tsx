/**
 * SeatStage Component
 *
 * 좌석 선택 Stage - SeatMap 사용
 */

import type { SeatItem } from '../../spec';
import { ActionBar } from './ActionBar';
import type { StageProps } from './types';

interface SeatStageProps extends StageProps<SeatItem> {
  onToggle: (id: string) => void;
}

export function SeatStage({
  spec,
  onToggle,
  onNext,
  onBack,
}: SeatStageProps) {
  const selectedList = spec.state.selectedList ?? [];
  const selectedIds = selectedList.map((item) => item.id);
  const canProceed = selectedIds.length > 0;

  // 좌석 배치 정보
  const rows = (spec.meta?.rows as string[]) ?? [];

  // Highlight 정보
  const highlightedIds = new Set(spec.modification.highlight?.itemIds ?? []);

  // 좌석을 행별로 그룹화 (원본 items 사용)
  const seatsByRow = rows.map((row) =>
    spec.items
      .filter((seat) => seat.row === row)
      .sort((a, b) => a.number - b.number)
  );

  return (
    <div className="flex flex-col items-center gap-6">
      {/* Screen indicator */}
      <div className="w-full max-w-lg">
        <div className="w-3/4 h-2 mx-auto bg-gradient-to-b from-gray-300 to-gray-500 rounded-t-full mb-2" />
        <div className="text-center text-sm text-fg-faint mb-6">SCREEN</div>
      </div>

      {/* Seat map */}
      <div className="flex flex-col gap-2">
        {seatsByRow.map((rowSeats, rowIndex) => (
          <div key={rows[rowIndex]} className="flex items-center gap-2">
            {/* Row label */}
            <span className="w-6 text-center text-sm text-fg-faint">
              {rows[rowIndex]}
            </span>

            {/* Seats */}
            <div className="flex gap-1">
              {rowSeats.map((seat) => {
                const isSelected = selectedIds.includes(seat.id);
                const isOccupied = seat.status === 'occupied';
                const isHighlighted = highlightedIds.has(seat.id);

                const highlightClass = isHighlighted ? 'ring-2 ring-primary' : '';

                return (
                  <button
                    key={seat.id}
                    onClick={() => !isOccupied && onToggle(seat.id)}
                    disabled={isOccupied}
                    className={`
                      w-8 h-8 rounded-t-lg text-xs font-medium transition-all
                      ${
                        isOccupied
                          ? 'bg-dark-border cursor-not-allowed'
                          : isSelected
                          ? 'bg-primary text-primary-fg'
                          : 'bg-dark-light hover:bg-dark-lighter text-fg-strong'
                      }
                      ${highlightClass}
                    `}
                  >
                    {seat.number}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Legend */}
      <div className="flex gap-6 text-sm text-fg-muted">
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded-t bg-dark-light" />
          <span>Available</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded-t bg-primary" />
          <span>Selected</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded-t bg-dark-border" />
          <span>Occupied</span>
        </div>
      </div>

      {/* Selected seats info */}
      {selectedList.length > 0 && (
        <div className="text-fg-muted">
          Selected: {selectedList.map((item) => item.value).join(', ')} ({selectedList.length} seats)
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
