import {
  useEffect,
  useState,
  useCallback,
  useRef,
  useMemo,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { useNavigate } from 'react-router-dom';
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
  generateConfirmSpec,
  createDateItems,
  selectItem,
  toggleItem,
  type ConfirmMeta,
  type BookingContext,
  type UISpec,
  type Stage,
} from '../spec';
import { MessageList, ChatInput } from '../components/chat';
import { ScenarioBriefing } from '../components/scenario/ScenarioBriefing';
import { StageRenderer } from '../renderer';
import { useToolHandler, useAgentBridge } from '../hooks';
import { agentTools, type ToolDefinition } from '../agent/tools';
import { getStudyModeConfig, type StudyModeId } from './studyOptions';
import type { Movie, Theater, Showing, Booking } from '../types';
import { getFixedCurrentDate } from '../utils/studyDate';
import type { StudySessionState } from '../study/sessionStorage';

interface StageContext {
  booking?: BookingContext;
}

type ViewMode = 'chat' | 'carousel';
type Theme = 'dark' | 'light';
type AgentModel = 'openai' | 'gemini';

interface ChatPageProps {
  theme: Theme;
  onThemeToggle: () => void;
  studyModePreset?: StudyModeId;
  studySession?: StudySessionState | null;
}

const stageInteractionTools: Record<Stage, string[]> = {
  movie: ['select'],
  theater: ['select', 'prev', 'startOver'],
  date: ['select', 'prev', 'startOver'],
  time: ['select', 'prev', 'startOver'],
  seat: ['select', 'prev', 'startOver'],
  confirm: ['prev', 'startOver'],
};
const DEFAULT_CHAT_WIDTH_PX = 768;
const MIN_CHAT_WIDTH_PX = 360;
const CHAT_WIDTH_VIEWPORT_PADDING_PX = 48;
const DEFAULT_SCENARIO_PANEL_WIDTH_PX = 620;
const MIN_SCENARIO_PANEL_WIDTH_PX = 280;
const MAX_SCENARIO_PANEL_WIDTH_PX = 620;
const MIN_MAIN_CONTENT_WIDTH_PX = 700;
const guiAdaptationToolsByStage: Record<Stage, readonly string[]> = {
  movie: ['filter', 'sort', 'highlight', 'augment', 'clearModification'],
  theater: ['filter', 'sort', 'highlight', 'augment', 'clearModification'],
  date: ['highlight', 'clearModification'],
  time: ['filter', 'sort', 'highlight', 'augment', 'clearModification'],
  seat: ['highlight', 'clearModification'],
  confirm: [],
};
const baselineAutoAdvanceStages = new Set<Stage>(['movie', 'theater', 'date', 'time']);
const AGENT_BRIDGE_ENABLED_STORAGE_KEY = 'tuning-movie-agent-bridge-enabled';
const PLANNER_CP_MEMORY_LIMIT_STORAGE_KEY = 'tuning-movie-planner-cp-memory-limit';
const AGENT_MODEL_STORAGE_KEY = 'tuning-movie-agent-model';
const GUI_ADAPTATION_ENABLED_STORAGE_KEY = 'tuning-movie-gui-adaptation-enabled';
const SHOW_STUDY_CONTROL_BUTTONS = !import.meta.env.PROD;

function readStorageValue(key: string): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorageValue(key: string, value: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Ignore storage write failures (private mode/quota)
  }
}

function readStoredBoolean(key: string, fallback: boolean): boolean {
  const stored = readStorageValue(key);
  if (stored === 'true') return true;
  if (stored === 'false') return false;
  return fallback;
}

function readStoredNonNegativeInt(key: string, fallback: number): number {
  const stored = readStorageValue(key);
  if (stored === null) return fallback;
  const parsed = Number.parseInt(stored, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, parsed);
}

function readStoredAgentModel(key: string, fallback: AgentModel): AgentModel {
  const stored = readStorageValue(key);
  return stored === 'openai' || stored === 'gemini' ? stored : fallback;
}

function canUseNextTool(spec: UISpec): boolean {
  switch (spec.stage) {
    case 'movie':
    case 'theater':
    case 'date':
    case 'time':
      return Boolean(spec.state.selected?.id);
    case 'seat':
      return (spec.state.selectedList?.length ?? 0) > 0;
    case 'confirm':
      return true;
    default:
      return false;
  }
}

