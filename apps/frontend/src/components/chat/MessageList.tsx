import { useEffect, useRef, type PointerEvent as ReactPointerEvent } from 'react';
import type { ChatMessage } from '../../store/chatStore';
import type { UISpec } from '../../spec';
import { SystemMessage } from './SystemMessage';
import { UserMessage } from './UserMessage';
import { AgentMessage } from './AgentMessage';

interface MessageListProps {
  messages: ChatMessage[];
  activeSpec: UISpec | null;
  isAgentTyping?: boolean;
  onSelect?: (id: string) => void;
  onToggle?: (id: string) => void;
  onNext?: () => void;
  onBack?: () => void;
  onStartOver?: () => void;
  onConfirm?: () => void;
  chatWidthPx?: number;
  isResizingWidth?: boolean;
  onResizeStart?: (event: ReactPointerEvent<HTMLButtonElement>) => void;
}

export function MessageList({
  messages,
  activeSpec,
  isAgentTyping = false,
  onSelect,
  onToggle,
  onNext,
  onBack,
  onStartOver,
  onConfirm,
  chatWidthPx = 768,
  isResizingWidth = false,
  onResizeStart,
}: MessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  const isToolLinkedAgentMessage = (index: number): boolean => {
    const current = messages[index];
    const next = messages[index + 1];
    if (!current || !next) return false;
    if (current.type !== 'agent' || next.type !== 'system') return false;
    if (next.annotation?.kind !== 'tool-modification') return false;
    if (next.annotation.source !== 'agent') return false;
    return current.stage === next.stage;
  };

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, isAgentTyping]);

  // Find the last system message index (the active one)
  const lastSystemIndex = messages.reduce(
    (lastIdx, msg, idx) => (msg.type === 'system' ? idx : lastIdx),
    -1
  );

  return (
    <div className="flex-1 overflow-y-auto px-4">
      <div className="relative mx-auto py-4" style={{ width: `min(100%, ${chatWidthPx}px)` }}>
        {onResizeStart && (
          <button
            type="button"
            onPointerDown={onResizeStart}
            aria-label="Resize chat width"
            title="Drag to resize chat width"
            className="absolute right-0 top-0 hidden h-full w-4 translate-x-full cursor-ew-resize sm:flex"
          >
            <span
              className={`absolute left-1/2 top-[38%] h-12 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full transition-colors ${
                isResizingWidth ? 'bg-primary' : 'bg-dark-border hover:bg-dark-lighter'
              }`}
            />
          </button>
        )}
        {messages.map((message, index) => {
          if (message.type === 'system') {
            const isActive = index === lastSystemIndex;
            const previous = index > 0 ? messages[index - 1] : null;
            const linkedAssistantText =
              previous && previous.type === 'agent' && isToolLinkedAgentMessage(index - 1)
                ? previous.text
                : undefined;
            return (
              <SystemMessage
                key={message.id}
                message={message}
                isActive={isActive}
                linkedAssistantText={linkedAssistantText}
                activeSpec={isActive ? activeSpec : null}
                onSelect={onSelect}
                onToggle={onToggle}
                onNext={onNext}
                onBack={onBack}
                onStartOver={onStartOver}
                onConfirm={onConfirm}
              />
            );
          }

          if (message.type === 'user') {
            return <UserMessage key={message.id} message={message} />;
          }

          if (isToolLinkedAgentMessage(index)) {
            return null;
          }

          return <AgentMessage key={message.id} message={message} />;
        })}

        {isAgentTyping && (
          <div className="flex gap-3 py-4 justify-start">
            <div className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center self-start mt-1">
              <svg
                className="w-4 h-4 text-white"
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
            <div className="max-w-[80%] min-w-0">
              <div className="text-sm text-info-label mb-1">Agent</div>
              <div
                className="rounded-2xl rounded-tl-sm px-4 py-3 bg-info-bg border border-info-border text-info-text"
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
        )}

        {/* Empty state */}
        {messages.length === 0 && (
          <div className="text-center text-fg-faint py-12">
            Loading...
          </div>
        )}

        {/* Scroll anchor */}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
