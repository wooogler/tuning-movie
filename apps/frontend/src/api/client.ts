import type { Movie, Theater, Showing, Seat, Booking, BookingRequest } from '../types';
import type { StudyModeId } from '../pages/studyOptions';
import {
  getStoredStudySession,
  type StudySessionState,
  type StudyScenarioDetail,
  type StudyScenarioSummary,
} from '../study/sessionStorage';

interface StudySessionInfo extends Omit<StudySessionState, 'studyToken'> {
  scenario: StudyScenarioSummary & {
    story: string;
    narratorPreferenceTypes: string[];
  };
  story: string;
  narratorPreferenceTypes: string[];
  status: 'active' | 'finished' | 'expired';
}

const API_BASE_URL = import.meta.env.VITE_API_URL || '';

async function getErrorMessage(response: Response): Promise<string> {
  const defaultMessage = `HTTP ${response.status}`;
  const contentType = response.headers.get('content-type') ?? '';

  if (contentType.includes('application/json')) {
    const error = await response.json().catch(() => null);
    if (error && typeof error === 'object') {
      if (typeof (error as { error?: unknown }).error === 'string') {
        return (error as { error: string }).error;
      }
      if (typeof (error as { message?: unknown }).message === 'string') {
        return (error as { message: string }).message;
      }
    }
    return defaultMessage;
  }

  const text = await response.text().catch(() => '');
  if (!text) return defaultMessage;
  return `${defaultMessage}: ${text.slice(0, 120)}`;
}

interface FetchApiOptions extends RequestInit {
  includeStudyToken?: boolean;
}

async function fetchApi<T>(endpoint: string, options?: FetchApiOptions): Promise<T> {
  const session = getStoredStudySession();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options?.headers as Record<string, string> | undefined),
  };
  if (options?.includeStudyToken !== false && session?.studyToken) {
    headers['x-study-session-token'] = session.studyToken;
  }

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${endpoint}`, {
      ...options,
      headers,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Network request failed';
    throw new Error(
      `Cannot reach backend API (${API_BASE_URL || 'same-origin'}). ${message}`
    );
  }

  if (!response.ok) {
    const message = await getErrorMessage(response);
    throw new Error(message);
  }

  return response.json();
}

export const api = {
  // Study scenarios/sessions
  getStudyScenarios: () =>
    fetchApi<{
      scenarios: StudyScenarioDetail[];
    }>('/study/scenarios', {
      includeStudyToken: false,
    }),
  createStudySession: (data: {
    scenarioId: string;
    studyMode: StudyModeId;
    participantId?: string;
  }) =>
    fetchApi<StudySessionState>('/study/sessions', {
      method: 'POST',
      includeStudyToken: false,
      body: JSON.stringify(data),
    }),
  getCurrentStudySession: () => fetchApi<StudySessionInfo>('/study/sessions/me'),
  finishStudySession: () =>
    fetchApi<{ sessionId: string; status: 'finished' | 'expired'; finishedAt: string | null }>(
      '/study/sessions/finish',
      {
        method: 'POST',
      }
    ),

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

  // Bookings
  createBooking: (data: BookingRequest) =>
    fetchApi<{ booking: Booking }>('/bookings', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  getBooking: (id: string) => fetchApi<{ booking: Booking }>(`/bookings/${id}`),
  cancelBooking: (id: string) =>
    fetchApi<{ booking: Booking }>(`/bookings/${id}`, { method: 'DELETE' }),

  // Agent config
  getAgentModel: () => fetchApi<{ model: 'openai' | 'gemini' }>('/agent/config/model'),
  setAgentModel: (model: 'openai' | 'gemini') =>
    fetchApi<{ model: 'openai' | 'gemini' }>('/agent/config/model', {
      method: 'PUT',
      body: JSON.stringify({ model }),
    }),
  getGuiAdaptationConfig: () => fetchApi<{ enabled: boolean }>('/agent/config/gui-adaptation'),
  setGuiAdaptationConfig: (enabled: boolean) =>
    fetchApi<{ enabled: boolean }>('/agent/config/gui-adaptation', {
      method: 'PUT',
      body: JSON.stringify({ enabled }),
    }),
};
