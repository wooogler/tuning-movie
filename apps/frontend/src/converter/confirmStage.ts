import type { Movie, Theater, Showing, Seat, TicketType, Booking } from '../types';
import type { UISpec } from './types';

interface TicketSelection {
  ticketType: TicketType;
  quantity: number;
}

interface ConfirmStageData {
  movie: Movie;
  theater: Theater;
  date: string;
  showing: Showing;
  selectedSeats: Seat[];
  tickets: TicketSelection[];
  totalPrice: number;
  customerName: string;
  customerEmail: string;
}

export function convertConfirmStage(data: ConfirmStageData): UISpec {
  return {
    surface: 'confirm',
    components: [
      {
        id: 'root',
        type: 'Column',
        children: ['summary', 'form', 'actions'],
        props: { align: 'stretch', gap: 6 },
      },
      {
        id: 'summary',
        type: 'BookingSummary',
        data: { path: '/summary' },
      },
      {
        id: 'form',
        type: 'ConfirmForm',
        data: { path: '/customer' },
      },
      {
        id: 'actions',
        type: 'ActionBar',
        props: {
          back: { to: '/tickets', label: 'Back' },
        },
      },
    ],
    dataModel: {
      summary: {
        movie: data.movie,
        theater: data.theater,
        date: data.date,
        showing: data.showing,
        selectedSeats: data.selectedSeats,
        tickets: data.tickets,
        totalPrice: data.totalPrice,
      },
      customer: {
        customerName: data.customerName,
        customerEmail: data.customerEmail,
      },
    },
    actions: {
      submit: { type: 'api', payload: { endpoint: 'createBooking' } },
    },
  };
}

export function convertBookingResultStage(booking: Booking): UISpec {
  return {
    surface: 'booking_result',
    components: [
      {
        id: 'root',
        type: 'BookingResult',
        data: { path: '/booking' },
      },
    ],
    dataModel: { booking },
    actions: {
      bookAnother: { type: 'navigate', payload: { to: '/' } },
    },
  };
}
