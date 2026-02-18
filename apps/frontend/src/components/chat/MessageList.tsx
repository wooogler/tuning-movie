import { useEffect, useRef } from 'react';
import type { ChatMessage } from '../../store/chatStore';
import type { UISpec } from '../../spec';
import { SystemMessage } from './SystemMessage';
import { UserMessage } from './UserMessage';
import { AgentMessage } from './AgentMessage';

interface MessageListProps {
  messages: ChatMessage[];
  activeSpec: UISpec | null;
  onSelect?: (id: string) => void;
  onToggle?: (id: string) => void;
  onQuantityChange?: (typeId: string, quantity: number) => void;
  onNext?: () => void;
  onBack?: () => void;
  onConfirm?: () => void;
}

export function MessageList({
  messages,
  activeSpec,
  onSelect,
  onToggle,
  onQuantityChange,
  onNext,
  onBack,
  onConfirm,
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
  }, [messages.length]);

  // Find the last system message index (the active one)
  const lastSystemIndex = messages.reduce(
    (lastIdx, msg, idx) => (msg.type === 'system' ? idx : lastIdx),
    -1
  );

  return (
    <div className="flex-1 overflow-y-auto px-4">
      <div className="max-w-3xl mx-auto py-4">
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
                onQuantityChange={onQuantityChange}
                onNext={onNext}
                onBack={onBack}
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

        {/* Empty state */}
        {messages.length === 0 && (
          <div className="text-center text-gray-500 py-12">
            Loading...
          </div>
        )}

        {/* Scroll anchor */}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