function buildToolSchemaForStage(
  spec: UISpec | null,
  fallbackStage: Stage,
  guiAdaptationEnabled: boolean,
  studyModePreset?: StudyModeId
): ToolDefinition[] {
  const isBaselineMode = studyModePreset === 'baseline';
  if (!spec) {
    return agentTools.filter((tool) => (isBaselineMode ? tool.name === 'repeatStep' : tool.name === 'postMessage'));
  }

  const stage = spec.stage ?? fallbackStage;
  const allowed = new Set<string>(stageInteractionTools[stage] ?? ['postMessage']);
  if (stage === 'seat') {
    allowed.add('selectMultiple');
  }
  if (isBaselineMode) {
    allowed.add('repeatStep');
  } else {
    allowed.add('postMessage');
  }

  if (guiAdaptationEnabled) {
    for (const toolName of guiAdaptationToolsByStage[stage] ?? []) {
      allowed.add(toolName);
    }
  }

  if (!spec.visibleItems.some((item) => !item.isDisabled)) {
    allowed.delete('select');
    allowed.delete('selectMultiple');
  }

  if (canUseNextTool(spec)) {
    if (!(isBaselineMode && baselineAutoAdvanceStages.has(stage))) {
      allowed.add('next');
    }
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
    case 'confirm':
      return {
        movie: booking.movie,
        theater: booking.theater,
        date: booking.date,
        showing: booking.showing,
        selectedSeats: booking.selectedSeats,
      };
    default:
      return {};
  }
}

