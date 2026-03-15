import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { StageRenderer } from '../../renderer';
import type { UISpec, Stage } from '../../spec';
import type {
  AgentMessage as AgentMessageType,
  AgentMessageActionTag,
  ChatMessage,
  SystemMessage as SystemMessageType,
  SystemMessageAnnotation,
  UserMessage as UserMessageType,
} from '../../store/chatStore';
import { AgentMessage } from './AgentMessage';
import { ChatInput } from './ChatInput';
import { SelectionBreadcrumb } from './SelectionBreadcrumb';
import { UserMessage } from './UserMessage';
import { renderMessageText } from './renderMessageText';

interface FullTuningSplitViewProps {
  messages: ChatMessage[];
  activeSpec: UISpec | null;
  isAgentTyping?: boolean;
  interactionLocked?: boolean;
  speakingMessageId?: string | null;
  inputDisabled?: boolean;
  inputPlaceholder?: string;
  onSubmitInput?: (text: string) => void;
  voiceModeEnabled?: boolean;
  voiceStatusLabel?: string | null;
  voiceError?: string | null;
  onSelect?: (id: string) => void;
  onToggle?: (id: string) => void;
  onNext?: () => void;
  onBack?: () => void;
  onStartOver?: () => void;
  onConfirm?: () => void;
}

interface GuiSnapshot {
  id: string;
  stage: Stage;
  spec: UISpec;
  annotation?: SystemMessageAnnotation;
  linkedAssistantText?: string;
  linkedAssistantMessageId?: string;
  linkedActionTag?: AgentMessageActionTag;
  isLatest: boolean;
}

type TimelineRow =
  | {
      id: string;
      type: 'agent';
      message: AgentMessageType;
      snapshotIndex: number;
    }
  | {
      id: string;
      type: 'user';
      message: UserMessageType;
      snapshotIndex: number;
    }
  | {
      id: string;
      type: 'marker';
      snapshotIndex: number;
      label: string;
      stage: Stage;
    };

const SNAPSHOT_SYNC_BOTTOM_THRESHOLD_PX = 48;
const SNAPSHOT_SYNC_ANCHOR_BOTTOM_OFFSET_PX = 96;
const TIMELINE_SYNC_FLASH_MS = 950;
const GUI_STAGE_TRANSITION_MS = 420;

type GuiTransitionDirection = 'forward' | 'backward';

interface GuiTransitionState {
  outgoing: GuiSnapshot;
  direction: GuiTransitionDirection;
  incomingId: string;
}

function getSyncAnchorOffsetFromTop(containerHeight: number): number {
  return containerHeight - Math.min(
    SNAPSHOT_SYNC_ANCHOR_BOTTOM_OFFSET_PX,
    Math.max(32, containerHeight * 0.2)
  );
}

function getTimelineRowAnchorOffset(rowHeight: number): number {
  return rowHeight - Math.min(rowHeight / 3, 24);
}

function getToolActionLabel(toolName: string): string {
  switch (toolName) {
    case 'select':
      return 'is selecting';
    case 'selectMultiple':
      return 'is selecting multiple seats';
    case 'filter':
      return 'is filtering';
    case 'sort':
      return 'is sorting';
    case 'highlight':
      return 'is highlighting';
    case 'augment':
      return 'is updating labels';
    case 'clearModification':
      return 'is clearing modifications';
    case 'next':
      return 'is moving to the next step';
    case 'prev':
      return 'is going back';
    default:
      return `is applying ${toolName}`;
  }
}

function getAgentActionLabel(actionTag: AgentMessageActionTag): string {
  switch (actionTag.toolName) {
    case 'next':
      return 'moved to the next step';
    case 'prev':
      return 'went back';
    case 'startOver':
      return 'started over';
    default:
      return 'updated the GUI';
  }
}

function isAgentLinkedToSystem(
  agentMessage: AgentMessageType,
  systemMessage: SystemMessageType
): boolean {
  if (systemMessage.annotation?.kind === 'tool-modification') {
    return systemMessage.annotation.source === 'agent';
  }
  return Boolean(agentMessage.actionTag);
}

