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
  distanceMiles: number;
  amenities: string[];
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
  price: number;
  status: 'available' | 'occupied' | 'selected';
}

export interface BookingRequest {
  showingId: string;
  seatIds: string[];
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
  customerInfo: {
    name: string;
    phone: string;
    email: string;
  };
  totalPrice: number;
  status: 'confirmed' | 'cancelled';
  createdAt: string;
}
