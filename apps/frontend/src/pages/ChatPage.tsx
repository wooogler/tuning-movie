import { useEffect, useState, useCallback, useRef } from 'react';
import { api } from '../api/client';
import {
  useChatStore,
  getNextStage,
  getPrevStage,
  STAGE_ORDER,
} from '../store/chatStore';
import { useDevTools } from '../components/devToolsContextShared';
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
  type BookingContext,
  type BookingTicketSelection,
  type UISpec,
  type Stage,
} from '../spec';
import { MessageList, ChatInput } from '../components/chat';
import { useToolHandler } from '../hooks';
import type { Movie, Theater, Showing, TicketType, Booking } from '../types';

interface StageContext {
  booking?: BookingContext;
}

function getBookingContext(spec: UISpec | null): BookingContext {
  return spec?.state.booking ?? {};
}

function withBookingContext<T>(spec: UISpec<T>, booking: BookingContext): UISpec<T> {
  return {
    ...spec,
    state: {
      ...spec.state,
      booking,
    },
  };
}

function projectBookingForStage(stage: Stage, booking: BookingContext): BookingContext {
  switch (stage) {
    case 'movie':
      return {};
    case 'theater':
      return { movie: booking.movie };
    case 'date':
      return {
        movie: booking.movie,
        theater: booking.theater,
      };
    case 'time':
      return {
        movie: booking.movie,
        theater: booking.theater,
        date: booking.date,
      };
    case 'seat':
      return {
        movie: booking.movie,
        theater: booking.theater,
        date: booking.date,
        showing: booking.showing,
      };
    case 'ticket':
      return {
        movie: booking.movie,
        theater: booking.theater,
        date: booking.date,
        showing: booking.showing,
        selectedSeats: booking.selectedSeats,
        tickets: booking.tickets,
      };
    case 'confirm':
      return {
        movie: booking.movie,
        theater: booking.theater,
        date: booking.date,
        showing: booking.showing,
        selectedSeats: booking.selectedSeats,
        tickets: booking.tickets,
      };
    default:
      return {};
  }
}

function buildTicketSelections(
  quantities: NonNullable<UISpec['state']['quantities']>,
  ticketTypes: TicketType[]
): BookingTicketSelection[] {
  return quantities
    .filter((q) => q.count > 0)
    .map((q) => {
      const ticketType = ticketTypes.find((t) => t.id === q.item.id);
      if (!ticketType) return null;
      return {
        ticketTypeId: ticketType.id,
        name: ticketType.name,
        price: ticketType.price,
        quantity: q.count,
      };
    })
    .filter((ticket): ticket is BookingTicketSelection => ticket !== null);
}

