import { create } from 'zustand';
import type { Movie, Theater, Showing, Seat, TicketType } from '../types';

interface TicketSelection {
  ticketType: TicketType;
  quantity: number;
}

interface BookingState {
  movie: Movie | null;
  theater: Theater | null;
  date: string | null;
  showing: Showing | null;
  selectedSeats: Seat[];
  tickets: TicketSelection[];
  customerName: string;
  customerEmail: string;
}

interface BookingActions {
  setMovie: (movie: Movie) => void;
  setTheater: (theater: Theater) => void;
  setDate: (date: string) => void;
  setShowing: (showing: Showing) => void;
  setSelectedSeats: (seats: Seat[]) => void;
  toggleSeat: (seat: Seat) => void;
  setTickets: (tickets: TicketSelection[]) => void;
  setCustomerInfo: (name: string, email: string) => void;
  getTotalPrice: () => number;
  reset: () => void;
}

const initialState: BookingState = {
  movie: null,
  theater: null,
  date: null,
  showing: null,
  selectedSeats: [],
  tickets: [],
  customerName: '',
  customerEmail: '',
};

export const useBookingStore = create<BookingState & BookingActions>((set, get) => ({
  ...initialState,

  setMovie: (movie) =>
    set({
      movie,
      theater: null,
      date: null,
      showing: null,
      selectedSeats: [],
      tickets: [],
    }),

  setTheater: (theater) =>
    set({
      theater,
      date: null,
      showing: null,
      selectedSeats: [],
      tickets: [],
    }),

  setDate: (date) =>
    set({
      date,
      showing: null,
      selectedSeats: [],
      tickets: [],
    }),

  setShowing: (showing) =>
    set({
      showing,
      selectedSeats: [],
      tickets: [],
    }),

  setSelectedSeats: (selectedSeats) => set({ selectedSeats }),

  toggleSeat: (seat) => {
    const { selectedSeats } = get();
    const exists = selectedSeats.find((s) => s.id === seat.id);
    if (exists) {
      set({ selectedSeats: selectedSeats.filter((s) => s.id !== seat.id) });
    } else {
      set({ selectedSeats: [...selectedSeats, seat] });
    }
  },

  setTickets: (tickets) => set({ tickets }),

  setCustomerInfo: (customerName, customerEmail) => set({ customerName, customerEmail }),

  getTotalPrice: () => {
    const { tickets } = get();
    return tickets.reduce((total, t) => total + t.ticketType.price * t.quantity, 0);
  },

  reset: () => set(initialState),
}));
