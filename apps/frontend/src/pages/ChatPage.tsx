import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
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
import { StageRenderer } from '../renderer';
import { useToolHandler } from '../hooks';
import type { Movie, Theater, Showing, TicketType, Booking } from '../types';

interface StageContext {
  booking?: BookingContext;
}

type ViewMode = 'chat' | 'carousel';

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
  const [viewMode, setViewMode] = useState<ViewMode>('chat');
  const [carouselOffset, setCarouselOffset] = useState(0);
  const [carouselOpacity, setCarouselOpacity] = useState(1);

  const initialized = useRef(false);
  const previousStageRef = useRef<Stage>(currentStage);

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

  const currentStep = STAGE_ORDER.indexOf(currentStage) + 1;
  const previousStage = getPrevStage(currentStage);
  const nextStage = getNextStage(currentStage);

  const stageSpecMap = useMemo(() => {
    const map = new Map<Stage, UISpec>();
    for (const message of messages) {
      if (message.type === 'system') {
        map.set(message.stage, message.spec);
      }
    }
    if (activeSpec) {
      map.set(currentStage, activeSpec);
    }
    return map;
  }, [messages, activeSpec, currentStage]);

  const previousSpec = previousStage ? stageSpecMap.get(previousStage) ?? null : null;
  const nextSpec = nextStage ? stageSpecMap.get(nextStage) ?? null : null;

  useEffect(() => {
    if (viewMode !== 'carousel') {
      previousStageRef.current = currentStage;
      return;
    }

    const prevStage = previousStageRef.current;
    if (prevStage === currentStage) return;

    const prevIndex = STAGE_ORDER.indexOf(prevStage);
    const currentIndex = STAGE_ORDER.indexOf(currentStage);
    const direction = currentIndex >= prevIndex ? 1 : -1;

    setCarouselOffset(direction * 120);
    setCarouselOpacity(0.86);

    let raf1 = 0;
    let raf2 = 0;
    raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => {
        setCarouselOffset(0);
        setCarouselOpacity(1);
      });
    });

    previousStageRef.current = currentStage;
    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
    };
  }, [currentStage, viewMode]);

  const carouselTransition =
    'transform 860ms cubic-bezier(0.22, 1, 0.36, 1), opacity 760ms cubic-bezier(0.22, 1, 0.36, 1)';

  return (
    <div className="flex flex-col h-screen bg-dark">
      <header className="shrink-0 border-b border-gray-700 bg-dark px-4 py-3">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <h1 className="text-lg font-semibold text-white">Movie Booking</h1>
          <div className="flex items-center gap-3">
            <div className="text-sm text-gray-400">
              Step {currentStep} of {STAGE_ORDER.length}
            </div>
            <div className="flex items-center rounded-lg border border-gray-700 bg-dark-light p-1">
              <button
                type="button"
                onClick={() => setViewMode('chat')}
                className={`px-2 py-1 text-xs rounded ${
                  viewMode === 'chat'
                    ? 'bg-primary text-dark font-semibold'
                    : 'text-gray-300 hover:text-white'
                }`}
              >
                Chat
              </button>
              <button
                type="button"
                onClick={() => setViewMode('carousel')}
                className={`px-2 py-1 text-xs rounded ${
                  viewMode === 'carousel'
                    ? 'bg-primary text-dark font-semibold'
                    : 'text-gray-300 hover:text-white'
                }`}
              >
                Carousel
              </button>
            </div>
          </div>
        </div>
      </header>

      {viewMode === 'chat' ? (
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
      ) : (
        <div className="flex-1 overflow-y-auto px-4 py-4">
          <div className="max-w-7xl mx-auto space-y-4">
            <div className="flex flex-wrap justify-center gap-2">
              {STAGE_ORDER.map((stage, index) => {
                const isCurrent = stage === currentStage;
                const isPassed = index < currentStep - 1;
                return (
                  <span
                    key={stage}
                    className={`px-2 py-1 rounded text-xs capitalize ${
                      isCurrent
                        ? 'bg-primary text-dark font-semibold'
                        : isPassed
                        ? 'bg-dark-light text-gray-200'
                        : 'bg-dark-border text-gray-500'
                    }`}
                  >
                    {stage}
                  </span>
                );
              })}
            </div>

            <div className="relative h-[680px] overflow-hidden rounded-3xl border border-gray-700 bg-dark-light/60">
              <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-24 bg-gradient-to-r from-dark-light/95 to-transparent" />
              <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-24 bg-gradient-to-l from-dark-light/95 to-transparent" />

              <div className="h-full w-full p-5">
                <div
                  className="grid h-full grid-cols-3 gap-5"
                  style={{
                    transform: `translateX(${carouselOffset}px)`,
                    opacity: carouselOpacity,
                    transition: carouselTransition,
                  }}
                >
                  <div className="h-full overflow-hidden rounded-2xl border border-gray-700 bg-dark-light pointer-events-none">
                    <div className="px-4 pt-4 text-center text-xs uppercase tracking-[0.12em] text-gray-400">
                      {previousStage ? `Previous · ${previousStage}` : 'Previous'}
                    </div>
                    {previousSpec ? (
                      <div className="h-full overflow-y-auto px-4 pb-5 pt-3 opacity-75">
                        <StageRenderer
                          spec={previousSpec}
                          onSelect={() => {}}
                          onToggle={() => {}}
                          onQuantityChange={() => {}}
                          onNext={() => {}}
                          onBack={() => {}}
                          onConfirm={() => {}}
                        />
                      </div>
                    ) : (
                      <div className="px-4 py-10 text-center text-sm text-gray-500">No previous stage</div>
                    )}
                  </div>

                  <div className="h-full overflow-hidden rounded-2xl border border-primary/45 bg-dark-light">
                    <div className="px-4 pt-4 text-center text-xs uppercase tracking-[0.12em] text-primary">
                      Current · {currentStage}
                    </div>
                    {activeSpec ? (
                      <div className="h-full overflow-y-auto px-4 pb-5 pt-3">
                        <StageRenderer
                          spec={activeSpec}
                          onSelect={handleSelect}
                          onToggle={handleToggle}
                          onQuantityChange={handleQuantityChange}
                          onNext={handleNext}
                          onBack={handleBack}
                          onConfirm={handleConfirm}
                        />
                      </div>
                    ) : (
                      <div className="py-8 text-center text-gray-400">Loading...</div>
                    )}
                  </div>

                  <div className="h-full overflow-hidden rounded-2xl border border-gray-700 bg-dark-light pointer-events-none">
                    <div className="px-4 pt-4 text-center text-xs uppercase tracking-[0.12em] text-gray-400">
                      {nextStage ? `Next · ${nextStage}` : 'Next'}
                    </div>
                    {nextSpec ? (
                      <div className="h-full overflow-y-auto px-4 pb-5 pt-3 opacity-75">
                        <StageRenderer
                          spec={nextSpec}
                          onSelect={() => {}}
                          onToggle={() => {}}
                          onQuantityChange={() => {}}
                          onNext={() => {}}
                          onBack={() => {}}
                          onConfirm={() => {}}
                        />
                      </div>
                    ) : (
                      <div className="px-4 py-10 text-center text-sm text-gray-500">No next stage yet</div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

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

      <ChatInput
        disabled
        placeholder={
          viewMode === 'chat'
            ? 'Text input coming soon...'
            : 'Carousel mode: input is available here as well'
        }
      />
    </div>
  );
}