export function ChatPage() {
  const messages = useChatStore((s) => s.messages);
  const currentStage = useChatStore((s) => s.currentStage);
  const activeSpec = useChatStore((s) => s.activeSpec);
  const addSystemMessage = useChatStore((s) => s.addSystemMessage);
  const addUserMessage = useChatStore((s) => s.addUserMessage);
  const updateActiveSpec = useChatStore((s) => s.updateActiveSpec);
  const resetChat = useChatStore((s) => s.reset);

  const { setBackendData, setUiSpec } = useDevTools();

  const [movies, setMovies] = useState<Movie[]>([]);
  const [theaters, setTheaters] = useState<Theater[]>([]);
  const [showings, setShowings] = useState<Showing[]>([]);
  const [ticketTypes, setTicketTypes] = useState<TicketType[]>([]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [booking, setBooking] = useState<Booking | null>(null);

  const initialized = useRef(false);

  const loadStageData = useCallback(
    async (stage: typeof currentStage, ctx: StageContext = {}) => {
      setLoading(true);
      setError(null);

      const bookingCtx = ctx.booking ?? getBookingContext(activeSpec);

      try {
        switch (stage) {
          case 'movie': {
            const data = await api.getMovies();
            setMovies(data.movies);
            setBackendData({ movies: data.movies });
            const spec = withBookingContext(generateMovieSpec(data.movies), {});
            addSystemMessage('movie', spec);
            setUiSpec(spec);
            break;
          }

          case 'theater': {
            if (!bookingCtx.movie) {
              setError('No movie selected');
              return;
            }
            const data = await api.getTheatersByMovie(bookingCtx.movie.id);
            setTheaters(data.theaters);
            setBackendData({ theaters: data.theaters });
            const spec = withBookingContext(
              generateTheaterSpec(data.theaters, bookingCtx.movie.id),
              bookingCtx
            );
            addSystemMessage('theater', spec);
            setUiSpec(spec);
            break;
          }

          case 'date': {
            if (!bookingCtx.movie || !bookingCtx.theater) {
              setError('Missing movie or theater');
              return;
            }
            const data = await api.getDates(bookingCtx.movie.id, bookingCtx.theater.id);
            setBackendData({ dates: data.dates });
            const dateItems = createDateItems(new Date(), 14, data.dates);
            const spec = withBookingContext(
              generateDateSpec(dateItems, bookingCtx.movie.id, bookingCtx.theater.id),
              bookingCtx
            );
            addSystemMessage('date', spec);
            setUiSpec(spec);
            break;
          }

          case 'time': {
            if (!bookingCtx.movie || !bookingCtx.theater || !bookingCtx.date) {
              setError('Missing movie, theater, or date');
              return;
            }
            const data = await api.getTimes(
              bookingCtx.movie.id,
              bookingCtx.theater.id,
              bookingCtx.date
            );
            setShowings(data.showings);
            setBackendData({ showings: data.showings });
            const spec = withBookingContext(
              generateTimeSpec(
                data.showings,
                bookingCtx.movie.id,
                bookingCtx.theater.id,
                bookingCtx.date
              ),
              bookingCtx
            );
            addSystemMessage('time', spec);
            setUiSpec(spec);
            break;
          }

          case 'seat': {
            if (
              !bookingCtx.showing ||
              !bookingCtx.movie ||
              !bookingCtx.theater ||
              !bookingCtx.date
            ) {
              setError('Missing showing information');
              return;
            }
            const data = await api.getSeats(bookingCtx.showing.id);
            setBackendData({ seats: data.seats });
            const spec = withBookingContext(
              generateSeatSpec(
                data.seats,
                bookingCtx.movie.id,
                bookingCtx.theater.id,
                bookingCtx.date,
                bookingCtx.showing.id
              ),
              bookingCtx
            );
            addSystemMessage('seat', spec);
            setUiSpec(spec);
            break;
          }

          case 'ticket': {
            const selectedSeats = bookingCtx.selectedSeats ?? [];
            if (selectedSeats.length === 0) {
              setError('No seats selected');
              return;
            }

            const data = await api.getTicketTypes();
            setTicketTypes(data.ticketTypes);
            setBackendData({ ticketTypes: data.ticketTypes });

            let spec = withBookingContext(
              generateTicketSpec(data.ticketTypes, selectedSeats.map((s) => s.id)),
              bookingCtx
            );

            for (const ticket of bookingCtx.tickets ?? []) {
              spec = setQuantity(spec, ticket.ticketTypeId, ticket.quantity);
            }

            spec = withBookingContext(spec, bookingCtx);
            addSystemMessage('ticket', spec);
            setUiSpec(spec);
            break;
          }

          case 'confirm': {
            if (
              !bookingCtx.movie ||
              !bookingCtx.theater ||
              !bookingCtx.date ||
              !bookingCtx.showing
            ) {
              setError('Missing booking information');
              return;
            }

            const selectedSeats = bookingCtx.selectedSeats ?? [];
            const selectedTickets = bookingCtx.tickets ?? [];
            if (selectedSeats.length === 0 || selectedTickets.length === 0) {
              setError('Missing seats or tickets');
              return;
            }

            const totalPrice = selectedTickets.reduce(
              (sum, ticket) => sum + ticket.price * ticket.quantity,
              0
            );

            const meta: ConfirmMeta = {
              movie: bookingCtx.movie,
              theater: bookingCtx.theater,
              date: bookingCtx.date,
              time: bookingCtx.showing.time,
              seats: selectedSeats.map((seat) => seat.value),
              tickets: selectedTickets.map((ticket) => ({
                type: ticket.name,
                quantity: ticket.quantity,
                price: ticket.price,
              })),
              totalPrice,
            };

            const spec = withBookingContext(generateConfirmSpec(meta), bookingCtx);
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
    [activeSpec, addSystemMessage, setBackendData, setUiSpec]
  );

  useEffect(() => {
    if (!initialized.current) {
      initialized.current = true;
      loadStageData('movie', { booking: {} });
    }
  }, [loadStageData]);

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

      let newSpec = setQuantity(activeSpec, typeId, quantity);
      const bookingCtx = getBookingContext(newSpec);
      const newTickets = buildTicketSelections(newSpec.state.quantities ?? [], ticketTypes);

      newSpec = withBookingContext(newSpec, {
        ...bookingCtx,
        tickets: newTickets,
      });

      updateActiveSpec(newSpec);
      setUiSpec(newSpec);
    },
    [activeSpec, ticketTypes, updateActiveSpec, setUiSpec]
  );

  const handleConfirm = useCallback(async () => {
    if (!activeSpec) return;

    const bookingCtx = getBookingContext(activeSpec);
    const selectedSeats = bookingCtx.selectedSeats ?? [];
    const selectedTickets = bookingCtx.tickets ?? [];

    if (!bookingCtx.showing || selectedSeats.length === 0 || selectedTickets.length === 0) {
      setError('Missing booking information');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const result = await api.createBooking({
        showingId: bookingCtx.showing.id,
        seats: selectedSeats.map((seat) => seat.id),
        tickets: selectedTickets.map((ticket) => ({
          ticketTypeId: ticket.ticketTypeId,
          quantity: ticket.quantity,
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
  }, [activeSpec, addUserMessage]);

  const handleNext = useCallback(async () => {
    if (!activeSpec) return;

    let selectionLabel = '';
    const currentBooking = getBookingContext(activeSpec);
    let nextBooking: BookingContext = currentBooking;

    switch (currentStage) {
      case 'movie': {
        const selectedId = activeSpec.state.selected?.id;
        if (!selectedId) return;

        const selectedMovie = movies.find((movie) => movie.id === selectedId);
        if (!selectedMovie) return;

        selectionLabel = selectedMovie.title;
        nextBooking = {
          movie: { id: selectedMovie.id, title: selectedMovie.title },
          selectedSeats: [],
          tickets: [],
        };
        break;
      }

      case 'theater': {
        const selectedId = activeSpec.state.selected?.id;
        if (!selectedId) return;

        const selectedTheater = theaters.find((theater) => theater.id === selectedId);
        if (!selectedTheater) return;

        selectionLabel = selectedTheater.name;
        nextBooking = {
          ...currentBooking,
          theater: { id: selectedTheater.id, name: selectedTheater.name },
          date: undefined,
          showing: undefined,
          selectedSeats: [],
          tickets: [],
        };
        break;
      }

      case 'date': {
        const selectedDate = activeSpec.state.selected?.id;
        if (!selectedDate) return;

        selectionLabel = selectedDate;
        nextBooking = {
          ...currentBooking,
          date: selectedDate,
          showing: undefined,
          selectedSeats: [],
          tickets: [],
        };
        break;
      }

      case 'time': {
        const selectedId = activeSpec.state.selected?.id;
        if (!selectedId) return;

        const selectedShowing = showings.find((showing) => showing.id === selectedId);
        if (!selectedShowing) return;

        selectionLabel = selectedShowing.time;
        nextBooking = {
          ...currentBooking,
          showing: {
            id: selectedShowing.id,
            time: selectedShowing.time,
          },
          selectedSeats: [],
          tickets: [],
        };
        break;
      }

      case 'seat': {
        const selectedSeats = activeSpec.state.selectedList ?? [];
        if (selectedSeats.length === 0) return;

        selectionLabel = `${selectedSeats.length} seat(s) selected`;
        nextBooking = {
          ...currentBooking,
          selectedSeats,
          tickets: [],
        };
        break;
      }

      case 'ticket': {
        const selectedSeats = currentBooking.selectedSeats ?? [];
        const selectedTickets = currentBooking.tickets ?? [];

        const totalTickets = selectedTickets.reduce((sum, ticket) => sum + ticket.quantity, 0);
        if (selectedSeats.length === 0) {
          setError('No seats selected');
          return;
        }
        if (totalTickets !== selectedSeats.length) {
          setError('Ticket count must match selected seat count');
          return;
        }

        selectionLabel = `${totalTickets} ticket(s)`;
        nextBooking = {
          ...currentBooking,
          tickets: selectedTickets,
        };
        break;
      }

      case 'confirm': {
        await handleConfirm();
        return;
      }
    }

    addUserMessage(currentStage, 'select', selectionLabel);

    const nextStage = getNextStage(currentStage);
    if (nextStage) {
      loadStageData(nextStage, {
        booking: projectBookingForStage(nextStage, nextBooking),
      });
    }
  }, [
    activeSpec,
    currentStage,
    movies,
    theaters,
    showings,
    addUserMessage,
    loadStageData,
    handleConfirm,
  ]);

  const handleBack = useCallback(async () => {
    if (!activeSpec) return;

    const prevStage = getPrevStage(currentStage);
    if (!prevStage) return;

    addUserMessage(currentStage, 'back', 'Back');

    const currentBooking = getBookingContext(activeSpec);
    loadStageData(prevStage, {
      booking: projectBookingForStage(prevStage, currentBooking),
    });
  }, [activeSpec, currentStage, addUserMessage, loadStageData]);

  const handleBookAnother = useCallback(() => {
    resetChat();
    setBooking(null);
    initialized.current = false;
    loadStageData('movie', { booking: {} });
  }, [resetChat, loadStageData]);

  const handleSetSpec = useCallback(
    (newSpec: typeof activeSpec) => {
      if (!newSpec) return;
      updateActiveSpec(newSpec);
      setUiSpec(newSpec);
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

  return (
    <div className="flex flex-col h-screen bg-dark">
      <header className="shrink-0 border-b border-gray-700 bg-dark px-4 py-3">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <h1 className="text-lg font-semibold text-white">Movie Booking</h1>
          <div className="text-sm text-gray-400">
            Step {STAGE_ORDER.indexOf(currentStage) + 1} of {STAGE_ORDER.length}
          </div>
        </div>
      </header>

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

      {loading && (
        <div className="shrink-0 px-4 py-2 text-center text-gray-400 text-sm">Loading...</div>
      )}

      {error && (
        <div className="shrink-0 px-4 py-2 text-center text-primary text-sm">Error: {error}</div>
      )}

      {booking && (
        <div className="shrink-0 px-4 py-4 border-t border-gray-700 bg-dark-light">
          <div className="max-w-3xl mx-auto text-center">
            <div className="text-2xl mb-2">Booking Complete</div>
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

      <ChatInput disabled placeholder="Text input coming soon..." />
    </div>
  );
}