export function ChatPage({
  theme,
  onThemeToggle,
  studyModePreset,
  studySession,
}: ChatPageProps) {
  const navigate = useNavigate();

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

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [booking, setBooking] = useState<Booking | null>(null);
  const [viewMode] = useState<ViewMode>('chat');
  const [agentBridgeEnabled, setAgentBridgeEnabled] = useState<boolean>(() =>
    readStoredBoolean(AGENT_BRIDGE_ENABLED_STORAGE_KEY, false)
  );
  const [plannerCpMemoryLimit, setPlannerCpMemoryLimit] = useState<number>(() =>
    readStoredNonNegativeInt(PLANNER_CP_MEMORY_LIMIT_STORAGE_KEY, 10)
  );
  const [agentModel, setAgentModel] = useState<AgentModel>(() =>
    readStoredAgentModel(AGENT_MODEL_STORAGE_KEY, 'openai')
  );
  const [guiAdaptationEnabled, setGuiAdaptationEnabled] = useState<boolean>(() =>
    readStoredBoolean(GUI_ADAPTATION_ENABLED_STORAGE_KEY, true)
  );
  const [modelPickerOpen, setModelPickerOpen] = useState(false);
  const [carouselOffset, setCarouselOffset] = useState(0);
  const [carouselOpacity, setCarouselOpacity] = useState(1);
  const [chatWidthPx, setChatWidthPx] = useState(DEFAULT_CHAT_WIDTH_PX);
  const [isResizingChatWidth, setIsResizingChatWidth] = useState(false);
  const [scenarioPanelWidthPx, setScenarioPanelWidthPx] = useState(
    DEFAULT_SCENARIO_PANEL_WIDTH_PX
  );
  const [isResizingScenarioPanelWidth, setIsResizingScenarioPanelWidth] = useState(false);
  const [awaitingAgentResponse, setAwaitingAgentResponse] = useState(false);

  const initialized = useRef(false);
  const appliedStudyModePresetRef = useRef<StudyModeId | null>(null);
  const previousStageRef = useRef<Stage>(currentStage);
  const chatResizeSessionRef = useRef<{ startX: number; startWidth: number } | null>(null);
  const scenarioPanelResizeSessionRef = useRef<{ startX: number; startWidth: number } | null>(
    null
  );
  const pendingAgentToggleResetReasonRef = useRef<string | null>(null);
  const studyModeConfig = useMemo(
    () => (studyModePreset ? getStudyModeConfig(studyModePreset) : null),
    [studyModePreset]
  );
  const sessionLocked = Boolean(studySession);
  const isBaselineMode = studyModePreset === 'baseline';

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

  const getMaxScenarioPanelWidth = useCallback(() => {
    if (typeof window === 'undefined') return DEFAULT_SCENARIO_PANEL_WIDTH_PX;
    return Math.max(
      MIN_SCENARIO_PANEL_WIDTH_PX,
      Math.min(
        MAX_SCENARIO_PANEL_WIDTH_PX,
        window.innerWidth - MIN_MAIN_CONTENT_WIDTH_PX
      )
    );
  }, []);

  const clampScenarioPanelWidth = useCallback(
    (width: number) =>
      Math.min(
        Math.max(width, MIN_SCENARIO_PANEL_WIDTH_PX),
        getMaxScenarioPanelWidth()
      ),
    [getMaxScenarioPanelWidth]
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

  const stopScenarioPanelWidthResize = useCallback(() => {
    scenarioPanelResizeSessionRef.current = null;
    setIsResizingScenarioPanelWidth(false);
  }, []);

  const handleScenarioPanelWidthResizeMove = useCallback(
    (event: PointerEvent) => {
      const session = scenarioPanelResizeSessionRef.current;
      if (!session) return;
      const nextWidth = session.startWidth + (event.clientX - session.startX);
      setScenarioPanelWidthPx(clampScenarioPanelWidth(nextWidth));
    },
    [clampScenarioPanelWidth]
  );

  const handleScenarioPanelWidthResizeStart = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>) => {
      if (event.button !== 0) return;
      event.preventDefault();
      scenarioPanelResizeSessionRef.current = {
        startX: event.clientX,
        startWidth: scenarioPanelWidthPx,
      };
      setIsResizingScenarioPanelWidth(true);
    },
    [scenarioPanelWidthPx]
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
            if (selectedSeats.length === 0) {
              setError('Missing seats');
              return;
            }
            const seatData = await api.getSeats(bookingCtx.showing.id);
            const selectedSeatSet = new Set(selectedSeats.map((seat) => seat.id));
            const totalPrice = seatData.seats
              .filter((seat) => selectedSeatSet.has(seat.id))
              .reduce((sum, seat) => sum + seat.price, 0);

            const meta: ConfirmMeta = {
              movie: bookingCtx.movie,
              theater: bookingCtx.theater,
              date: bookingCtx.date,
              time: bookingCtx.showing.time,
              seats: selectedSeats.map((seat) => seat.value),
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
    if (studyModeConfig) return;
    api.getGuiAdaptationConfig().then((res) => setGuiAdaptationEnabled(res.enabled)).catch(() => {});
  }, [studyModeConfig]);

  useEffect(() => {
    writeStorageValue(AGENT_BRIDGE_ENABLED_STORAGE_KEY, String(agentBridgeEnabled));
  }, [agentBridgeEnabled]);

  useEffect(() => {
    writeStorageValue(PLANNER_CP_MEMORY_LIMIT_STORAGE_KEY, String(plannerCpMemoryLimit));
  }, [plannerCpMemoryLimit]);

  useEffect(() => {
    writeStorageValue(AGENT_MODEL_STORAGE_KEY, agentModel);
  }, [agentModel]);

  useEffect(() => {
    writeStorageValue(GUI_ADAPTATION_ENABLED_STORAGE_KEY, String(guiAdaptationEnabled));
  }, [guiAdaptationEnabled]);

  const handleModelToggle = useCallback((model: AgentModel) => {
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
      setScenarioPanelWidthPx((current) => clampScenarioPanelWidth(current));
    };
    handleWindowResize();
    window.addEventListener('resize', handleWindowResize);
    return () => {
      window.removeEventListener('resize', handleWindowResize);
    };
  }, [clampChatWidth, clampScenarioPanelWidth]);

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

  useEffect(() => {
    if (!isResizingScenarioPanelWidth) return;
    const handlePointerUp = () => {
      stopScenarioPanelWidthResize();
    };
    window.addEventListener('pointermove', handleScenarioPanelWidthResizeMove);
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerUp);
    return () => {
      window.removeEventListener('pointermove', handleScenarioPanelWidthResizeMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerUp);
    };
  }, [
    isResizingScenarioPanelWidth,
    handleScenarioPanelWidthResizeMove,
    stopScenarioPanelWidthResize,
  ]);

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

  const handleConfirm = useCallback(async (context?: ToolApplyContext) => {
    if (!activeSpec) return;

    const bookingCtx = getBookingContext(activeSpec);
    const selectedSeats = bookingCtx.selectedSeats ?? [];

    if (!bookingCtx.showing || selectedSeats.length === 0) {
      setError('Missing booking information');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const result = await api.createBooking({
        showingId: bookingCtx.showing.id,
        seats: selectedSeats.map((seat) => seat.id),
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

  const handleNext = useCallback(async (context?: ToolApplyContext, specOverride?: UISpec | null) => {
    const spec = specOverride ?? activeSpec;
    if (!spec) return;

    const stage = spec.stage ?? currentStage;
    let selectionLabel = '';
    const currentBooking = getBookingContext(spec);
    let nextBooking: BookingContext = currentBooking;

    switch (stage) {
      case 'movie': {
        const selectedId = spec.state.selected?.id;
        if (!selectedId) return;

        const selectedMovie = movies.find((movie) => movie.id === selectedId);
        if (!selectedMovie) return;

        selectionLabel = selectedMovie.title;
        nextBooking = {
          movie: { id: selectedMovie.id, title: selectedMovie.title },
          selectedSeats: [],
        };
        break;
      }

      case 'theater': {
        const selectedId = spec.state.selected?.id;
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
        };
        break;
      }

      case 'date': {
        const selectedDate = spec.state.selected?.id;
        if (!selectedDate) return;

        selectionLabel = selectedDate;
        nextBooking = {
          ...currentBooking,
          date: selectedDate,
          showing: undefined,
          selectedSeats: [],
        };
        break;
      }

      case 'time': {
        const selectedId = spec.state.selected?.id;
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
        };
        break;
      }

      case 'seat': {
        const selectedSeats = spec.state.selectedList ?? [];
        if (selectedSeats.length === 0) return;

        selectionLabel = `${selectedSeats.length} seat(s) selected`;
        nextBooking = {
          ...currentBooking,
          selectedSeats,
        };
        break;
      }

      case 'confirm': {
        await handleConfirm(context);
        return;
      }
    }

    if (!context) {
      addUserMessage(stage, 'select', selectionLabel);
    }

    const nextStage = getNextStage(stage);
    if (nextStage) {
      const source: 'agent' | 'devtools' =
        context?.source === 'devtools' ? 'devtools' : 'agent';
      const transitionReason =
        typeof context?.reason === 'string' && context.reason.trim()
          ? context.reason.trim()
          : 'Move to the next stage because the current step is ready.';
      if (context) {
        annotateLastAgentMessage(stage, {
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
    setAwaitingAgentResponse(false);
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

  const handleStartOver = useCallback((context?: ToolApplyContext) => {
    if (!activeSpec) return;

    if (!context) {
      addUserMessage(currentStage, 'back', 'Start over');
    }

    const source: 'agent' | 'devtools' =
      context?.source === 'devtools' ? 'devtools' : 'agent';
    const transitionReason =
      typeof context?.reason === 'string' && context.reason.trim()
        ? context.reason.trim()
        : 'Return to the first stage and restart the workflow.';

    if (context) {
      annotateLastAgentMessage(currentStage, {
        toolName: 'startOver',
        source,
        reason: transitionReason,
      });
    }

    setBooking(null);
    loadStageData('movie', { booking: {} });
  }, [activeSpec, currentStage, addUserMessage, annotateLastAgentMessage, loadStageData]);

  const handleRepeatStep = useCallback((_context?: ToolApplyContext) => {
    if (!activeSpec) return;
    addSystemMessage(activeSpec.stage, activeSpec);
    setUiSpec(activeSpec);
  }, [activeSpec, addSystemMessage, setUiSpec]);

  useToolHandler({
    spec: activeSpec,
    setSpec: handleSetSpec,
    onNext: handleNext,
    onBack: handleBack,
    onStartOver: handleStartOver,
    onRepeatStep: handleRepeatStep,
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
    setAwaitingAgentResponse(false);
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
    () => buildToolSchemaForStage(activeSpec, currentStage, guiAdaptationEnabled, studyModePreset),
    [activeSpec, currentStage, guiAdaptationEnabled, studyModePreset]
  );

  const handleAgentToolCall = useCallback((
    toolName: string,
    params: Record<string, unknown>,
    context?: ToolApplyContext
  ) => {
    setAwaitingAgentResponse(false);
    const result = onToolApply(toolName, params, context);
    if (
      isBaselineMode &&
      toolName === 'select' &&
      result &&
      baselineAutoAdvanceStages.has(result.stage)
    ) {
      void handleNext(context, result);
    }
    return result;
  }, [onToolApply, isBaselineMode, handleNext]);

  const handleAgentMessage = useCallback((text: string) => {
    setAwaitingAgentResponse(false);
    const stage = activeSpec?.stage ?? currentStage;
    addAgentMessage(stage, text);
  }, [activeSpec, currentStage, addAgentMessage]);

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
    sessionId: studySession?.relaySessionId,
    studyToken: studySession?.studyToken,
    enabled: agentBridgeEnabled && Boolean(studySession),
    onToolCall: handleAgentToolCall,
    onAgentMessage: handleAgentMessage,
    onSessionEnd: handleSessionReset,
  });

  const handleManualReset = useCallback(() => {
    if (loading) return;
    const confirmed = window.confirm(
      'Reset this task and clear the current chat and booking progress?'
    );
    if (!confirmed) return;
    sendSessionResetToAgent('host-manual-reset');
    handleSessionReset();
  }, [handleSessionReset, loading, sendSessionResetToAgent]);

  const handleFinishStudy = useCallback(async () => {
    if (loading) return;
    const confirmed = window.confirm('Finish this task and go to the end screen?');
    if (!confirmed) return;

    resetChat();
    setBooking(null);
    setError(null);
    setAwaitingAgentResponse(false);
    setUiSpec(null);

    try {
      await api.finishStudySession();
    } catch {
      // Best-effort finish request; local teardown still proceeds.
    }

    sendSessionResetToAgent('host-finish-study');
    navigate('/end', { replace: true });
  }, [
    loading,
    navigate,
    resetChat,
    sendSessionResetToAgent,
    setUiSpec,
  ]);

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

  useEffect(() => {
    if (!studyModePreset || !studyModeConfig) return;
    if (appliedStudyModePresetRef.current === studyModePreset) return;
    appliedStudyModePresetRef.current = studyModePreset;

    setModelPickerOpen(false);
    setAgentBridgeEnabled(studyModeConfig.agentEnabled);
    setGuiAdaptationEnabled(studyModeConfig.guiAdaptationEnabled);
    setPlannerCpMemoryLimit(studyModeConfig.cpMemoryWindow);

    api.setGuiAdaptationConfig(studyModeConfig.guiAdaptationEnabled).catch(() => {});
  }, [studyModePreset, studyModeConfig]);

  const handleChatInputSubmit = useCallback(
    (text: string) => {
      if (!agentBridgeEnabled) return;
      addUserMessage(currentStage, 'input', text);
      setAwaitingAgentResponse(true);
      sendUserMessageToAgent(text, currentStage);
    },
    [addUserMessage, agentBridgeEnabled, currentStage, sendUserMessageToAgent]
  );

  const currentStep = STAGE_ORDER.indexOf(currentStage) + 1;
  const previousStage = getPrevStage(currentStage);
  const nextStage = getNextStage(currentStage);
  const hasConnectedAgent = connectedAgents.length > 0;
  const connectedAgentNames = connectedAgents.map((agent) => agent.name).join(', ');
  const isAgentTyping =
    awaitingAgentResponse &&
    agentBridgeEnabled &&
    isAgentBridgeConnected &&
    isAgentBridgeJoined &&
    hasConnectedAgent;

  useEffect(() => {
    if (isAgentTyping) return;
    setAwaitingAgentResponse(false);
  }, [isAgentTyping]);

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
    ? isBaselineMode
      ? 'No baseline router connected'
      : 'No external agent connected'
    : isBaselineMode
    ? 'Baseline router connected'
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
  const scenarioTitle = studySession?.scenario.title ?? 'Scenario';
  const scenarioStory = studySession?.scenario.story ?? '';
  const scenarioPreferenceTypes = studySession?.scenario.narratorPreferenceTypes ?? [];
  const showScenarioBriefing = scenarioStory.length > 0 || scenarioPreferenceTypes.length > 0;

  return (
    <div className="flex h-screen bg-dark">
      {showScenarioBriefing && (
        <aside
          className="relative hidden shrink-0 border-r border-dark-border bg-dark-light lg:block"
          style={{ width: scenarioPanelWidthPx }}
        >
          <div className="h-full overflow-y-auto p-4">
            <ScenarioBriefing
              title={scenarioTitle}
              story={scenarioStory}
              narratorPreferenceTypes={scenarioPreferenceTypes}
            />
          </div>
          <button
            type="button"
            aria-label="Resize scenario panel width"
            title="Drag to resize scenario panel"
            onPointerDown={handleScenarioPanelWidthResizeStart}
            className="absolute right-0 top-0 flex h-full w-4 translate-x-1/2 cursor-ew-resize"
          >
            <span
              className={`absolute left-1/2 top-1/2 h-14 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full transition-colors ${
                isResizingScenarioPanelWidth
                  ? 'bg-primary'
                  : 'bg-dark-border hover:bg-dark-lighter'
              }`}
            />
          </button>
        </aside>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="shrink-0 border-b border-dark-border bg-dark px-4 py-3">
          <div className="mx-auto flex w-full items-center justify-end gap-2 overflow-x-auto whitespace-nowrap [&>*]:shrink-0">
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
            {SHOW_STUDY_CONTROL_BUTTONS && (
              <>
                <button
                  type="button"
                  onClick={handleAgentBridgeToggle}
                  disabled={sessionLocked}
                  className={`px-3 py-1 text-xs rounded border ${
                    agentBridgeEnabled
                      ? 'border-info-border text-info-label hover:border-info-label hover:text-info-text'
                      : 'border-primary/40 text-primary/80 hover:border-primary hover:text-primary'
                  } disabled:cursor-not-allowed disabled:opacity-60`}
                >
                  Agent {agentBridgeEnabled ? 'ON' : 'OFF'}
                </button>
                <button
                  type="button"
                  onClick={handleGuiAdaptationToggle}
                  disabled={sessionLocked}
                  className={`px-3 py-1 text-xs rounded border ${
                    guiAdaptationEnabled
                      ? 'border-info-border text-info-label hover:border-info-label hover:text-info-text'
                      : 'border-info-border/60 text-info-label/70 hover:border-info-border hover:text-info-label'
                  } disabled:cursor-not-allowed disabled:opacity-60`}
                >
                  GUI Adaptation {guiAdaptationEnabled ? 'ON' : 'OFF'}
                </button>
                <label
                  className={`flex h-[26px] items-center gap-2 rounded border px-3 text-xs ${
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
                    disabled={!agentBridgeEnabled || sessionLocked}
                    onChange={(event) => {
                      const parsed = Number.parseInt(event.target.value, 10);
                      if (!Number.isFinite(parsed)) {
                        setPlannerCpMemoryLimit(0);
                        return;
                      }
                      setPlannerCpMemoryLimit(Math.max(0, parsed));
                    }}
                    className="h-5 w-16 rounded border border-info-border bg-dark px-2 text-xs text-info-text disabled:cursor-not-allowed disabled:opacity-60"
                    title="0 disables CP memory injection. N injects the latest N memory items per list."
                  />
                </label>
                {agentBridgeEnabled && !isBaselineMode && (
                  <div className="relative flex">
                    <button
                      type="button"
                      onClick={() => setModelPickerOpen((prev) => !prev)}
                      disabled={sessionLocked}
                      className="px-3 py-1 text-xs rounded border border-info-border text-info-label hover:border-info-label hover:text-info-text transition-colors disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {agentModel === 'openai' ? 'gpt-5.2' : 'gemini-2.5-flash'}
                    </button>
                    {modelPickerOpen && (
                      <>
                        <div className="fixed inset-0 z-10" onClick={() => setModelPickerOpen(false)} />
                        <div className="absolute left-0 top-full z-20 mt-1 flex flex-col gap-1">
                          {([['openai', 'gpt-5.2'], ['gemini', 'gemini-2.5-flash']] as const).map(
                            ([id, label]) => (
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
                            )
                          )}
                        </div>
                      </>
                    )}
                  </div>
                )}
                {agentBridgeEnabled && isBaselineMode && (
                  <div className="rounded border border-info-border px-3 py-1 text-xs text-info-label">
                    Baseline uses OpenAI
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
              </>
            )}
            <button
              type="button"
              onClick={handleFinishStudy}
              disabled={loading}
              className="px-3 py-1 text-xs rounded border border-primary/70 text-primary hover:bg-primary/10 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Finish Task
            </button>
          </div>
        </header>

        {showScenarioBriefing && (
          <div className="shrink-0 border-b border-dark-border bg-dark-light px-4 py-3 lg:hidden">
            <ScenarioBriefing
              title={scenarioTitle}
              story={scenarioStory}
              narratorPreferenceTypes={scenarioPreferenceTypes}
              compact
            />
          </div>
        )}

        {viewMode === 'chat' ? (
          <MessageList
            messages={messages}
            activeSpec={activeSpec}
            isAgentTyping={isAgentTyping}
            onSelect={handleSelect}
            onToggle={handleToggle}
            onNext={handleNext}
            onBack={handleBack}
            onStartOver={handleStartOver}
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
                            onNext={() => {}}
                            onBack={() => {}}
                            onStartOver={undefined}
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
                            onNext={handleNext}
                            onBack={handleBack}
                            onStartOver={handleStartOver}
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
                            onNext={() => {}}
                            onBack={() => {}}
                            onStartOver={undefined}
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
    </div>
  );
}
