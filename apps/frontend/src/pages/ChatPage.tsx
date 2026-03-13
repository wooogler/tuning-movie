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
  refreshVisibleItems,
  selectItem,
  selectItems,
  toggleItem,
  type ConfirmMeta,
  type BookingContext,
  type DataItem,
  type UISpec,
  type Stage,
} from '../spec';
import { MessageList, FullTuningSplitView, ChatInput } from '../components/chat';
import { ScenarioBriefing } from '../components/scenario/ScenarioBriefing';
import { StageRenderer } from '../renderer';
import {
  useToolHandler,
  useAgentBridge,
  useStudyInteractionLogger,
  useVoiceInput,
  useVoiceOutput,
} from '../hooks';
import { agentTools, type ToolDefinition } from '../agent/tools';
import { getStudyModeConfig, type StudyModeId } from './studyOptions';
import type { Movie, Theater, Showing, Booking } from '../types';
import { formatTime12Hour } from '../utils/displayFormats';
import { getFixedCurrentDate } from '../utils/studyDate';
import type { StudySessionState } from '../study/sessionStorage';

interface StageContext {
  booking?: BookingContext;
  restoreSnapshot?: boolean;
}

type ViewMode = 'chat' | 'carousel';
type SupportedSttLanguage = 'en' | 'ko';
interface ChatPageProps {
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
const GUI_ADAPTATION_ENABLED_STORAGE_KEY = 'tuning-movie-gui-adaptation-enabled';

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

function getPreferredSttLanguage(): SupportedSttLanguage {
  if (typeof navigator === 'undefined') return 'en';
  const locales = [navigator.language, ...(navigator.languages ?? [])];
  return locales.some(
    (locale) => typeof locale === 'string' && locale.toLowerCase().startsWith('ko')
  )
    ? 'ko'
    : 'en';
}

function getVoiceStatusLabel(params: {
  voiceModeEnabled: boolean;
  voiceInputSupported: boolean;
  voiceInputStatus: string;
  voiceOutputStatus: string;
  hasLiveAgentSession: boolean;
}): string | null {
  const {
    voiceModeEnabled,
    voiceInputSupported,
    voiceInputStatus,
    voiceOutputStatus,
    hasLiveAgentSession,
  } = params;

  if (!voiceModeEnabled) return null;
  if (!voiceInputSupported) return 'Voice mode is unavailable in this browser.';
  if (voiceOutputStatus === 'synthesizing') return 'Generating the agent voice...';
  if (voiceOutputStatus === 'playing') return 'Speaking the agent reply...';

  switch (voiceInputStatus) {
    case 'requesting-permission':
      return 'Requesting microphone access...';
    case 'capturing':
      return 'Listening to your turn...';
    case 'transcribing':
      return 'Transcribing your speech...';
    case 'suspended':
      return hasLiveAgentSession
        ? 'Waiting for the agent to finish...'
        : 'Waiting for the agent session...';
    case 'listening':
      return hasLiveAgentSession ? 'Listening automatically...' : 'Waiting for the agent session...';
    case 'error':
      return 'Voice mode hit an error.';
    case 'unsupported':
      return 'Voice mode is unavailable in this browser.';
    default:
      return hasLiveAgentSession ? 'Voice mode is ready.' : 'Waiting for the agent session...';
  }
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

function getStageContextKey(stage: Stage, booking: BookingContext): string {
  switch (stage) {
    case 'movie':
      return 'movie';
    case 'theater':
      return `movie:${booking.movie?.id ?? ''}`;
    case 'date':
      return `movie:${booking.movie?.id ?? ''}|theater:${booking.theater?.id ?? ''}`;
    case 'time':
      return `movie:${booking.movie?.id ?? ''}|theater:${booking.theater?.id ?? ''}|date:${booking.date ?? ''}`;
    case 'seat':
      return `movie:${booking.movie?.id ?? ''}|theater:${booking.theater?.id ?? ''}|date:${booking.date ?? ''}|showing:${booking.showing?.id ?? ''}`;
    case 'confirm':
      return `movie:${booking.movie?.id ?? ''}|theater:${booking.theater?.id ?? ''}|date:${booking.date ?? ''}|showing:${booking.showing?.id ?? ''}|seats:${(booking.selectedSeats ?? []).map((seat) => seat.id).join(',')}`;
    default:
      return '';
  }
}

function getLatestStageSnapshot(stage: Stage): UISpec | null {
  const { messages } = useChatStore.getState();

  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i];
    if (message.type === 'system' && message.stage === stage) {
      return message.spec;
    }
  }

