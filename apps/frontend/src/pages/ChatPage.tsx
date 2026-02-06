import { useEffect, useState, useCallback, useRef } from 'react';
import { api } from '../api/client';
import { useBookingStore } from '../store/bookingStore';
import {
  useChatStore,
  getNextStage,
  getPrevStage,
  STAGE_ORDER,
} from '../store/chatStore';
import { useDevTools } from '../components/DevToolsContext';
import {
  generateMovieSpec,
  generateTheaterSpec,
  generateDateSpec,
  generateTimeSpec,
  generateSeatSpec,
  generateTicketSpec,
  generateConfirmSpec,
  createDateItems,
  selectItem,
  toggleItem,
  setQuantity,
  type ConfirmMeta,
} from '../spec';
import { MessageList, ChatInput } from '../components/chat';
import { useToolHandler } from '../hooks';
import type { Movie, Theater, Showing, Seat, TicketType, Booking } from '../types';

// Context for loading stage data (to avoid stale closures)
interface StageContext {
  movie?: Movie | null;
  theater?: Theater | null;
  date?: string | null;
  showing?: Showing | null;
  selectedSeats?: Seat[];
  tickets?: { ticketType: TicketType; quantity: number }[];
}

export function ChatPage() {
  // Stores - extract individual values
  const messages = useChatStore((s) => s.messages);
  const currentStage = useChatStore((s) => s.currentStage);
  const activeSpec = useChatStore((s) => s.activeSpec);
  const addSystemMessage = useChatStore((s) => s.addSystemMessage);
  const addUserMessage = useChatStore((s) => s.addUserMessage);
  const updateActiveSpec = useChatStore((s) => s.updateActiveSpec);
  const resetChat = useChatStore((s) => s.reset);

  const movie = useBookingStore((s) => s.movie);
  const theater = useBookingStore((s) => s.theater);
  const date = useBookingStore((s) => s.date);
  const showing = useBookingStore((s) => s.showing);
  const selectedSeats = useBookingStore((s) => s.selectedSeats);
  const tickets = useBookingStore((s) => s.tickets);
  const setMovie = useBookingStore((s) => s.setMovie);
  const setTheater = useBookingStore((s) => s.setTheater);
  const setDate = useBookingStore((s) => s.setDate);
  const setShowing = useBookingStore((s) => s.setShowing);
  const setSelectedSeats = useBookingStore((s) => s.setSelectedSeats);
  const setTickets = useBookingStore((s) => s.setTickets);
  const resetBooking = useBookingStore((s) => s.reset);

  const { setBackendData, setUiSpec } = useDevTools();

  // Local data cache
  const [movies, setMovies] = useState<Movie[]>([]);
  const [theaters, setTheaters] = useState<Theater[]>([]);
  const [showings, setShowings] = useState<Showing[]>([]);
  const [seats, setSeats] = useState<Seat[]>([]);
  const [ticketTypes, setTicketTypes] = useState<TicketType[]>([]);

  // UI state
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [booking, setBooking] = useState<Booking | null>(null);

  // Track if initial load has happened
  const initialized = useRef(false);

  // =========================================================================
  // Data Fetching & Spec Generation (with context to avoid stale closures)
  // =========================================================================

  const loadStageData = useCallback(
    async (stage: typeof currentStage, ctx: StageContext = {}) => {
      setLoading(true);
      setError(null);

      // Use context values or fall back to current store values
      const ctxMovie = ctx.movie !== undefined ? ctx.movie : movie;
      const ctxTheater = ctx.theater !== undefined ? ctx.theater : theater;
      const ctxDate = ctx.date !== undefined ? ctx.date : date;
      const ctxShowing = ctx.showing !== undefined ? ctx.showing : showing;
      const ctxSelectedSeats = ctx.selectedSeats !== undefined ? ctx.selectedSeats : selectedSeats;
      const ctxTickets = ctx.tickets !== undefined ? ctx.tickets : tickets;

      try {
        switch (stage) {
          case 'movie': {
            const data = await api.getMovies();
            setMovies(data.movies);
            setBackendData({ movies: data.movies });
            const spec = generateMovieSpec(data.movies);
            addSystemMessage('movie', spec);
            setUiSpec(spec);
            break;
          }

          case 'theater': {
            if (!ctxMovie) {
              setError('No movie selected');
              return;
            }
            const data = await api.getTheatersByMovie(ctxMovie.id);
            setTheaters(data.theaters);
            setBackendData({ theaters: data.theaters });
            const spec = generateTheaterSpec(data.theaters, ctxMovie.id);
            addSystemMessage('theater', spec);
            setUiSpec(spec);
            break;
          }

          case 'date': {
            if (!ctxMovie || !ctxTheater) {
              setError('Missing movie or theater');
              return;
            }
            const data = await api.getDates(ctxMovie.id, ctxTheater.id);
            setBackendData({ dates: data.dates });
            const dateItems = createDateItems(new Date(), 14, data.dates);
            const spec = generateDateSpec(dateItems, ctxMovie.id, ctxTheater.id);
            addSystemMessage('date', spec);
            setUiSpec(spec);
            break;
          }

          case 'time': {
            if (!ctxMovie || !ctxTheater || !ctxDate) {
              setError('Missing movie, theater, or date');
              return;
            }
            const data = await api.getTimes(ctxMovie.id, ctxTheater.id, ctxDate);
            setShowings(data.showings);
            setBackendData({ showings: data.showings });
            const spec = generateTimeSpec(data.showings, ctxMovie.id, ctxTheater.id, ctxDate);
            addSystemMessage('time', spec);
            setUiSpec(spec);
            break;
          }

          case 'seat': {
            if (!ctxShowing || !ctxMovie || !ctxTheater || !ctxDate) {
              setError('Missing showing information');
              return;
            }
            const data = await api.getSeats(ctxShowing.id);
            setSeats(data.seats);
            setBackendData({ seats: data.seats });
            const spec = generateSeatSpec(
              data.seats,
              ctxMovie.id,
              ctxTheater.id,
              ctxDate,
              ctxShowing.id
            );
            addSystemMessage('seat', spec);
            setUiSpec(spec);
            break;
          }

          case 'ticket': {
            const data = await api.getTicketTypes();
            setTicketTypes(data.ticketTypes);
            setBackendData({ ticketTypes: data.ticketTypes });
            const spec = generateTicketSpec(
              data.ticketTypes,
              ctxSelectedSeats.map((s) => s.id)
            );
            addSystemMessage('ticket', spec);
            setUiSpec(spec);
            break;
          }

          case 'confirm': {
            if (!ctxMovie || !ctxTheater || !ctxDate || !ctxShowing) {
              setError('Missing booking information');
              return;
            }
            const totalPrice = ctxTickets.reduce(
              (sum, t) => sum + t.ticketType.price * t.quantity,
              0
            );
            const meta: ConfirmMeta = {
              movie: { id: ctxMovie.id, title: ctxMovie.title },
              theater: { id: ctxTheater.id, name: ctxTheater.name },
              date: ctxDate,
              time: ctxShowing.time,
              seats: ctxSelectedSeats.map((s) => s.id),
              tickets: ctxTickets.map((t) => ({
                type: t.ticketType.name,
                quantity: t.quantity,
                price: t.ticketType.price,
              })),
              totalPrice,
            };
            const spec = generateConfirmSpec(meta);
            addSystemMessage('confirm', spec);
            setUiSpec(spec);
            break;
          }
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load data');
      } finally {
        setLoading(false);
      }
    },
    [
      movie,
      theater,
      date,
      showing,
      selectedSeats,
      tickets,
      addSystemMessage,
      setBackendData,
      setUiSpec,
    ]
  );

  // Initialize with movie stage
  useEffect(() => {
    if (!initialized.current) {
      initialized.current = true;
      loadStageData('movie');
    }
  }, [loadStageData]);

  // =========================================================================
  // Selection Handlers
  // =========================================================================

  const handleSelect = useCallback(
    (id: string) => {
      if (!activeSpec) return;
      const newSpec = selectItem(activeSpec, id);
      updateActiveSpec(newSpec);
      setUiSpec(newSpec);
    },
    [activeSpec, updateActiveSpec, setUiSpec]
  );

  const handleToggle = useCallback(
    (id: string) => {
      if (!activeSpec) return;
      const newSpec = toggleItem(activeSpec, id);
      updateActiveSpec(newSpec);
      setUiSpec(newSpec);
    },
    [activeSpec, updateActiveSpec, setUiSpec]
  );

  const handleQuantityChange = useCallback(
    (typeId: string, quantity: number) => {
      if (!activeSpec) return;
      const newSpec = setQuantity(activeSpec, typeId, quantity);
      updateActiveSpec(newSpec);
      setUiSpec(newSpec);

      // Also update booking store for tickets
      const ticketType = ticketTypes.find((t) => t.id === typeId);
      if (ticketType) {
        const newTickets = tickets.filter((t) => t.ticketType.id !== typeId);
        if (quantity > 0) {
          newTickets.push({ ticketType, quantity });
        }
        setTickets(newTickets);
      }
    },
    [activeSpec, ticketTypes, tickets, updateActiveSpec, setUiSpec, setTickets]
  );

  // =========================================================================
  // Navigation Handlers
  // =========================================================================

  const handleNext = useCallback(async () => {
    if (!activeSpec) return;

    // Get selection label for user message
    let selectionLabel = '';
    const nextCtx: StageContext = {};

    switch (currentStage) {
      case 'movie': {
        const selectedId = activeSpec.state.selected?.id;
        if (!selectedId) return;
        const selectedMovie = movies.find((m) => m.id === selectedId);
        if (!selectedMovie) return;
        selectionLabel = selectedMovie.title;
        setMovie(selectedMovie);
        nextCtx.movie = selectedMovie;
        break;
      }

      case 'theater': {
        const selectedId = activeSpec.state.selected?.id;
        if (!selectedId) return;
        const selectedTheater = theaters.find((t) => t.id === selectedId);
        if (!selectedTheater) return;
        selectionLabel = selectedTheater.name;
        setTheater(selectedTheater);
        nextCtx.movie = movie;
        nextCtx.theater = selectedTheater;
        break;
      }

      case 'date': {
        const selectedId = activeSpec.state.selected?.id;
        if (!selectedId) return;
        selectionLabel = selectedId;
        setDate(selectedId);
        nextCtx.movie = movie;
        nextCtx.theater = theater;
        nextCtx.date = selectedId;
        break;
      }

      case 'time': {
        const selectedId = activeSpec.state.selected?.id;
        if (!selectedId) return;
        const selectedShowing = showings.find((s) => s.id === selectedId);
        if (!selectedShowing) return;
        selectionLabel = selectedShowing.time;
        setShowing(selectedShowing);
        nextCtx.movie = movie;
        nextCtx.theater = theater;
        nextCtx.date = date;
        nextCtx.showing = selectedShowing;
        break;
      }

      case 'seat': {
        const selectedIds = activeSpec.state.selectedList?.map((item) => item.id) ?? [];
        if (selectedIds.length === 0) return;
        const selectedSeatObjects = seats.filter((s) => selectedIds.includes(s.id));
        selectionLabel = `${selectedSeatObjects.length} seat(s) selected`;
        setSelectedSeats(selectedSeatObjects);
        nextCtx.movie = movie;
        nextCtx.theater = theater;
        nextCtx.date = date;
        nextCtx.showing = showing;
        nextCtx.selectedSeats = selectedSeatObjects;
        break;
      }

      case 'ticket': {
        const quantities = activeSpec.state.quantities ?? [];
        const totalTickets = quantities.reduce((sum, q) => sum + q.count, 0);
        if (totalTickets === 0) return;
        selectionLabel = `${totalTickets} ticket(s)`;
        nextCtx.movie = movie;
        nextCtx.theater = theater;
        nextCtx.date = date;
        nextCtx.showing = showing;
        nextCtx.selectedSeats = selectedSeats;
        nextCtx.tickets = tickets;
        break;
      }

      case 'confirm': {
        await handleConfirm();
        return;
      }
    }

    // Add user message
    addUserMessage(currentStage, 'select', selectionLabel);

    // Move to next stage with context
    const nextStage = getNextStage(currentStage);
    if (nextStage) {
      loadStageData(nextStage, nextCtx);
    }
  }, [
    activeSpec,
    currentStage,
    movies,
    theaters,
    showings,
    seats,
    movie,
    theater,
    date,
    showing,
    selectedSeats,
    tickets,
    setMovie,
    setTheater,
    setDate,
    setShowing,
    setSelectedSeats,
    addUserMessage,
    loadStageData,
  ]);

  const handleBack = useCallback(async () => {
    const prevStage = getPrevStage(currentStage);
    if (!prevStage) return;

    // Add user message for going back
    addUserMessage(currentStage, 'back', '← Back');

    // Build context from current store state
    const ctx: StageContext = {
      movie,
      theater,
      date,
      showing,
      selectedSeats,
      tickets,
    };

    // Load previous stage data
    loadStageData(prevStage, ctx);
  }, [currentStage, movie, theater, date, showing, selectedSeats, tickets, addUserMessage, loadStageData]);

  const handleConfirm = useCallback(async () => {
    if (!showing) return;

    setLoading(true);
    setError(null);

    try {
      const result = await api.createBooking({
        showingId: showing.id,
        seats: selectedSeats.map((s) => s.id),
        tickets: tickets.map((t) => ({
          ticketTypeId: t.ticketType.id,
          quantity: t.quantity,
        })),
        customerName: 'Guest',
        customerEmail: 'guest@example.com',
      });

      setBooking(result.booking);
      addUserMessage('confirm', 'select', 'Booking Confirmed!');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Booking failed');
    } finally {
      setLoading(false);
    }
  }, [showing, selectedSeats, tickets, addUserMessage]);

  const handleBookAnother = useCallback(() => {
    resetBooking();
    resetChat();
    setBooking(null);
    initialized.current = false;
    loadStageData('movie');
  }, [resetBooking, resetChat, loadStageData]);

  // =========================================================================
  // Tool Handler (for DevTools Agent Tools)
  // =========================================================================

  const handleSetSpec = useCallback(
    (newSpec: typeof activeSpec) => {
      if (newSpec) {
        updateActiveSpec(newSpec);
        setUiSpec(newSpec);
      }
    },
    [updateActiveSpec, setUiSpec]
  );

  useToolHandler({
    spec: activeSpec,
    setSpec: handleSetSpec,
    onNext: handleNext,
    onBack: handleBack,
    multiSelect: currentStage === 'seat',
  });

  // =========================================================================
  // Render
  // =========================================================================

  return (
    <div className="flex flex-col h-screen bg-dark">
      {/* Header */}
      <header className="shrink-0 border-b border-gray-700 bg-dark px-4 py-3">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <h1 className="text-lg font-semibold text-white">Movie Booking</h1>
          <div className="text-sm text-gray-400">
            Step {STAGE_ORDER.indexOf(currentStage) + 1} of {STAGE_ORDER.length}
          </div>
        </div>
      </header>

      {/* Messages */}
      <MessageList
        messages={messages}
        activeSpec={activeSpec}
        onSelect={handleSelect}
        onToggle={handleToggle}
        onQuantityChange={handleQuantityChange}
        onNext={handleNext}
        onBack={handleBack}
        onConfirm={handleConfirm}
      />

      {/* Loading indicator */}
      {loading && (
        <div className="shrink-0 px-4 py-2 text-center text-gray-400 text-sm">
          Loading...
        </div>
      )}

      {/* Error display */}
      {error && (
        <div className="shrink-0 px-4 py-2 text-center text-primary text-sm">
          Error: {error}
        </div>
      )}

      {/* Booking success */}
      {booking && (
        <div className="shrink-0 px-4 py-4 border-t border-gray-700 bg-dark-light">
          <div className="max-w-3xl mx-auto text-center">
            <div className="text-2xl mb-2">🎉</div>
            <p className="text-white font-medium">Booking Confirmed!</p>
            <p className="text-gray-400 text-sm mb-3">Booking ID: {booking.id}</p>
            <button
              onClick={handleBookAnother}
              className="px-4 py-2 bg-primary text-dark rounded-lg hover:bg-primary/80"
            >
              Book Another
            </button>
          </div>
        </div>
      )}

      {/* Input */}
      <ChatInput disabled placeholder="Text input coming soon..." />
    </div>
  );
}
