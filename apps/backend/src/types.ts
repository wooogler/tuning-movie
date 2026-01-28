export interface Movie {
  id: string;
  title: string;
  posterUrl: string;
  genre: string[];
  duration: number;
  rating: string;
  releaseDate: string;
}

export interface Theater {
  id: string;
  name: string;
  location: string;
  screenCount: number;
}

export interface Showing {
  id: string;
  movieId: string;
  theaterId: string;
  screenNumber: number;
  date: string;
  time: string;
  availableSeats: number;
  totalSeats: number;
}

export interface Seat {
  id: string;
  showingId: string;
  row: string;
  number: number;
  type: 'standard' | 'premium' | 'couple';
  status: 'available' | 'occupied' | 'selected';
}

export interface TicketType {
  id: string;
  name: string;
  price: number;
  description: string;
}

export interface BookingRequest {
  showingId: string;
  seatIds: string[];
  tickets: {
    ticketTypeId: string;
    quantity: number;
  }[];
  customerInfo: {
    name: string;
    phone: string;
    email: string;
  };
}

export interface Booking {
  id: string;
  showingId: string;
  seatIds: string[];
  tickets: {
    ticketTypeId: string;
    quantity: number;
  }[];
  customerInfo: {
    name: string;
    phone: string;
    email: string;
  };
  totalPrice: number;
  status: 'confirmed' | 'cancelled';
  createdAt: string;
}