  return null;
}

function restoreStageSnapshot<T extends DataItem>(
  baseSpec: UISpec<T>,
  stage: Stage,
  booking: BookingContext,
  snapshot: UISpec | null
): UISpec<T> {
  let spec = withBookingContext(baseSpec, booking);

  if (!snapshot || snapshot.stage !== stage) {
    return spec;
  }

  const snapshotBooking = getBookingContext(snapshot);
  if (getStageContextKey(stage, snapshotBooking) !== getStageContextKey(stage, booking)) {
    return spec;
  }

  spec = refreshVisibleItems({
    ...spec,
    modification: snapshot.modification,
  });

  const selectedIds = snapshot.state.selectedList?.map((item) => item.id) ?? [];
  if (selectedIds.length > 0) {
    return selectItems(spec, selectedIds);
  }

  const selectedId = snapshot.state.selected?.id;
  if (selectedId) {
    return selectItem(spec, selectedId);
  }

  return spec;
}

export function ChatPage({
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
  const [guiAdaptationEnabled, setGuiAdaptationEnabled] = useState<boolean>(() =>
    readStoredBoolean(GUI_ADAPTATION_ENABLED_STORAGE_KEY, true)
  );
  const [voiceModeEnabled, setVoiceModeEnabled] = useState(false);
  const [carouselOffset, setCarouselOffset] = useState(0);
  const [carouselOpacity, setCarouselOpacity] = useState(1);
  const [chatWidthPx, setChatWidthPx] = useState(DEFAULT_CHAT_WIDTH_PX);
  const [isResizingChatWidth, setIsResizingChatWidth] = useState(false);
  const [scenarioPanelWidthPx, setScenarioPanelWidthPx] = useState(
    DEFAULT_SCENARIO_PANEL_WIDTH_PX
  );
  const [isResizingScenarioPanelWidth, setIsResizingScenarioPanelWidth] = useState(false);
  const [awaitingAgentResponse, setAwaitingAgentResponse] = useState(false);
  const [speakingMessageId, setSpeakingMessageId] = useState<string | null>(null);
  const [downloadingLog, setDownloadingLog] = useState(false);

  const initialized = useRef(false);
  const appliedStudyModePresetRef = useRef<StudyModeId | null>(null);
  const previousStageRef = useRef<Stage>(currentStage);
  const interactionScopeRef = useRef<HTMLDivElement | null>(null);
  const chatResizeSessionRef = useRef<{ startX: number; startWidth: number } | null>(null);
  const scenarioPanelResizeSessionRef = useRef<{ startX: number; startWidth: number } | null>(
    null
  );
  const agentStatusSupportedRef = useRef(false);
  const studyModeConfig = useMemo(
    () => (studyModePreset ? getStudyModeConfig(studyModePreset) : null),
    [studyModePreset]
  );
  const isBaselineMode = studyModePreset === 'baseline';
  const usesSplitInterface =
    studyModePreset === 'full-tuning' || studyModePreset === 'new-baseline';
  const sttLanguage = useMemo(() => getPreferredSttLanguage(), []);
  const { logEvent: logStudyEvent, logEventNow: logStudyEventNow } = useStudyInteractionLogger({
    studySession,
    messages,
    activeSpec,
    booking,
    error,
  });

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
      const shouldRestoreSnapshot = ctx.restoreSnapshot !== false;
      const buildStageSpec = <T extends DataItem>(
        nextStage: Stage,
        baseSpec: UISpec<T>,
        booking: BookingContext
      ) =>
        restoreStageSnapshot(
          baseSpec,
          nextStage,
          booking,
          shouldRestoreSnapshot ? getLatestStageSnapshot(nextStage) : null
        );

      try {
        switch (stage) {
          case 'movie': {
            const data = await api.getMovies();
            setMovies(data.movies);
            setBackendData({ movies: data.movies });
            const spec = buildStageSpec('movie', generateMovieSpec(data.movies), {});
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
            const spec = buildStageSpec(
              'theater',
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
            const spec = buildStageSpec(
              'date',
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
            const spec = buildStageSpec(
              'time',
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
            const spec = buildStageSpec('seat', generateSeatSpec(data.seats), bookingCtx);
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

            const spec = buildStageSpec('confirm', generateConfirmSpec(meta), bookingCtx);
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
      loadStageData('movie', { booking: {}, restoreSnapshot: false });
    }
  }, [loadStageData]);

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
    writeStorageValue(GUI_ADAPTATION_ENABLED_STORAGE_KEY, String(guiAdaptationEnabled));
  }, [guiAdaptationEnabled]);

  const handleVoiceModeToggle = useCallback(() => {
    setVoiceModeEnabled((current) => {
      const nextEnabled = !current;
      logStudyEvent('chat.voice_mode.toggled', {
        enabled: nextEnabled,
      });
      return nextEnabled;
    });
  }, [logStudyEvent]);

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
      logStudyEvent('chat.selection.changed', {
        stage: activeSpec.stage,
        interaction: 'select',
        itemId: id,
      });
      const newSpec = selectItem(activeSpec, id);
      updateActiveSpec(newSpec);
      setUiSpec(newSpec);
    },
    [activeSpec, logStudyEvent, updateActiveSpec, setUiSpec]
  );

  const handleToggle = useCallback(
    (id: string) => {
      if (!activeSpec) return;
      logStudyEvent('chat.selection.changed', {
        stage: activeSpec.stage,
        interaction: 'toggle',
        itemId: id,
      });
      const newSpec = toggleItem(activeSpec, id);
      updateActiveSpec(newSpec);
      setUiSpec(newSpec);
    },
    [activeSpec, logStudyEvent, updateActiveSpec, setUiSpec]
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

        selectionLabel = formatTime12Hour(selectedShowing.time);
        nextBooking = {
          ...currentBooking,
          showing: {
            id: selectedShowing.id,
            time: formatTime12Hour(selectedShowing.time),
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
    loadStageData('movie', { booking: {}, restoreSnapshot: false });
  }, [activeSpec, currentStage, addUserMessage, annotateLastAgentMessage, loadStageData]);

  const handleRepeatStep = useCallback(() => {
    if (!activeSpec) return;
    addSystemMessage(activeSpec.stage, activeSpec);
    setUiSpec(activeSpec);
  }, [activeSpec, addSystemMessage, setUiSpec]);

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
    if (!agentStatusSupportedRef.current) {
      setAwaitingAgentResponse(false);
    }
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

  const {
    status: voiceOutputStatus,
    error: voiceOutputError,
    isSpeaking: isVoiceOutputActive,
    speak: speakAgentMessage,
    stop: stopAgentSpeech,
  } = useVoiceOutput({
    enabled: voiceModeEnabled && agentBridgeEnabled,
    synthesizeSpeech: (text: string, signal?: AbortSignal) => api.synthesizeSpeech(text, signal),
    onLogEvent: logStudyEvent,
    onActiveItemChange: (item) => {
      setSpeakingMessageId(item?.id ?? null);
    },
  });

  const handleAgentMessage = useCallback((text: string) => {
    const normalizedText = text.trim();
    if (!normalizedText) return;
    setAwaitingAgentResponse(false);
    const stage = activeSpec?.stage ?? currentStage;
    const messageId = addAgentMessage(stage, normalizedText);
    void speakAgentMessage({ id: messageId, text: normalizedText });
  }, [activeSpec, currentStage, addAgentMessage, speakAgentMessage]);

  const {
    sendUserMessageToAgent,
    sendSessionResetToAgent,
    isConnected: isAgentBridgeConnected,
    isJoined: isAgentBridgeJoined,
    connectedAgents,
    agentActivityPhase,
    agentStatusSupported,
  } = useAgentBridge({
    uiSpec: activeSpec,
    messageHistory: messages,
    toolSchema: agentToolSchema,
    guiAdaptationEnabled,
    plannerCpMemoryLimit,
    sessionId: studySession?.relaySessionId,
    studyToken: studySession?.studyToken,
    enabled: agentBridgeEnabled && Boolean(studySession),
    onToolCall: handleAgentToolCall,
    onAgentMessage: handleAgentMessage,
    onSessionEnd: handleSessionReset,
  });

  useEffect(() => {
    agentStatusSupportedRef.current = agentStatusSupported;
  }, [agentStatusSupported]);

  const submitChatInput = useCallback(
    (text: string, source: 'text' | 'voice' = 'text') => {
      const trimmed = text.trim();
      if (!trimmed || !agentBridgeEnabled) return;

      stopAgentSpeech();
      logStudyEvent('chat.user_input.submitted', {
        stage: currentStage,
        text: trimmed,
        source,
      });
      addUserMessage(currentStage, 'input', trimmed);
      setAwaitingAgentResponse(true);
      sendUserMessageToAgent(trimmed, currentStage);
    },
    [
      addUserMessage,
      agentBridgeEnabled,
      currentStage,
      logStudyEvent,
      sendUserMessageToAgent,
      stopAgentSpeech,
    ]
  );

  const handleChatInputSubmit = useCallback(
    (text: string) => {
      submitChatInput(text, 'text');
    },
    [submitChatInput]
  );

  const handlePostedAgentMessage = useCallback((text: string) => {
    const normalizedText = text.trim();
    if (!normalizedText) return;

    const stage = activeSpec?.stage ?? currentStage;
    const messageId = addAgentMessage(stage, normalizedText);
    void speakAgentMessage({ id: messageId, text: normalizedText });
  }, [activeSpec, currentStage, addAgentMessage, speakAgentMessage]);

  useToolHandler({
    spec: activeSpec,
    setSpec: handleSetSpec,
    onNext: handleNext,
    onBack: handleBack,
    onStartOver: handleStartOver,
    onRepeatStep: handleRepeatStep,
    onPostMessage: handlePostedAgentMessage,
    multiSelect: currentStage === 'seat',
  });

  const handleManualReset = useCallback(() => {
    if (loading) return;
    const confirmed = window.confirm(
      'Reset this task and clear the current chat and booking progress?'
    );
    if (!confirmed) return;
    stopAgentSpeech();
    logStudyEvent('study.control.reset_requested', {
      source: 'participant',
    });
    sendSessionResetToAgent('host-manual-reset');
    handleSessionReset();
  }, [handleSessionReset, loading, logStudyEvent, sendSessionResetToAgent, stopAgentSpeech]);

  const handleFinishStudy = useCallback(async () => {
    if (loading) return;
    const confirmed = window.confirm('Finish this task and go to the end screen?');
    if (!confirmed) return;

    stopAgentSpeech();
    await logStudyEventNow('study.control.finish_requested', {
      source: 'participant',
    });

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
    logStudyEventNow,
    navigate,
    resetChat,
    sendSessionResetToAgent,
    setUiSpec,
    stopAgentSpeech,
  ]);

  useEffect(() => {
    if (!studyModePreset || !studyModeConfig) return;
    if (appliedStudyModePresetRef.current === studyModePreset) return;
    appliedStudyModePresetRef.current = studyModePreset;

    setAgentBridgeEnabled(studyModeConfig.agentEnabled);
    setGuiAdaptationEnabled(studyModeConfig.guiAdaptationEnabled);
    setPlannerCpMemoryLimit(studyModeConfig.cpMemoryWindow);

    api.setGuiAdaptationConfig(studyModeConfig.guiAdaptationEnabled).catch(() => {});
  }, [studyModePreset, studyModeConfig]);

  const currentStep = STAGE_ORDER.indexOf(currentStage) + 1;
  const previousStage = getPrevStage(currentStage);
  const nextStage = getNextStage(currentStage);
  const hasConnectedAgent = connectedAgents.length > 0;
  const hasLiveAgentSession =
    agentBridgeEnabled &&
    isAgentBridgeConnected &&
    isAgentBridgeJoined &&
    hasConnectedAgent;
  const effectiveAgentActivityPhase =
    agentActivityPhase !== 'idle'
      ? agentActivityPhase
      : awaitingAgentResponse && hasLiveAgentSession
      ? 'planning'
      : 'idle';
  const isAgentTyping = hasLiveAgentSession && effectiveAgentActivityPhase !== 'idle';
  const interactionLocked = loading || isAgentTyping;

  useEffect(() => {
    if (!hasLiveAgentSession) {
      setAwaitingAgentResponse(false);
      return;
    }
    if (agentStatusSupported && agentActivityPhase !== 'idle') {
      setAwaitingAgentResponse(false);
    }
  }, [agentActivityPhase, agentStatusSupported, hasLiveAgentSession]);

  useEffect(() => {
    const scope = interactionScopeRef.current as (HTMLDivElement & { inert?: boolean }) | null;
    if (!scope) return;
    scope.inert = interactionLocked;
    return () => {
      scope.inert = false;
    };
  }, [interactionLocked]);

  useEffect(() => {
    if (!interactionLocked || typeof document === 'undefined') return;
    const activeElement = document.activeElement;
    if (activeElement instanceof HTMLElement) {
      activeElement.blur();
    }
  }, [interactionLocked]);

  const inputDisabled =
    interactionLocked ||
    !agentBridgeEnabled ||
    !isAgentBridgeConnected ||
    !isAgentBridgeJoined ||
    !hasConnectedAgent;
  const chatInputPlaceholder =
    !isAgentBridgeConnected
      ? 'Waiting for agent relay connection...'
      : !isAgentBridgeJoined
      ? 'Joining agent session...'
      : !hasConnectedAgent
      ? 'Waiting for an external agent to connect...'
      : 'Send a message to the external agent...';
  const {
    supported: voiceInputSupported,
    status: voiceInputStatus,
    error: voiceInputError,
  } = useVoiceInput({
    enabled: voiceModeEnabled && agentBridgeEnabled,
    suspended: !hasLiveAgentSession || inputDisabled || isVoiceOutputActive,
    transcribeAudio: async (audio: Blob) => {
      const result = await api.transcribeSpeech(audio, sttLanguage);
      return result.text;
    },
    onTranscript: (text: string) => {
      submitChatInput(text, 'voice');
    },
    onLogEvent: logStudyEvent,
  });
  const voiceStatusLabel = getVoiceStatusLabel({
    voiceModeEnabled,
    voiceInputSupported,
    voiceInputStatus,
    voiceOutputStatus,
    hasLiveAgentSession,
  });
  const voiceError = voiceModeEnabled ? (voiceInputError ?? voiceOutputError) : null;
  const voiceModeButtonDisabled = !voiceInputSupported;
  const voiceModeStatusLabel = voiceModeEnabled ? 'ON' : 'OFF';
  const effectiveChatInputPlaceholder =
    voiceModeEnabled && hasLiveAgentSession
      ? 'Voice mode is on. Speak naturally or type here...'
      : chatInputPlaceholder;

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
  const canDownloadLog = Boolean(studySession?.interactionLogFile);

  const handleDownloadLog = useCallback(async () => {
    if (!studySession?.studyToken || !canDownloadLog || downloadingLog) return;

    setDownloadingLog(true);
    setError(null);

    await logStudyEventNow('study.control.log_download_requested', {
      source: 'participant',
    });

    try {
      const result = await api.downloadStudyLog(studySession.studyToken);
      const downloadUrl = window.URL.createObjectURL(result.blob);
      const anchor = document.createElement('a');
      anchor.href = downloadUrl;
      anchor.download =
        result.fileName ??
        studySession.interactionLogFile?.split('/').pop() ??
        'study-interaction-log.jsonl';
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.URL.revokeObjectURL(downloadUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to download interaction log');
    } finally {
      setDownloadingLog(false);
    }
  }, [canDownloadLog, downloadingLog, logStudyEventNow, studySession]);

  return (
    <div className="relative h-screen bg-dark">
      <div ref={interactionScopeRef} className="flex h-full">
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
              onClick={handleVoiceModeToggle}
              disabled={voiceModeButtonDisabled}
              title={
                voiceModeButtonDisabled
                  ? 'Voice mode is unavailable in this browser.'
                  : voiceModeEnabled && !hasLiveAgentSession
                  ? 'Voice mode is enabled and will start when the live agent session is ready.'
                  : voiceModeEnabled
                  ? 'Voice mode is enabled.'
                  : 'Voice mode is disabled.'
              }
              className={`flex items-center gap-2 px-3 py-1 text-xs rounded border ${
                voiceModeButtonDisabled
                  ? 'cursor-not-allowed border-info-border/50 text-info-label/55 opacity-70'
                  : voiceModeEnabled
                  ? 'border-info-border text-info-label hover:border-info-label hover:text-info-text'
                  : 'border-info-border/60 text-info-label/70 hover:border-info-border hover:text-info-label'
              }`}
            >
              <span>Voice Mode</span>
              <span
                className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold tracking-[0.16em] ${
                  voiceModeEnabled
                    ? 'border-info-border bg-info-bg text-info-text'
                    : 'border-dark-border bg-dark-light text-fg-muted'
                }`}
              >
                {voiceModeStatusLabel}
              </span>
            </button>
            <button
              type="button"
              onClick={handleManualReset}
              disabled={loading}
              className="px-3 py-1 text-xs rounded border border-dark-border text-fg hover:text-fg-strong hover:border-primary disabled:cursor-not-allowed disabled:opacity-50"
            >
              Reset
            </button>
            <button
              type="button"
              onClick={handleDownloadLog}
              disabled={!canDownloadLog || downloadingLog}
              title={
                canDownloadLog
                  ? 'Download the current JSONL interaction log'
                  : 'Interaction log is unavailable for this session'
              }
              className="px-3 py-1 text-xs rounded border border-dark-border text-fg hover:text-fg-strong hover:border-primary disabled:cursor-not-allowed disabled:opacity-50"
            >
              {downloadingLog ? 'Downloading...' : 'Download Log'}
            </button>
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

        {usesSplitInterface ? (
          <FullTuningSplitView
            messages={messages}
            activeSpec={activeSpec}
            isAgentTyping={isAgentTyping}
            speakingMessageId={speakingMessageId}
            inputDisabled={inputDisabled}
            inputPlaceholder={effectiveChatInputPlaceholder}
            onSubmitInput={agentBridgeEnabled ? handleChatInputSubmit : undefined}
            voiceModeEnabled={voiceModeEnabled}
            voiceStatusLabel={voiceStatusLabel}
            voiceError={voiceError}
            onSelect={handleSelect}
            onToggle={handleToggle}
            onNext={handleNext}
            onBack={handleBack}
            onStartOver={handleStartOver}
            onConfirm={handleConfirm}
          />
        ) : viewMode === 'chat' ? (
          <MessageList
            messages={messages}
            activeSpec={activeSpec}
            isAgentTyping={isAgentTyping}
            speakingMessageId={speakingMessageId}
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
          <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex justify-center px-4 pb-4">
            <div className="booking-complete-overlay pointer-events-auto w-full max-w-xl rounded-2xl border border-primary/35 bg-dark-light/95 p-5 shadow-2xl shadow-black/30 backdrop-blur">
              <div className="text-center">
                <div className="mb-1 text-2xl">Booking Complete</div>
                <p className="font-medium text-fg-strong">Booking Confirmed!</p>
                <p className="mb-4 text-sm text-fg-muted">Booking ID: {booking.id}</p>
                <button
                  type="button"
                  onClick={handleFinishStudy}
                  disabled={loading}
                  className="rounded-lg bg-primary px-4 py-2 text-primary-fg transition-colors hover:bg-primary/80 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Finish Task
                </button>
              </div>
            </div>
          </div>
        )}

        {agentBridgeEnabled && !usesSplitInterface && (
          <ChatInput
            chatWidthPx={chatWidthPx}
            disabled={inputDisabled}
            onSubmit={handleChatInputSubmit}
            voiceModeEnabled={voiceModeEnabled}
            voiceStatusLabel={voiceStatusLabel}
            voiceError={voiceError}
            placeholder={
              viewMode === 'chat'
                ? effectiveChatInputPlaceholder
                : 'Carousel mode: input is available here as well'
            }
          />
        )}
      </div>
      </div>
    </div>
  );
}
