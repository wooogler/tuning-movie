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
  onStartOver,
}: ConfirmStageProps) {
  const meta = spec.meta as unknown as ConfirmMeta;
  const totalPrice = meta.totalPrice;
  const formattedTotal = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(totalPrice);

  return (
    <div className="flex flex-col items-center gap-6">
      <div className="w-full max-w-md bg-dark-light rounded-xl p-6">
        <table className="w-full border-separate border-spacing-y-3">
          <tbody>
            <tr>
              <td className="text-fg-muted pr-6 align-top whitespace-nowrap">Movie</td>
              <td className="text-fg-strong font-semibold text-right">{meta.movie.title}</td>
            </tr>
            <tr>
              <td className="text-fg-muted pr-6 align-top whitespace-nowrap">Theater</td>
              <td className="text-fg-strong text-right">{meta.theater.name}</td>
            </tr>
            <tr>
              <td className="text-fg-muted pr-6 align-top whitespace-nowrap">Date & Time</td>
              <td className="text-fg-strong text-right">{meta.date} {meta.time}</td>
            </tr>
            <tr>
              <td className="text-fg-muted pr-6 align-top whitespace-nowrap">Seats</td>
              <td className="text-right">
                <div className="flex flex-col items-end gap-1">
                  {meta.seats.map((seat) => (
                    <span key={seat} className="text-fg-strong">{seat}</span>
                  ))}
                </div>
              </td>
            </tr>
          </tbody>
        </table>

        <hr className="border-dark-border my-4" />

        <div className="flex justify-between items-center text-lg">
          <span className="text-fg-muted font-semibold">Total</span>
          <span className="text-primary font-bold">{formattedTotal}</span>
        </div>
      </div>

      <ActionBar
        onBack={onBack}
        onNext={onConfirm}
        onStartOver={onStartOver}
        nextLabel="Confirm Booking"
      />
    </div>
  );
}
