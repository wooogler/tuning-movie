import {
  useCallback,
  useEffect,
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
import { UserMessage } from './UserMessage';
import { renderMessageText } from './renderMessageText';

interface FullTuningSplitViewProps {
  messages: ChatMessage[];
  activeSpec: UISpec | null;
  isAgentTyping?: boolean;
  inputDisabled?: boolean;
  inputPlaceholder?: string;
  onSubmitInput?: (text: string) => void;
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
const SNAPSHOT_SYNC_ANCHOR_RATIO = 0.62;
const GUI_STAGE_TRANSITION_MS = 420;

type GuiTransitionDirection = 'forward' | 'backward';

interface GuiTransitionState {
  outgoing: GuiSnapshot;
  direction: GuiTransitionDirection;
  incomingId: string;
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
  return snapshot.isLatest ? 'Live GUI' : 'GUI snapshot';
}

function getSnapshotContextText(snapshot: GuiSnapshot): string {
  const linkedAssistantText = snapshot.linkedAssistantText?.trim();
  if (linkedAssistantText) return linkedAssistantText;

  const annotationReason = snapshot.annotation?.reason?.trim();
  if (annotationReason) return annotationReason;

  const actionReason = snapshot.linkedActionTag?.reason?.trim();
  if (actionReason) return actionReason;

  return snapshot.isLatest
    ? 'The latest GUI state is shown here.'
    : 'Scroll the conversation to inspect earlier GUI states.';
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

export function FullTuningSplitView({
  messages,
  activeSpec,
  isAgentTyping = false,
  inputDisabled = true,
  inputPlaceholder = 'Type a message...',
  onSubmitInput,
  onSelect,
  onToggle,
  onNext,
  onBack,
  onStartOver,
  onConfirm,
}: FullTuningSplitViewProps) {
  const timelineContainerRef = useRef<HTMLDivElement | null>(null);
  const rowRefs = useRef(new Map<string, HTMLDivElement>());
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const activeSnapshotRef = useRef<GuiSnapshot | null>(null);
  const activeSnapshotIndexRef = useRef<number>(-1);
  const transitionTimeoutRef = useRef<number | null>(null);

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
        if (message.action !== 'input') continue;
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

  useEffect(() => {
    setActiveSnapshotIndex((current) => {
      if (latestSnapshotIndex < 0) return -1;
      if (current < 0 || current > latestSnapshotIndex) return latestSnapshotIndex;
      return current;
    });
  }, [latestSnapshotIndex]);

  const syncActiveSnapshotToScroll = useCallback(() => {
    const container = timelineContainerRef.current;
    if (!container || timelineRows.length === 0) return;

    const remainingScroll =
      container.scrollHeight - (container.scrollTop + container.clientHeight);
    if (remainingScroll <= SNAPSHOT_SYNC_BOTTOM_THRESHOLD_PX && latestSnapshotIndex >= 0) {
      setActiveSnapshotIndex((current) =>
        current === latestSnapshotIndex ? current : latestSnapshotIndex
      );
      return;
    }

    const containerRect = container.getBoundingClientRect();
    const anchorOffset = Math.max(
      24,
      Math.min(container.clientHeight * SNAPSHOT_SYNC_ANCHOR_RATIO, container.clientHeight - 24)
    );
    const syncAnchorY = containerRect.top + anchorOffset;
    let closestSnapshotIndex = timelineRows[0].snapshotIndex;
    let closestDistance = Number.POSITIVE_INFINITY;

    for (const row of timelineRows) {
      const node = rowRefs.current.get(row.id);
      if (!node) continue;
      const rowRect = node.getBoundingClientRect();
      const rowAnchorY = rowRect.top + Math.min(rowRect.height / 2, 28);
      const distance = Math.abs(rowAnchorY - syncAnchorY);
      if (distance < closestDistance) {
        closestDistance = distance;
        closestSnapshotIndex = row.snapshotIndex;
      }
    }

    setActiveSnapshotIndex((current) =>
      current === closestSnapshotIndex ? current : closestSnapshotIndex
    );
  }, [latestSnapshotIndex, timelineRows]);

  useEffect(() => {
    if (timelineRows.length === 0) return;
    const rafId = requestAnimationFrame(() => {
      syncActiveSnapshotToScroll();
    });
    return () => cancelAnimationFrame(rafId);
  }, [timelineRows, syncActiveSnapshotToScroll]);

  useEffect(() => {
    if (timelineRows.length === 0) return;
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages.length, isAgentTyping, timelineRows.length]);

  const scrollToSnapshot = useCallback(
    (snapshotIndex: number) => {
      const container = timelineContainerRef.current;
      const targetRowId = firstRowIdBySnapshotIndex.get(snapshotIndex);
      const targetNode = targetRowId ? rowRefs.current.get(targetRowId) : null;
      if (!container || !targetNode) return;

      setActiveSnapshotIndex(snapshotIndex);
      container.scrollTo({
        top: Math.max(0, targetNode.offsetTop - 12),
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
    <div className="flex-1 overflow-hidden px-4 py-4">
      <div className="mx-auto grid h-full w-full max-w-6xl min-h-0 grid-rows-[minmax(0,3fr)_minmax(0,2fr)] gap-4">
        <section className="relative min-h-0 rounded-[28px] border border-info-border bg-dark-light p-3 shadow-[0_20px_60px_rgba(0,0,0,0.28)]">
          <div className="absolute right-4 top-4 z-10 rounded-full border border-info-border bg-info-bg px-3 py-1 text-xs font-medium text-info-text shadow-[0_10px_24px_rgba(0,0,0,0.18)]">
            {latestSnapshotIndex >= 0 ? `${activeSnapshotIndex + 1} / ${latestSnapshotIndex + 1}` : '0 / 0'}
          </div>

          <div className="flex h-full items-stretch gap-3">
            <SnapshotNavButton
              direction="prev"
              disabled={!canGoToPreviousSnapshot}
              onClick={() => scrollToSnapshot(activeSnapshotIndex - 1)}
            />

            <div className="flex h-full min-h-[320px] flex-1 items-center justify-center overflow-hidden rounded-[24px] border border-info-border/60 bg-[radial-gradient(circle_at_top,_rgba(59,130,246,0.16),_transparent_58%),linear-gradient(180deg,_rgba(255,255,255,0.04),_rgba(255,255,255,0))] px-3 py-4 sm:min-h-[360px]">
              {activeSnapshot ? (
                <div className="relative h-full w-full max-w-2xl">
                  {transitionState?.outgoing ? (
                    <div
                      className={`absolute inset-0 gui-stage-panel ${
                        transitionState.direction === 'forward'
                          ? 'gui-stage-slide-out-left'
                          : 'gui-stage-slide-out-right'
                      }`}
                    >
                      <GuiSnapshotCard
                        snapshot={transitionState.outgoing}
                        interactive={false}
                      />
                    </div>
                  ) : null}

                  <div
                    className={`relative gui-stage-panel ${
                      transitionState
                        ? transitionState.direction === 'forward'
                          ? 'gui-stage-slide-in-right'
                          : 'gui-stage-slide-in-left'
                        : ''
                    }`}
                  >
                    <GuiSnapshotCard
                      snapshot={activeSnapshot}
                      interactive={activeSnapshot.isLatest}
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

        <section className="min-h-0 flex flex-1 flex-col overflow-hidden rounded-[28px] border border-dark-border bg-dark-light/70 shadow-[0_20px_60px_rgba(0,0,0,0.22)]">
          <div
            ref={timelineContainerRef}
            onScroll={syncActiveSnapshotToScroll}
            className="min-h-0 flex-1 overflow-y-auto px-4 pb-4 pt-4"
          >
            <div className="mx-auto flex min-h-full w-full max-w-5xl flex-col">
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
                  {row.type === 'agent' ? <AgentMessage message={row.message} /> : null}
                  {row.type === 'user' ? <UserMessage message={row.message} /> : null}
                  {row.type === 'marker' ? <TimelineMarkerRow row={row} /> : null}
                </div>
              ))}

              {isAgentTyping ? <TypingIndicator /> : null}

              {timelineRows.length === 0 && !isAgentTyping ? (
                <div className="py-12 text-center text-fg-faint">Loading conversation...</div>
              ) : null}

              <div ref={bottomRef} />
            </div>
          </div>

          {onSubmitInput ? (
            <div className="shrink-0 border-t border-dark-border">
              <ChatInput
                chatWidthPx={null}
                disabled={inputDisabled}
                placeholder={inputPlaceholder}
                onSubmit={onSubmitInput}
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
  onSelect,
  onToggle,
  onNext,
  onBack,
  onStartOver,
  onConfirm,
}: {
  snapshot: GuiSnapshot;
  interactive: boolean;
  onSelect?: (id: string) => void;
  onToggle?: (id: string) => void;
  onNext?: () => void;
  onBack?: () => void;
  onStartOver?: () => void;
  onConfirm?: () => void;
}) {
  return (
    <div className="rounded-[28px] border border-info-border bg-info-bg p-4 shadow-[0_10px_40px_rgba(59,130,246,0.12)]">
      <div className="mb-4 flex items-start gap-3">
        <div className="mt-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-info-border bg-primary text-primary-fg shadow-[0_0_0_4px_rgba(59,130,246,0.12)]">
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
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-info-label">
              {getSnapshotContextLabel(snapshot)}
            </span>
            <span className="rounded-full border border-info-border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-info-text">
              {snapshot.stage}
            </span>
            <span
              className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.16em] ${
                snapshot.isLatest
                  ? 'border-primary/50 text-primary'
                  : 'border-dark-border text-fg-muted'
              }`}
            >
              {snapshot.isLatest ? 'Live' : 'History'}
            </span>
          </div>
          <div className="mt-2 text-base font-medium leading-7 text-info-text">
            {renderMessageText(getSnapshotContextText(snapshot))}
          </div>
        </div>
      </div>

      <div className="rounded-[24px] border border-dark-border bg-dark p-4 shadow-[0_14px_44px_rgba(0,0,0,0.28)]">
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
          />
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
      className="flex w-11 shrink-0 items-center justify-center rounded-[20px] border border-info-border bg-dark text-info-label transition-colors hover:border-info-label hover:text-info-text disabled:cursor-not-allowed disabled:opacity-35"
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
          d={isPrevious ? 'M15 19l-7-7 7-7' : 'M9 5l7 7-7 7'}
        />
      </svg>
    </button>
  );
}

function TimelineMarkerRow({ row }: { row: Extract<TimelineRow, { type: 'marker' }> }) {
  return (
    <div className="py-3" aria-label={`${row.label} (${row.stage})`}>
      <div className="flex items-center gap-3 text-[11px] uppercase tracking-[0.18em] text-fg-faint">
        <span className="h-px flex-1 bg-dark-border" />
        <span className="rounded-full border border-dark-border bg-dark px-3 py-1 font-semibold text-fg-muted">
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
