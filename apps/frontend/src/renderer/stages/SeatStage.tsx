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
  const formatUsd = (value: number): string =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
  const selectedList = spec.state.selectedList ?? [];
  const selectedIds = selectedList.map((item) => item.id);
  const canProceed = selectedIds.length > 0;

  // 좌석 배치 정보
  const rows = (spec.meta?.rows as string[]) ?? [];

  // Highlight 정보
  const highlightedIds = new Set(spec.modification.highlight?.itemIds ?? []);
  const seatById = new Map(spec.items.map((seat) => [seat.id, seat]));

  // 좌석을 행별로 그룹화 (원본 items 사용)
  const seatsByRow = rows.map((row) =>
    spec.items
      .filter((seat) => seat.row === row)
      .sort((a, b) => a.number - b.number)
  );
  const rowPriceMap = new Map(
    seatsByRow
      .filter((rowSeats) => rowSeats.length > 0)
      .map((rowSeats) => [rowSeats[0].row, rowSeats[0].price])
  );
  const selectedSeatsDetailed = selectedIds
    .map((seatId) => seatById.get(seatId))
    .filter((seat): seat is SeatItem => seat !== undefined);
  const selectedTotalPrice = selectedSeatsDetailed.reduce((sum, seat) => sum + seat.price, 0);

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
            <span className="w-16 text-center text-[11px] text-fg-faint">
              {rows[rowIndex]}
              {rowPriceMap.has(rows[rowIndex]) && (
                <span className="block text-[10px]">{formatUsd(rowPriceMap.get(rows[rowIndex]) ?? 0)}</span>
              )}
            </span>

            {/* Seats */}
            <div className="flex gap-1">
              {rowSeats.map((seat) => {
                const isSelected = selectedIds.includes(seat.id);
                const isOccupied = seat.status === 'occupied';
                const isHighlighted = highlightedIds.has(seat.id);
                const isPremium = seat.type === 'premium';

                const highlightClass = isHighlighted ? 'ring-2 ring-primary' : '';

                return (
                  <button
                    key={seat.id}
                    onClick={() => !isOccupied && onToggle(seat.id)}
                    disabled={isOccupied}
                    title={`${seat.label} • ${formatUsd(seat.price)} • ${seat.type}`}
                    className={`
                      w-8 h-8 rounded-t-lg text-xs font-medium transition-all
                      ${
                        isOccupied
                          ? 'bg-dark-border cursor-not-allowed'
                          : isSelected
                          ? 'bg-primary text-primary-fg'
                          : isPremium
                          ? 'bg-amber-900/55 text-amber-100 hover:bg-amber-800/60'
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
          <span>Standard</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded-t bg-amber-900/55" />
          <span>Premium</span>
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
          Selected:{' '}
          {selectedSeatsDetailed
            .map((seat) => `${seat.label} (${formatUsd(seat.price)})`)
            .join(', ')}{' '}
          ({selectedList.length} seats, total {formatUsd(selectedTotalPrice)})
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
