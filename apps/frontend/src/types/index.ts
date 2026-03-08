export interface Movie {
  id: string;
  title: string;
  genre: string[];
  duration: string;
  rating: string;
  ageRating: string;
  synopsis: string;
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
  format: 'Standard' | 'IMAX' | '3D';
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
  seats: string[];
  customerName: string;
  customerEmail: string;
}

export interface Booking {
  id: string;
  showingId: string;
  customerName: string;
  customerEmail: string;
  totalPrice: number;
  status: 'confirmed' | 'cancelled';
  createdAt: string;
  seats?: string[];
}