function getSnapshotContextLabel(snapshot: GuiSnapshot): string {
  if (snapshot.annotation) {
    return `${snapshot.annotation.source === 'devtools' ? 'DevTools' : 'Agent'} ${getToolActionLabel(
      snapshot.annotation.toolName
    )}`;
  }
  if (snapshot.linkedActionTag) {
    return `Agent ${getAgentActionLabel(snapshot.linkedActionTag)}`;
  }
  return snapshot.spec.title;
}

function getSnapshotContextText(snapshot: GuiSnapshot): string {
  const linkedAssistantText = snapshot.linkedAssistantText?.trim();
  if (linkedAssistantText) return linkedAssistantText;

  const annotationReason = snapshot.annotation?.reason?.trim();
  if (annotationReason) return annotationReason;

  const actionReason = snapshot.linkedActionTag?.reason?.trim();
  if (actionReason) return actionReason;

  const stageDescription = snapshot.spec.description?.trim();
  if (stageDescription) return stageDescription;

  return snapshot.spec.title;
}

function buildMarkerLabel(snapshot: GuiSnapshot): string {
  if (snapshot.annotation) {
    return getSnapshotContextLabel(snapshot);
  }
  if (snapshot.linkedActionTag) {
    return getSnapshotContextLabel(snapshot);
  }
  return snapshot.spec.title;
}

function getCollapsedConversationStatus(params: {
  voiceModeEnabled: boolean;
  voiceStatusLabel: string | null;
  voiceError: string | null;
  inputDisabled: boolean;
}) {
  const { voiceModeEnabled, voiceStatusLabel, voiceError, inputDisabled } = params;

  if (voiceError) {
    return {
      badge: 'Error',
      text: voiceError,
      compactText: 'Voice error',
      badgeClass: 'border-rose-500/60 bg-rose-500/12 text-fg',
    };
  }

  const normalizedVoiceStatus = voiceStatusLabel?.toLowerCase() ?? '';

  if (voiceModeEnabled) {
    if (
      normalizedVoiceStatus.includes('speaking the agent reply') ||
      normalizedVoiceStatus.includes('generating the agent voice')
    ) {
      return {
        badge: 'Speaking',
        text: voiceStatusLabel ?? 'The agent reply is still playing.',
        compactText: 'Reply playing',
        badgeClass: 'border-info-border bg-info-bg/70 text-fg',
      };
    }

    if (normalizedVoiceStatus.includes('transcribing')) {
      return {
        badge: 'Working',
        text: voiceStatusLabel ?? 'Processing what you just said.',
        compactText: 'Processing speech',
        badgeClass: 'border-dark-border bg-dark-light text-fg',
      };
    }

    if (
      normalizedVoiceStatus.includes('listening automatically') ||
      normalizedVoiceStatus.includes('listening to your turn') ||
      normalizedVoiceStatus.includes('voice mode is ready')
    ) {
      return {
        badge: 'Speak',
        text: 'You can speak now.',
        compactText: 'Speak now',
        badgeClass: 'border-rose-500/60 bg-rose-500/12 text-fg',
      };
    }

    return {
      badge: 'Voice',
      text:
        voiceStatusLabel ??
        (inputDisabled ? 'Waiting for the agent to be ready.' : 'Voice mode is on.'),
      compactText: inputDisabled ? 'Waiting...' : 'Voice mode on',
      badgeClass: 'border-dark-border bg-dark-light text-fg',
    };
  }

  if (inputDisabled) {
    return {
      badge: 'Waiting',
      text: 'Conversation is unavailable right now.',
      compactText: 'Not ready',
      badgeClass: 'border-dark-border bg-dark-light text-fg-muted',
    };
  }

  return {
    badge: 'Type',
    text: 'Expand the conversation to type a message.',
    compactText: 'Open to type',
    badgeClass: 'border-dark-border bg-dark-light text-fg',
  };
}

