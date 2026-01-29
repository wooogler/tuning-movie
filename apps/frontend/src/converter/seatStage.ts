import type { Seat } from '../types';
import type { UISpec } from './types';

export function convertSeatStage(
  seats: Seat[],
  selectedSeatIds: string[],
): UISpec {
  return {
    surface: 'seat_select',
    components: [
      {
        id: 'root',
        type: 'Column',
        children: ['screen', 'seat_map', 'legend', 'actions'],
        props: { align: 'center', gap: 6 },
      },
      {
        id: 'screen',
        type: 'ScreenIndicator',
      },
      {
        id: 'seat_map',
        type: 'SeatMap',
        data: { path: '/seats' },
        props: {
          selectedSeats: selectedSeatIds,
        },
      },
      {
        id: 'legend',
        type: 'SeatLegend',
      },
      {
        id: 'actions',
        type: 'ActionBar',
        props: {
          back: { to: '/time', label: 'Back' },
          next: {
            to: '/tickets',
            label: 'Continue',
            disabled: selectedSeatIds.length === 0,
          },
        },
      },
    ],
    dataModel: { seats },
    state: {
      selectedSeats: selectedSeatIds,
    },
    actions: {
      toggleSeat: {
        type: 'setState',
        payload: { target: 'selectedSeats' },
      },
    },
  };
}
