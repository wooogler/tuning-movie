import {
  useEffect,
  useState,
  useCallback,
  useRef,
  useMemo,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { api } from '../api/client';
import {
  useChatStore,
  getNextStage,
  getPrevStage,
  STAGE_ORDER,
} from '../store/chatStore';
import { useDevTools, type ToolApplyContext } from '../components/devToolsContextShared';
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
import { useToolHandler, useAgentBridge } from '../hooks';
import { agentTools, type ToolDefinition } from '../agent/tools';
import type { Movie, Theater, Showing, TicketType, Booking } from '../types';
import { getFixedCurrentDate } from '../utils/studyDate';

interface StageContext {
  booking?: BookingContext;
}

type ViewMode = 'chat' | 'carousel';
type Theme = 'dark' | 'light';

interface ChatPageProps {
  theme: Theme;
  onThemeToggle: () => void;
}

const stageInteractionTools: Record<Stage, string[]> = {
  movie: ['select'],
  theater: ['select', 'prev'],
  date: ['select', 'prev'],
  time: ['select', 'prev'],
  seat: ['select', 'prev'],
  ticket: ['setQuantity', 'prev'],
  confirm: ['prev'],
};
const DEFAULT_CHAT_WIDTH_PX = 768;
const MIN_CHAT_WIDTH_PX = 360;
const CHAT_WIDTH_VIEWPORT_PADDING_PX = 48;
const guiAdaptationTools = ['filter', 'sort', 'highlight', 'augment', 'clearModification'] as const;

function canUseNextTool(spec: UISpec): boolean {
  switch (spec.stage) {
    case 'movie':
    case 'theater':
    case 'date':
    case 'time':
      return Boolean(spec.state.selected?.id);
    case 'seat':
      return (spec.state.selectedList?.length ?? 0) > 0;
    case 'ticket': {
      const maxTotal = typeof spec.meta?.maxTotal === 'number' ? spec.meta.maxTotal : 0;
      const currentTotal = (spec.state.quantities ?? []).reduce((sum, quantity) => sum + quantity.count, 0);
      return maxTotal > 0 && currentTotal === maxTotal;
    }
    case 'confirm':
      return true;
    default:
      return false;
  }
}

function buildToolSchemaForStage(
  spec: UISpec | null,
  fallbackStage: Stage,
  guiAdaptationEnabled: boolean
): ToolDefinition[] {
  if (!spec) {
    return agentTools.filter((tool) => tool.name === 'postMessage');
  }

  const stage = spec.stage ?? fallbackStage;
  const allowed = new Set<string>([
    ...(stageInteractionTools[stage] ?? ['postMessage']),
    'postMessage',
  ]);

  if (guiAdaptationEnabled) {
    for (const toolName of guiAdaptationTools) {
      allowed.add(toolName);
    }
  }

  if (!spec.visibleItems.some((item) => !item.isDisabled)) {
    allowed.delete('select');
  }

  if (canUseNextTool(spec)) {
    allowed.add('next');
  } else {
    allowed.delete('next');
  }

  return agentTools.filter((tool) => allowed.has(tool.name));
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

export function ChatPage({ theme, onThemeToggle }: ChatPageProps) {
  const messages = useChatStore((s) => s.messages);
  const currentStage = useChatStore((s) => s.currentStage);
  const activeSpec = useChatStore((s) => s.activeSpec);
  const addSystemMessage = useChatStore((s) => s.addSystemMessage);
  const addUserMessage = useChatStore((s) => s.addUserMessage);
  const addAgentMessage = useChatStore((s) => s.addAgentMessage);
  const annotateLastAgentMessage = useChatStore((s) => s.annotateLastAgentMessage);
  const updateActiveSpec = useChatStore((s) => s.updateActiveSpec);
  const resetChat = useChatStore((s) => s.reset);

  const { setBackendData, setUiSpec, onToolApply } = useDevTools();

  const [movies, setMovies] = useState<Movie[]>([]);
  const [theaters, setTheaters] = useState<Theater[]>([]);
  const [showings, setShowings] = useState<Showing[]>([]);
  const [ticketTypes, setTicketTypes] = useState<TicketType[]>([]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [booking, setBooking] = useState<Booking | null>(null);
  const [viewMode] = useState<ViewMode>('chat');
  const [agentBridgeEnabled, setAgentBridgeEnabled] = useState(true);
  const [plannerCpMemoryLimit, setPlannerCpMemoryLimit] = useState(10);
  const [agentModel, setAgentModel] = useState<'openai' | 'gemini'>('openai');
  const [guiAdaptationEnabled, setGuiAdaptationEnabled] = useState(true);
  const [modelPickerOpen, setModelPickerOpen] = useState(false);
  const [carouselOffset, setCarouselOffset] = useState(0);
  const [carouselOpacity, setCarouselOpacity] = useState(1);
  const [chatWidthPx, setChatWidthPx] = useState(DEFAULT_CHAT_WIDTH_PX);
  const [isResizingChatWidth, setIsResizingChatWidth] = useState(false);

  const initialized = useRef(false);
  const previousStageRef = useRef<Stage>(currentStage);
  const chatResizeSessionRef = useRef<{ startX: number; startWidth: number } | null>(null);
  const pendingAgentToggleResetReasonRef = useRef<string | null>(null);

  const getMaxChatWidth = useCallback(() => {
    if (typeof window === 'undefined') return DEFAULT_CHAT_WIDTH_PX;
    return Math.max(
      MIN_CHAT_WIDTH_PX,
      window.innerWidth - CHAT_WIDTH_VIEWPORT_PADDING_PX
    );
  }, []);

  const clampChatWidth = useCallback(
    (width: number) =>
      Math.min(Math.max(width, MIN_CHAT_WIDTH_PX), getMaxChatWidth()),
    [getMaxChatWidth]
  );

  const stopChatWidthResize = useCallback(() => {
    chatResizeSessionRef.current = null;
    setIsResizingChatWidth(false);
    if (typeof document !== 'undefined') {
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    }
  }, []);

  const handleChatWidthResizeMove = useCallback(
    (event: PointerEvent) => {
      const session = chatResizeSessionRef.current;
      if (!session) return;
      const nextWidth = session.startWidth + (event.clientX - session.startX);
      setChatWidthPx(clampChatWidth(nextWidth));
    },
    [clampChatWidth]
  );

  const handleChatWidthResizeStart = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>) => {
      if (event.button !== 0) return;
      event.preventDefault();
      chatResizeSessionRef.current = {
        startX: event.clientX,
        startWidth: chatWidthPx,
      };
      setIsResizingChatWidth(true);
      if (typeof document !== 'undefined') {
        document.body.style.cursor = 'ew-resize';
        document.body.style.userSelect = 'none';
      }
    },
    [chatWidthPx]
  );

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
            const dateItems = createDateItems(getFixedCurrentDate(), 14, data.dates);
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

  useEffect(() => {
    api.getAgentModel().then((res) => setAgentModel(res.model)).catch(() => {});
  }, []);

  useEffect(() => {
    api.getGuiAdaptationConfig().then((res) => setGuiAdaptationEnabled(res.enabled)).catch(() => {});
  }, []);

  const handleModelToggle = useCallback((model: 'openai' | 'gemini') => {
    setAgentModel(model);
    setModelPickerOpen(false);
    api.setAgentModel(model).catch(() => {});
  }, []);

  const handleGuiAdaptationToggle = useCallback(() => {
    const nextEnabled = !guiAdaptationEnabled;
    setGuiAdaptationEnabled(nextEnabled);
    api.setGuiAdaptationConfig(nextEnabled).catch(() => {
      setGuiAdaptationEnabled(!nextEnabled);
    });
  }, [guiAdaptationEnabled]);

  useEffect(() => {
    const handleWindowResize = () => {
      setChatWidthPx((current) => clampChatWidth(current));
    };
    handleWindowResize();
    window.addEventListener('resize', handleWindowResize);
    return () => {
      window.removeEventListener('resize', handleWindowResize);
    };
  }, [clampChatWidth]);

  useEffect(() => {
    if (!isResizingChatWidth) return;
    const handlePointerUp = () => {
      stopChatWidthResize();
    };
    window.addEventListener('pointermove', handleChatWidthResizeMove);
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerUp);
    return () => {
      window.removeEventListener('pointermove', handleChatWidthResizeMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerUp);
    };
  }, [isResizingChatWidth, handleChatWidthResizeMove, stopChatWidthResize]);

  useEffect(
    () => () => {
      if (typeof document !== 'undefined') {
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      }
    },
    []
  );

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

  const handleConfirm = useCallback(async (context?: ToolApplyContext) => {
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
      if (!context) {
        addUserMessage('confirm', 'select', 'Booking Confirmed!');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Booking failed');
    } finally {
      setLoading(false);
    }
  }, [activeSpec, addUserMessage]);

  const handleNext = useCallback(async (context?: ToolApplyContext) => {
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
        await handleConfirm(context);
        return;
      }
    }

    if (!context) {
      addUserMessage(currentStage, 'select', selectionLabel);
    }

    const nextStage = getNextStage(currentStage);
    if (nextStage) {
      const source: 'agent' | 'devtools' =
        context?.source === 'devtools' ? 'devtools' : 'agent';
      const transitionReason =
        typeof context?.reason === 'string' && context.reason.trim()
          ? context.reason.trim()
          : 'Move to the next stage because the current step is ready.';
      if (context) {
        annotateLastAgentMessage(currentStage, {
          toolName: 'next',
          source,
          reason: transitionReason,
        });
      }
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
    annotateLastAgentMessage,
    loadStageData,
    handleConfirm,
  ]);

  const handleBack = useCallback(async (context?: ToolApplyContext) => {
    if (!activeSpec) return;

    const prevStage = getPrevStage(currentStage);
    if (!prevStage) return;

    if (!context) {
      addUserMessage(currentStage, 'back', 'Back');
    }

    const currentBooking = getBookingContext(activeSpec);
    const source: 'agent' | 'devtools' = context?.source === 'devtools' ? 'devtools' : 'agent';
    const transitionReason =
      typeof context?.reason === 'string' && context.reason.trim()
        ? context.reason.trim()
        : 'Return to the previous stage to update an earlier choice.';
    if (context) {
      annotateLastAgentMessage(currentStage, {
        toolName: 'prev',
        source,
        reason: transitionReason,
      });
    }
    loadStageData(prevStage, {
      booking: projectBookingForStage(prevStage, currentBooking),
    });
  }, [activeSpec, currentStage, addUserMessage, annotateLastAgentMessage, loadStageData]);

  const handleBookAnotherLocal = useCallback(() => {
    resetChat();
    setBooking(null);
    setError(null);
    initialized.current = true;
    if (movies.length > 0) {
      const spec = withBookingContext(generateMovieSpec(movies), {});
      addSystemMessage('movie', spec);
      setUiSpec(spec);
      return;
    }
    loadStageData('movie', { booking: {} });
  }, [resetChat, movies, addSystemMessage, setUiSpec, loadStageData]);

  const handleSetSpec = useCallback(
    (
      newSpec: typeof activeSpec,
      options?: {
        appendAsSystemMessage?: boolean;
        modificationMeta?: {
          toolName: string;
          reason: string;
          source: 'agent' | 'devtools';
        };
      }
    ) => {
      if (!newSpec) return;
      if (options?.appendAsSystemMessage) {
        addSystemMessage(newSpec.stage, newSpec, options.modificationMeta
          ? {
              kind: 'tool-modification',
              ...options.modificationMeta,
            }
          : undefined);
      } else {
        updateActiveSpec(newSpec);
      }
      setUiSpec(newSpec);
    },
    [addSystemMessage, updateActiveSpec, setUiSpec]
  );

  useToolHandler({
    spec: activeSpec,
    setSpec: handleSetSpec,
    onNext: handleNext,
    onBack: handleBack,
    onPostMessage: (text: string) => {
      const stage = activeSpec?.stage ?? currentStage;
      addAgentMessage(stage, text);
    },
    multiSelect: currentStage === 'seat',
  });

  const handleSessionReset = useCallback(() => {
    resetChat();
    setBooking(null);
    setError(null);
    initialized.current = true;
    if (movies.length > 0) {
      const spec = withBookingContext(generateMovieSpec(movies), {});
      addSystemMessage('movie', spec);
      setUiSpec(spec);
      return;
    }
    loadStageData('movie', { booking: {} });
  }, [resetChat, movies, addSystemMessage, setUiSpec, loadStageData]);

  const agentToolSchema = useMemo(
    () => buildToolSchemaForStage(activeSpec, currentStage, guiAdaptationEnabled),
    [activeSpec, currentStage, guiAdaptationEnabled]
  );

  const {
    sendUserMessageToAgent,
    sendSessionResetToAgent,
    isConnected: isAgentBridgeConnected,
    isJoined: isAgentBridgeJoined,
    joinedSessionId: agentSessionId,
    connectedAgents,
  } = useAgentBridge({
    uiSpec: activeSpec,
    messageHistory: messages,
    toolSchema: agentToolSchema,
    plannerCpMemoryLimit,
    enabled: agentBridgeEnabled,
    onToolCall: onToolApply,
    onAgentMessage: (text: string) => {
      const stage = activeSpec?.stage ?? currentStage;
      addAgentMessage(stage, text);
    },
    onSessionEnd: handleSessionReset,
  });

  const handleManualReset = useCallback(() => {
    if (loading) return;
    const confirmed = window.confirm('Reset the current chat and booking progress?');
    if (!confirmed) return;
    sendSessionResetToAgent('host-manual-reset');
    handleSessionReset();
  }, [handleSessionReset, loading, sendSessionResetToAgent]);

  const handleBookAnother = useCallback(() => {
    sendSessionResetToAgent('host-book-another');
    handleBookAnotherLocal();
  }, [sendSessionResetToAgent, handleBookAnotherLocal]);

  const handleAgentBridgeToggle = useCallback(() => {
    setModelPickerOpen(false);

    const nextEnabled = !agentBridgeEnabled;
    if (agentBridgeEnabled) {
      pendingAgentToggleResetReasonRef.current = null;
      sendSessionResetToAgent('host-agent-toggle-off');
    } else {
      pendingAgentToggleResetReasonRef.current = 'host-agent-toggle-on';
    }

    setAgentBridgeEnabled(nextEnabled);
    handleSessionReset();
  }, [agentBridgeEnabled, handleSessionReset, sendSessionResetToAgent]);

  const handleChatInputSubmit = useCallback(
    (text: string) => {
      if (!agentBridgeEnabled) return;
      addUserMessage(currentStage, 'input', text);
      sendUserMessageToAgent(text, currentStage);
    },
    [addUserMessage, agentBridgeEnabled, currentStage, sendUserMessageToAgent]
  );

  const currentStep = STAGE_ORDER.indexOf(currentStage) + 1;
  const previousStage = getPrevStage(currentStage);
  const nextStage = getNextStage(currentStage);
  const hasConnectedAgent = connectedAgents.length > 0;
  const connectedAgentNames = connectedAgents.map((agent) => agent.name).join(', ');

  useEffect(() => {
    const pendingReason = pendingAgentToggleResetReasonRef.current;
    if (!pendingReason) return;
    if (!agentBridgeEnabled || !isAgentBridgeConnected || !isAgentBridgeJoined || !hasConnectedAgent) {
      return;
    }

    sendSessionResetToAgent(pendingReason);
    pendingAgentToggleResetReasonRef.current = null;
  }, [
    agentBridgeEnabled,
    hasConnectedAgent,
    isAgentBridgeConnected,
    isAgentBridgeJoined,
    sendSessionResetToAgent,
  ]);

  const inputDisabled = !agentBridgeEnabled || !isAgentBridgeConnected || !isAgentBridgeJoined || !hasConnectedAgent;
  const inputStatusLabel = !agentBridgeEnabled
    ? 'Agent connection is off'
    : !isAgentBridgeConnected
    ? 'Relay disconnected'
    : !isAgentBridgeJoined
    ? 'Joining agent session...'
    : !hasConnectedAgent
    ? 'No external agent connected'
    : 'External agent connected';
  const inputStatusTone: 'default' | 'warning' | 'success' = !agentBridgeEnabled ||
    !isAgentBridgeConnected ||
    !isAgentBridgeJoined ||
    !hasConnectedAgent
    ? 'warning'
    : 'success';
  const inputStatusDetail = !agentBridgeEnabled
    ? 'Toggle Agent ON to reconnect.'
    : isAgentBridgeJoined
    ? `session: ${agentSessionId ?? 'unknown'}${
        hasConnectedAgent ? ` · agent: ${connectedAgentNames}` : ''
      }`
    : undefined;

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
      <header className="shrink-0 border-b border-dark-border bg-dark px-4 py-3">
        <div className="max-w-5xl mx-auto flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-lg font-semibold text-fg-strong">Movie Booking</h1>
          <div className="flex flex-wrap items-center justify-end gap-2 sm:gap-3">
            <div className="text-sm text-fg-muted">
              Step {currentStep} of {STAGE_ORDER.length}
            </div>
            <button
              type="button"
              onClick={onThemeToggle}
              className={`px-3 py-1 text-xs rounded border transition-colors ${
                theme === 'dark'
                  ? 'border-amber-300/60 bg-amber-100/10 text-amber-200 hover:border-amber-200 hover:text-amber-100'
                  : 'border-sky-500/45 bg-sky-500/10 text-sky-700 hover:border-sky-500 hover:text-sky-800'
              }`}
            >
              {theme === 'dark' ? 'Bright Mode' : 'Dark Mode'}
            </button>
            <button
              type="button"
              onClick={handleAgentBridgeToggle}
              className={`px-3 py-1 text-xs rounded border ${
                agentBridgeEnabled
                  ? 'border-info-border text-info-label hover:border-info-label hover:text-info-text'
                  : 'border-primary/40 text-primary/80 hover:border-primary hover:text-primary'
              }`}
            >
              Agent {agentBridgeEnabled ? 'ON' : 'OFF'}
            </button>
            <button
              type="button"
              onClick={handleGuiAdaptationToggle}
              className={`px-3 py-1 text-xs rounded border ${
                guiAdaptationEnabled
                  ? 'border-info-border text-info-label hover:border-info-label hover:text-info-text'
                  : 'border-info-border/60 text-info-label/70 hover:border-info-border hover:text-info-label'
              }`}
            >
              GUI Adaptation {guiAdaptationEnabled ? 'ON' : 'OFF'}
            </button>
            <label
              className={`flex items-center gap-2 px-3 py-1 text-xs rounded border ${
                agentBridgeEnabled
                  ? 'border-info-border text-info-label'
                  : 'border-info-border/50 text-info-label/60'
              }`}
            >
              <span>CP Memory</span>
              <input
                type="number"
                min={0}
                step={1}
                value={plannerCpMemoryLimit}
                disabled={!agentBridgeEnabled}
                onChange={(event) => {
                  const parsed = Number.parseInt(event.target.value, 10);
                  if (!Number.isFinite(parsed)) {
                    setPlannerCpMemoryLimit(0);
                    return;
                  }
                  setPlannerCpMemoryLimit(Math.max(0, parsed));
                }}
                className="w-16 rounded border border-info-border bg-dark px-2 py-0.5 text-xs text-info-text disabled:cursor-not-allowed disabled:opacity-60"
                title="0 disables CP memory injection. N injects the latest N memory items per list."
              />
            </label>
            {agentBridgeEnabled && (
              <div className="relative flex">
                <button
                  type="button"
                  onClick={() => setModelPickerOpen((prev) => !prev)}
                  className="px-3 py-1 text-xs rounded border border-info-border text-info-label hover:border-info-label hover:text-info-text transition-colors"
                >
                  {agentModel === 'openai' ? 'gpt-5.2' : 'gemini-2.5-flash'}
                </button>
                {modelPickerOpen && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setModelPickerOpen(false)} />
                    <div className="absolute left-0 top-full z-20 mt-1 flex flex-col gap-1">
                      {([['openai', 'gpt-5.2'], ['gemini', 'gemini-2.5-flash']] as const).map(([id, label]) => (
                        <button
                          key={id}
                          type="button"
                          onClick={() => handleModelToggle(id)}
                          className={`px-3 py-1 text-xs rounded border whitespace-nowrap transition-colors ${
                            agentModel === id
                              ? 'border-info-label text-info-text bg-info-bg'
                              : 'border-info-border text-info-label bg-dark hover:border-info-label hover:text-info-text'
                          }`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}
            <button
              type="button"
              onClick={handleManualReset}
              disabled={loading}
              className="px-3 py-1 text-xs rounded border border-dark-border text-fg hover:text-fg-strong hover:border-primary disabled:cursor-not-allowed disabled:opacity-50"
            >
              Reset
            </button>
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
          chatWidthPx={chatWidthPx}
          isResizingWidth={isResizingChatWidth}
          onResizeStart={handleChatWidthResizeStart}
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
                        ? 'bg-primary text-primary-fg font-semibold'
                        : isPassed
                        ? 'bg-dark-light text-fg'
                        : 'bg-dark-border text-fg-faint'
                    }`}
                  >
                    {stage}
                  </span>
                );
              })}
            </div>

            <div className="relative h-[680px] overflow-hidden rounded-3xl border border-dark-border bg-dark-light/60">
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
                  <div className="h-full overflow-hidden rounded-2xl border border-dark-border bg-dark-light pointer-events-none">
                    <div className="px-4 pt-4 text-center text-xs uppercase tracking-[0.12em] text-fg-muted">
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
                      <div className="px-4 py-10 text-center text-sm text-fg-faint">No previous stage</div>
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
                      <div className="py-8 text-center text-fg-muted">Loading...</div>
                    )}
                  </div>

                  <div className="h-full overflow-hidden rounded-2xl border border-dark-border bg-dark-light pointer-events-none">
                    <div className="px-4 pt-4 text-center text-xs uppercase tracking-[0.12em] text-fg-muted">
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
                      <div className="px-4 py-10 text-center text-sm text-fg-faint">No next stage yet</div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {loading && (
        <div className="shrink-0 px-4 py-2 text-center text-fg-muted text-sm">Loading...</div>
      )}

      {error && (
        <div className="shrink-0 px-4 py-2 text-center text-primary text-sm">Error: {error}</div>
      )}

      {booking && (
        <div className="shrink-0 px-4 py-4 border-t border-dark-border bg-dark-light">
          <div className="max-w-3xl mx-auto text-center">
            <div className="text-2xl mb-2">Booking Complete</div>
            <p className="text-fg-strong font-medium">Booking Confirmed!</p>
            <p className="text-fg-muted text-sm mb-3">Booking ID: {booking.id}</p>
            <button
              onClick={handleBookAnother}
              className="px-4 py-2 bg-primary text-primary-fg rounded-lg hover:bg-primary/80"
            >
              Book Another
            </button>
          </div>
        </div>
      )}

      {agentBridgeEnabled && (
        <ChatInput
          chatWidthPx={chatWidthPx}
          disabled={inputDisabled}
          onSubmit={handleChatInputSubmit}
          statusLabel={inputStatusLabel}
          statusDetail={inputStatusDetail}
          statusTone={inputStatusTone}
          placeholder={
            !isAgentBridgeConnected
              ? 'Waiting for agent relay connection...'
              : !isAgentBridgeJoined
              ? 'Joining agent session...'
              : !hasConnectedAgent
              ? 'Waiting for an external agent to connect...'
              : viewMode === 'chat'
              ? 'Send a message to the external agent...'
              : 'Carousel mode: input is available here as well'
          }
        />
      )}
    </div>
  );
}