export function FullTuningSplitView({
  messages,
  activeSpec,
  isAgentTyping = false,
  interactionLocked = false,
  speakingMessageId = null,
  inputDisabled = true,
  inputPlaceholder = 'Type a message...',
  onSubmitInput,
  voiceModeEnabled = false,
  voiceStatusLabel = null,
  voiceError = null,
  onSelect,
  onToggle,
  onNext,
  onBack,
  onStartOver,
  onConfirm,
}: FullTuningSplitViewProps) {
  const timelineContainerRef = useRef<HTMLDivElement | null>(null);
  const rowRefs = useRef(new Map<string, HTMLDivElement>());
  const activeSnapshotRef = useRef<GuiSnapshot | null>(null);
  const activeSnapshotIndexRef = useRef<number>(-1);
  const transitionTimeoutRef = useRef<number | null>(null);
  const syncHighlightTimeoutRef = useRef<number | null>(null);
  const [conversationCollapsed, setConversationCollapsed] = useState(false);

  const { snapshots, timelineRows, latestSnapshotIndex, firstRowIdBySnapshotIndex } = useMemo(() => {
    const nextSnapshots: GuiSnapshot[] = [];
    const systemMessageIndexToSnapshotIndex = new Map<number, number>();

    for (let index = 0; index < messages.length; index += 1) {
      const message = messages[index];
      if (message.type !== 'system') continue;

      const previousMessage = index > 0 ? messages[index - 1] : null;
      const linkedAgentMessage =
        previousMessage &&
        previousMessage.type === 'agent' &&
        isAgentLinkedToSystem(previousMessage, message)
          ? previousMessage
          : null;

      const snapshotIndex = nextSnapshots.length;
      systemMessageIndexToSnapshotIndex.set(index, snapshotIndex);
      nextSnapshots.push({
        id: message.id,
        stage: message.stage,
        spec: message.spec,
        annotation: message.annotation,
        linkedAssistantText: linkedAgentMessage?.text,
        linkedAssistantMessageId: linkedAgentMessage?.id,
        linkedActionTag: linkedAgentMessage?.actionTag,
        isLatest: false,
      });
    }

    if (nextSnapshots.length > 0) {
      const latestIndex = nextSnapshots.length - 1;
      nextSnapshots[latestIndex] = {
        ...nextSnapshots[latestIndex],
        spec: activeSpec ?? nextSnapshots[latestIndex].spec,
        isLatest: true,
      };
    }

    const nextTimelineRows: TimelineRow[] = [];
    const nextFirstRowIdBySnapshotIndex = new Map<number, string>();
    let currentSnapshotIndex = nextSnapshots.length > 0 ? 0 : -1;

    const registerRow = (row: TimelineRow) => {
      nextTimelineRows.push(row);
      if (!nextFirstRowIdBySnapshotIndex.has(row.snapshotIndex)) {
        nextFirstRowIdBySnapshotIndex.set(row.snapshotIndex, row.id);
      }
    };

    for (let index = 0; index < messages.length; index += 1) {
      const message = messages[index];

      if (message.type === 'system') {
        const snapshotIndex = systemMessageIndexToSnapshotIndex.get(index);
        if (snapshotIndex === undefined) continue;
        currentSnapshotIndex = snapshotIndex;

        registerRow({
          id: `marker-${message.id}`,
          type: 'marker',
          snapshotIndex,
          label: buildMarkerLabel(nextSnapshots[snapshotIndex]),
          stage: message.stage,
        });
        continue;
      }

      if (message.type === 'user') {
        registerRow({
          id: message.id,
          type: 'user',
          message,
          snapshotIndex: currentSnapshotIndex,
        });
        continue;
      }

      const nextMessage = messages[index + 1];
      const linkedSnapshotIndex =
        nextMessage && nextMessage.type === 'system' && isAgentLinkedToSystem(message, nextMessage)
          ? systemMessageIndexToSnapshotIndex.get(index + 1)
          : undefined;

      if (linkedSnapshotIndex !== undefined) {
        continue;
      }

      registerRow({
        id: message.id,
        type: 'agent',
        message,
        snapshotIndex: linkedSnapshotIndex ?? currentSnapshotIndex,
      });
    }

    return {
      snapshots: nextSnapshots,
      timelineRows: nextTimelineRows,
      latestSnapshotIndex: nextSnapshots.length - 1,
      firstRowIdBySnapshotIndex: nextFirstRowIdBySnapshotIndex,
    };
  }, [messages, activeSpec]);

  const [activeSnapshotIndex, setActiveSnapshotIndex] = useState(latestSnapshotIndex);
  const [activeSyncRowId, setActiveSyncRowId] = useState<string | null>(
    timelineRows[timelineRows.length - 1]?.id ?? null
  );
  const [flashSyncRowId, setFlashSyncRowId] = useState<string | null>(
    timelineRows[timelineRows.length - 1]?.id ?? null
  );
  const [timelineTopInsetPx, setTimelineTopInsetPx] = useState(0);
  const latestTimelineRow = timelineRows[timelineRows.length - 1] ?? null;

  useEffect(() => {
    setActiveSnapshotIndex((current) => {
      if (latestSnapshotIndex < 0) return -1;
      if (current < 0 || current > latestSnapshotIndex) return latestSnapshotIndex;
      return current;
    });
  }, [latestSnapshotIndex]);

  useEffect(() => {
    setActiveSyncRowId((current) => {
      if (timelineRows.length === 0) return null;
      if (current && timelineRows.some((row) => row.id === current)) return current;
      return timelineRows[timelineRows.length - 1]?.id ?? null;
    });
  }, [timelineRows, conversationCollapsed]);

  useEffect(() => {
    if (!activeSyncRowId) {
      setFlashSyncRowId(null);
      return;
    }

    setFlashSyncRowId(activeSyncRowId);
    if (syncHighlightTimeoutRef.current !== null) {
      window.clearTimeout(syncHighlightTimeoutRef.current);
    }

    syncHighlightTimeoutRef.current = window.setTimeout(() => {
      setFlashSyncRowId((current) => (current === activeSyncRowId ? null : current));
      syncHighlightTimeoutRef.current = null;
    }, TIMELINE_SYNC_FLASH_MS);

    return () => {
      if (syncHighlightTimeoutRef.current !== null) {
        window.clearTimeout(syncHighlightTimeoutRef.current);
        syncHighlightTimeoutRef.current = null;
      }
    };
  }, [activeSyncRowId]);

  useLayoutEffect(() => {
    const container = timelineContainerRef.current;
    if (!container) return;

    const getFirstRowNode = () => {
      const firstRowId = timelineRows[0]?.id;
      return firstRowId ? rowRefs.current.get(firstRowId) ?? null : null;
    };

    const updateTopInset = () => {
      const firstRowNode = getFirstRowNode();
      const syncAnchorOffset = getSyncAnchorOffsetFromTop(container.clientHeight);
      const firstRowAnchorOffset = firstRowNode
        ? getTimelineRowAnchorOffset(firstRowNode.offsetHeight)
        : 24;
      setTimelineTopInsetPx(Math.max(0, syncAnchorOffset - firstRowAnchorOffset));
    };

    updateTopInset();

    if (typeof ResizeObserver === 'undefined') {
      return;
    }

    const observer = new ResizeObserver(() => {
      updateTopInset();
    });
    observer.observe(container);

    const firstRowNode = getFirstRowNode();
    if (firstRowNode) {
      observer.observe(firstRowNode);
    }

    return () => {
      observer.disconnect();
    };
  }, [timelineRows]);

  const syncActiveSnapshotToScroll = useCallback(() => {
    const container = timelineContainerRef.current;
    if (!container || timelineRows.length === 0) return;
    const lastRow = timelineRows[timelineRows.length - 1];

    const remainingScroll =
      container.scrollHeight - (container.scrollTop + container.clientHeight);
    if (remainingScroll <= SNAPSHOT_SYNC_BOTTOM_THRESHOLD_PX && latestSnapshotIndex >= 0 && lastRow) {
      setActiveSnapshotIndex((current) =>
        current === latestSnapshotIndex ? current : latestSnapshotIndex
      );
      setActiveSyncRowId((current) => (current === lastRow.id ? current : lastRow.id));
      return;
    }

    const containerRect = container.getBoundingClientRect();
    const syncAnchorY = containerRect.top + getSyncAnchorOffsetFromTop(container.clientHeight);
    let closestRowId = timelineRows[0].id;
    let closestSnapshotIndex = timelineRows[0].snapshotIndex;
    let closestDistance = Number.POSITIVE_INFINITY;

    for (const row of timelineRows) {
      const node = rowRefs.current.get(row.id);
      if (!node) continue;
      const rowRect = node.getBoundingClientRect();
      const rowAnchorY = rowRect.top + getTimelineRowAnchorOffset(rowRect.height);
      const distance = Math.abs(rowAnchorY - syncAnchorY);
      if (distance < closestDistance) {
        closestDistance = distance;
        closestRowId = row.id;
        closestSnapshotIndex = row.snapshotIndex;
      }
    }

    setActiveSnapshotIndex((current) =>
      current === closestSnapshotIndex ? current : closestSnapshotIndex
    );
    setActiveSyncRowId((current) => (current === closestRowId ? current : closestRowId));
  }, [latestSnapshotIndex, timelineRows]);

  useEffect(() => {
    if (timelineRows.length === 0) return;
    syncActiveSnapshotToScroll();
  }, [timelineRows, syncActiveSnapshotToScroll]);

  useLayoutEffect(() => {
    if (!latestTimelineRow) return;

    setActiveSnapshotIndex((current) =>
      current === latestTimelineRow.snapshotIndex ? current : latestTimelineRow.snapshotIndex
    );
    setActiveSyncRowId((current) => (current === latestTimelineRow.id ? current : latestTimelineRow.id));

    const container = timelineContainerRef.current;
    if (!container) return;
    container.scrollTop = container.scrollHeight;
  }, [latestTimelineRow?.id]);

  useLayoutEffect(() => {
    if (conversationCollapsed) return;
    const container = timelineContainerRef.current;
    if (!container) return;
    container.scrollTop = container.scrollHeight;
    syncActiveSnapshotToScroll();
  }, [conversationCollapsed, syncActiveSnapshotToScroll]);

  const collapsedConversationStatus = getCollapsedConversationStatus({
    voiceModeEnabled,
    voiceStatusLabel,
    voiceError,
    inputDisabled,
  });
  const containerClass =
    'mx-auto grid h-full w-full max-w-6xl min-h-0 grid-cols-1 grid-rows-[minmax(0,3fr)_minmax(0,2fr)] gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:grid-rows-1';

  const scrollToSnapshot = useCallback(
    (snapshotIndex: number) => {
      const container = timelineContainerRef.current;
      const targetRowId = firstRowIdBySnapshotIndex.get(snapshotIndex);
      const targetNode = targetRowId ? rowRefs.current.get(targetRowId) : null;
      if (!container || !targetNode) return;

      setActiveSnapshotIndex(snapshotIndex);
      setActiveSyncRowId(targetRowId ?? null);
      container.scrollTo({
        top: Math.max(
          0,
          targetNode.offsetTop +
            getTimelineRowAnchorOffset(targetNode.offsetHeight) -
            getSyncAnchorOffsetFromTop(container.clientHeight)
        ),
        behavior: 'smooth',
      });
    },
    [firstRowIdBySnapshotIndex]
  );

  const activeSnapshot =
    snapshots[activeSnapshotIndex] ?? snapshots[latestSnapshotIndex] ?? null;
  const canGoToPreviousSnapshot = activeSnapshotIndex > 0;
  const canGoToNextSnapshot =
    activeSnapshotIndex >= 0 && activeSnapshotIndex < latestSnapshotIndex;
  const [transitionState, setTransitionState] = useState<GuiTransitionState | null>(null);

  useEffect(
    () => () => {
      if (transitionTimeoutRef.current !== null) {
        window.clearTimeout(transitionTimeoutRef.current);
      }
    },
    []
  );

  useEffect(() => {
    const previousSnapshot = activeSnapshotRef.current;
    const previousSnapshotIndex = activeSnapshotIndexRef.current;

    if (!activeSnapshot) {
      activeSnapshotRef.current = null;
      activeSnapshotIndexRef.current = activeSnapshotIndex;
      setTransitionState(null);
      return;
    }

    if (!previousSnapshot) {
      activeSnapshotRef.current = activeSnapshot;
      activeSnapshotIndexRef.current = activeSnapshotIndex;
      setTransitionState(null);
      return;
    }

    if (previousSnapshot.id !== activeSnapshot.id && previousSnapshot.stage !== activeSnapshot.stage) {
      const direction: GuiTransitionDirection =
        activeSnapshotIndex >= previousSnapshotIndex ? 'forward' : 'backward';
      setTransitionState({
        outgoing: previousSnapshot,
        direction,
        incomingId: activeSnapshot.id,
      });

      if (transitionTimeoutRef.current !== null) {
        window.clearTimeout(transitionTimeoutRef.current);
      }

      transitionTimeoutRef.current = window.setTimeout(() => {
        setTransitionState((current) =>
          current?.incomingId === activeSnapshot.id ? null : current
        );
        transitionTimeoutRef.current = null;
      }, GUI_STAGE_TRANSITION_MS);
    } else {
      if (transitionTimeoutRef.current !== null) {
        window.clearTimeout(transitionTimeoutRef.current);
        transitionTimeoutRef.current = null;
      }
      setTransitionState(null);
    }

    activeSnapshotRef.current = activeSnapshot;
    activeSnapshotIndexRef.current = activeSnapshotIndex;
  }, [activeSnapshot, activeSnapshotIndex]);

  return (
    <div className="min-h-0 flex-1 overflow-hidden px-4 py-4">
      <div className={containerClass}>
        <section className="relative min-h-0 overflow-hidden rounded-2xl border border-dark-border bg-dark p-4">
          <div className="absolute left-1/2 top-4 z-10 -translate-x-1/2 rounded-full border border-dark-border bg-dark-light px-3 py-1 text-xs font-medium text-fg">
            {latestSnapshotIndex >= 0 ? `${activeSnapshotIndex + 1} / ${latestSnapshotIndex + 1}` : '0 / 0'}
          </div>

          <div className="flex h-full flex-col gap-3 pt-10">
            <SnapshotNavButton
              direction="prev"
              disabled={!canGoToPreviousSnapshot}
              onClick={() => scrollToSnapshot(activeSnapshotIndex - 1)}
            />

            <div className="min-h-[320px] flex-1 overflow-y-auto overflow-x-hidden overscroll-contain px-2 py-2 sm:min-h-[360px] sm:px-4">
              {activeSnapshot ? (
                <div className="relative mx-auto flex min-h-full w-full max-w-2xl items-center justify-center py-1">
                  {transitionState?.outgoing ? (
                    <div
                      className={`absolute inset-0 flex items-center justify-center py-1 gui-stage-panel ${
                        transitionState.direction === 'forward'
                          ? 'gui-stage-slide-out-up'
                          : 'gui-stage-slide-out-down'
                      }`}
                    >
                    <GuiSnapshotCard
                      snapshot={transitionState.outgoing}
                      interactive={false}
                      agentActive={false}
                      speaking={false}
                    />
                  </div>
                  ) : null}

                  <div
                    className={`relative flex min-h-full w-full items-center justify-center py-1 gui-stage-panel ${
                      transitionState
                        ? transitionState.direction === 'forward'
                          ? 'gui-stage-slide-in-down'
                          : 'gui-stage-slide-in-up'
                        : ''
                    }`}
                  >
                    <GuiSnapshotCard
                      snapshot={activeSnapshot}
                      interactive={activeSnapshot.isLatest && !interactionLocked}
                      agentActive={Boolean(isAgentTyping && activeSnapshot.isLatest)}
                      speaking={activeSnapshot.linkedAssistantMessageId === speakingMessageId}
                      onSelect={onSelect}
                      onToggle={onToggle}
                      onNext={onNext}
                      onBack={onBack}
                      onStartOver={onStartOver}
                      onConfirm={onConfirm}
                    />
                  </div>
                </div>
              ) : (
                <div className="text-center text-sm text-fg-muted">Loading GUI history...</div>
              )}
            </div>

            <SnapshotNavButton
              direction="next"
              disabled={!canGoToNextSnapshot}
              onClick={() => scrollToSnapshot(activeSnapshotIndex + 1)}
            />
          </div>

        </section>

        <section className="min-h-0 flex flex-1 flex-col overflow-hidden rounded-2xl border border-dark-border bg-dark">
              <button
                type="button"
                onClick={() => setConversationCollapsed((current) => !current)}
                className="flex items-center justify-between gap-4 border-b border-dark-border px-4 py-3 text-left"
                aria-expanded={!conversationCollapsed}
                aria-controls="full-tuning-conversation-panel"
              >
                <div className={conversationCollapsed ? 'min-w-0 flex items-center gap-3' : 'min-w-0'}>
                  <div className={`font-semibold text-fg-strong ${conversationCollapsed ? 'shrink-0 text-base' : 'text-sm'}`}>
                    Conversation
                  </div>
                  {conversationCollapsed ? (
                    <div className="flex min-w-0 items-center gap-2 text-xs text-fg-muted">
                      <span
                        className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.14em] ${collapsedConversationStatus.badgeClass}`}
                      >
                        {collapsedConversationStatus.badge}
                      </span>
                      <span className="truncate">{collapsedConversationStatus.compactText}</span>
                    </div>
                  ) : isAgentTyping ? (
                    <div className="text-xs text-fg-muted">Agent is typing...</div>
                  ) : null}
                </div>
                <span className="text-xs font-medium uppercase tracking-[0.16em] text-fg-muted">
                  {conversationCollapsed ? 'Show' : 'Hide'}
                </span>
              </button>

              <div
                id="full-tuning-conversation-panel"
                ref={timelineContainerRef}
                onScroll={syncActiveSnapshotToScroll}
                className={
                  conversationCollapsed
                    ? 'hidden'
                    : 'min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-4 pt-4'
                }
                style={{ overflowAnchor: 'none' }}
              >
                <div
                  className="mx-auto flex min-h-full w-full max-w-5xl flex-col justify-end pb-4"
                  style={{ paddingTop: `${timelineTopInsetPx}px` }}
                >
                  {timelineRows.map((row) => (
                    <div
                      key={row.id}
                      ref={(node) => {
                        if (node) {
                          rowRefs.current.set(row.id, node);
                        } else {
                          rowRefs.current.delete(row.id);
                        }
                      }}
                    >
                      {row.type === 'agent' ? (
                        <AgentMessage
                          message={row.message}
                          highlighted={row.id === flashSyncRowId}
                          speaking={row.message.id === speakingMessageId}
                        />
                      ) : null}
                      {row.type === 'user' ? (
                        <UserMessage message={row.message} highlighted={row.id === flashSyncRowId} />
                      ) : null}
                      {row.type === 'marker' ? (
                        <TimelineMarkerRow row={row} highlighted={row.id === flashSyncRowId} />
                      ) : null}
                    </div>
                  ))}

                  {isAgentTyping ? <TypingIndicator /> : null}

                  {timelineRows.length === 0 && !isAgentTyping ? (
                    <div className="py-12 text-center text-fg-faint">Loading conversation...</div>
                  ) : null}
                </div>
              </div>

              {onSubmitInput && !conversationCollapsed ? (
                <div className="shrink-0 border-t border-dark-border">
                  <ChatInput
                    chatWidthPx={null}
                    disabled={inputDisabled}
                    placeholder={inputPlaceholder}
                    onSubmit={onSubmitInput}
                    voiceModeEnabled={voiceModeEnabled}
                    voiceStatusLabel={voiceStatusLabel}
                    voiceError={voiceError}
                  />
                </div>
              ) : null}
        </section>
      </div>
    </div>
  );
}

function GuiSnapshotCard({
  snapshot,
  interactive,
  agentActive = false,
  speaking = false,
  onSelect,
  onToggle,
  onNext,
  onBack,
  onStartOver,
  onConfirm,
}: {
  snapshot: GuiSnapshot;
  interactive: boolean;
  agentActive?: boolean;
  speaking?: boolean;
  onSelect?: (id: string) => void;
  onToggle?: (id: string) => void;
  onNext?: () => void;
  onBack?: () => void;
  onStartOver?: () => void;
  onConfirm?: () => void;
}) {
  const frameClass = speaking
    ? 'border-rose-500/70 shadow-[0_0_0_3px_rgba(244,63,94,0.18)]'
    : agentActive
    ? 'border-info-border shadow-[0_0_0_2px_rgba(96,165,250,0.22)]'
    : 'border-dark-border';
  const contextClass = 'mt-2 text-base font-medium leading-7 text-info-text';

  return (
    <div className="w-[400px] max-w-full">
      <SelectionBreadcrumb spec={snapshot.spec} subdued={!interactive} />
      <div
        className={`rounded-2xl border bg-dark p-4 transition-colors ${frameClass}`}
      >
        <div className="mb-4 flex items-start gap-3">
          <div
            className={`mt-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-info-border bg-primary text-primary-fg ${
              agentActive
                ? 'ring-2 ring-blue-400 shadow-[0_0_0_4px_rgba(59,130,246,0.18)]'
                : ''
            }`}
          >
            <svg
              className="h-5 w-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
              />
            </svg>
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-4">
              <span className="min-w-0 text-sm font-semibold text-info-label">
                {getSnapshotContextLabel(snapshot)}
              </span>
              <div className="flex shrink-0 items-center justify-end gap-2 self-start">
                <span className="rounded-full border border-info-border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-info-text">
                  {snapshot.stage}
                </span>
              </div>
            </div>
            <div className={contextClass}>
              {renderMessageText(getSnapshotContextText(snapshot))}
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-dark-border bg-dark-light p-4">
          <div
            className={`transition-opacity duration-200 ${
              interactive ? '' : 'pointer-events-none opacity-65'
            }`}
          >
            <StageRenderer
              spec={snapshot.spec}
              onSelect={interactive && onSelect ? onSelect : () => {}}
              onToggle={interactive && onToggle ? onToggle : () => {}}
              onNext={interactive && onNext ? onNext : () => {}}
              onBack={interactive ? onBack : undefined}
              onStartOver={interactive ? onStartOver : undefined}
              onConfirm={interactive && onConfirm ? onConfirm : () => {}}
              motionProfile="full-tuning"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function SnapshotNavButton({
  direction,
  disabled,
  onClick,
}: {
  direction: 'prev' | 'next';
  disabled: boolean;
  onClick: () => void;
}) {
  const isPrevious = direction === 'prev';

  return (
    <button
      type="button"
      aria-label={isPrevious ? 'Show previous GUI snapshot' : 'Show next GUI snapshot'}
      title={isPrevious ? 'Show previous GUI snapshot' : 'Show next GUI snapshot'}
      disabled={disabled}
      onClick={onClick}
      className="flex h-10 w-16 shrink-0 items-center justify-center self-center rounded-2xl border border-dark-border bg-dark-light text-fg-muted transition-colors hover:border-primary hover:text-fg-strong disabled:cursor-not-allowed disabled:opacity-35 sm:h-11 sm:w-20"
    >
      <svg
        className="h-4 w-4 sm:h-5 sm:w-5"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d={isPrevious ? 'M5 15l7-7 7 7' : 'M19 9l-7 7-7-7'}
        />
      </svg>
    </button>
  );
}

function TimelineMarkerRow({
  row,
  highlighted = false,
}: {
  row: Extract<TimelineRow, { type: 'marker' }>;
  highlighted?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl border px-3 py-3 transition-colors duration-700 ${
        highlighted ? 'border-primary/45 bg-primary/5' : 'border-transparent bg-transparent'
      }`}
      aria-label={`${row.label} (${row.stage})`}
    >
      <div className="flex items-center gap-3 text-[11px] uppercase tracking-[0.18em] text-fg-faint">
        <span className="h-px flex-1 bg-dark-border" />
        <span
          className={`rounded-full px-3 py-1 font-semibold ${
            highlighted
              ? 'border border-primary/45 bg-primary/10 text-primary'
              : 'border border-dark-border bg-dark text-fg-muted'
          }`}
        >
          {row.label}
        </span>
        <span className="h-px flex-1 bg-dark-border" />
      </div>
    </div>
  );
}

function TypingIndicator() {
  return (
    <div className="flex justify-start gap-3 py-4">
      <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-500">
        <svg
          className="h-4 w-4 text-white"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M8 10h.01M12 10h.01M16 10h.01M9 16h6M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
      </div>
      <div className="min-w-0 max-w-[80%]">
        <div className="mb-1 text-sm text-info-label">Agent</div>
        <div
          className="rounded-2xl rounded-tl-sm border border-info-border bg-info-bg px-4 py-3 text-info-text"
          role="status"
          aria-live="polite"
          aria-label="Agent is typing"
        >
          <div className="flex items-center gap-1">
            <span className="typing-dot" />
            <span className="typing-dot typing-dot-delay-1" />
            <span className="typing-dot typing-dot-delay-2" />
          </div>
        </div>
      </div>
    </div>
  );
}
