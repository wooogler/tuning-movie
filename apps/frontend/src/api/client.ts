import type { Movie, Theater, Showing, Seat, TicketType, Booking, BookingRequest } from '../types';

const API_BASE_URL = import.meta.env.VITE_API_URL || '';

async function fetchApi<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(error.error || `HTTP ${response.status}`);
  }

  return response.json();
}

export const api = {
  // Movies
  getMovies: () => fetchApi<{ movies: Movie[] }>('/movies'),
  getMovie: (id: string) => fetchApi<{ movie: Movie }>(`/movies/${id}`),

  // Theaters
  getTheaters: () => fetchApi<{ theaters: Theater[] }>('/theaters'),
  getTheatersByMovie: (movieId: string) =>
    fetchApi<{ theaters: Theater[] }>(`/theaters/movie/${movieId}`),
  getTheater: (id: string) => fetchApi<{ theater: Theater }>(`/theaters/${id}`),

  // Showings
  getShowings: (params: { movieId?: string; theaterId?: string; date?: string }) => {
    const searchParams = new URLSearchParams();
    if (params.movieId) searchParams.set('movieId', params.movieId);
    if (params.theaterId) searchParams.set('theaterId', params.theaterId);
    if (params.date) searchParams.set('date', params.date);
    return fetchApi<{ showings: Showing[] }>(`/showings?${searchParams}`);
  },
  getDates: (movieId: string, theaterId: string) =>
    fetchApi<{ dates: string[] }>(`/showings/dates?movieId=${movieId}&theaterId=${theaterId}`),
  getTimes: (movieId: string, theaterId: string, date: string) =>
    fetchApi<{ showings: Showing[] }>(
      `/showings/times?movieId=${movieId}&theaterId=${theaterId}&date=${date}`
    ),
  getShowing: (id: string) => fetchApi<{ showing: Showing }>(`/showings/${id}`),

  // Seats
  getSeats: (showingId: string) => fetchApi<{ seats: Seat[] }>(`/seats/${showingId}`),

  // Ticket Types
  getTicketTypes: () => fetchApi<{ ticketTypes: TicketType[] }>('/ticket-types'),

  // Bookings
  createBooking: (data: BookingRequest) =>
    fetchApi<{ booking: Booking }>('/bookings', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  getBooking: (id: string) => fetchApi<{ booking: Booking }>(`/bookings/${id}`),
  cancelBooking: (id: string) =>
    fetchApi<{ booking: Booking }>(`/bookings/${id}`, { method: 'DELETE' }),
};
