/**
 * ConfirmStage Component
 *
 * 예약 확인 Stage - BookingSummary 사용
 */

import type { ConfirmMeta } from '../../spec';
import { ActionBar } from './ActionBar';
import type { StageProps } from './types';

interface ConfirmStageProps extends Omit<StageProps, 'onSelect'> {
  onConfirm: () => void;
}

export function ConfirmStage({
  spec,
  onConfirm,
  onBack,
}: ConfirmStageProps) {
  const meta = spec.meta as ConfirmMeta;

  // 총 가격 계산
  const totalPrice = meta.tickets.reduce(
    (sum, t) => sum + t.price * t.quantity,
    0
  );

  return (
    <div className="flex flex-col items-center gap-6">
      <div className="w-full max-w-md bg-dark-light rounded-xl p-6 space-y-4">
        {/* Movie */}
        <div className="flex justify-between">
          <span className="text-gray-400">Movie</span>
          <span className="text-white font-semibold">{meta.movie.title}</span>
        </div>

        {/* Theater */}
        <div className="flex justify-between">
          <span className="text-gray-400">Theater</span>
          <span className="text-white">{meta.theater.name}</span>
        </div>

        {/* Date & Time */}
        <div className="flex justify-between">
          <span className="text-gray-400">Date & Time</span>
          <span className="text-white">
            {meta.date} {meta.time}
          </span>
        </div>

        {/* Seats */}
        <div className="flex justify-between">
          <span className="text-gray-400">Seats</span>
          <span className="text-white">{meta.seats.join(', ')}</span>
        </div>

        <hr className="border-dark-border" />

        {/* Tickets */}
        <div className="space-y-2">
          <span className="text-gray-400">Tickets</span>
          {meta.tickets
            .filter((t) => t.quantity > 0)
            .map((ticket, index) => (
              <div key={index} className="flex justify-between pl-4">
                <span className="text-gray-300">
                  {ticket.type} x {ticket.quantity}
                </span>
                <span className="text-white">
                  ₩{(ticket.price * ticket.quantity).toLocaleString()}
                </span>
              </div>
            ))}
        </div>

        <hr className="border-dark-border" />

        {/* Total */}
        <div className="flex justify-between text-lg">
          <span className="text-gray-400 font-semibold">Total</span>
          <span className="text-primary font-bold">
            ₩{totalPrice.toLocaleString()}
          </span>
        </div>
      </div>

      <ActionBar
        onBack={onBack}
        onNext={onConfirm}
        nextLabel="Confirm Booking"
      />
    </div>
  );
}
