import type { UserMessage as UserMessageType } from '../../store/chatStore';

interface UserMessageProps {
  message: UserMessageType;
  highlighted?: boolean;
  syncAnchorRef?: (node: HTMLDivElement | null) => void;
}

export function UserMessage({
  message,
  highlighted = false,
  syncAnchorRef,
}: UserMessageProps) {
  const isBack = message.action === 'back';
  const isInput = message.action === 'input';
  const bubbleClass = highlighted
    ? 'timeline-sync-pulse border border-primary/45 bg-primary/5 text-fg-strong'
    : isBack
    ? 'border border-dark-border bg-dark-lighter text-fg'
    : isInput
    ? 'border border-blue-500/70 bg-blue-600 text-white'
    : 'border border-primary/70 bg-primary text-primary-fg';

  return (
    <div className="py-4">
      <div className="flex gap-3 justify-end">
        {/* Message Content */}
        <div className="flex-1 min-w-0 flex flex-col items-end">
          <div ref={syncAnchorRef} className="max-w-[80%] min-w-0 rounded-2xl">
            <div className="text-sm text-fg-muted mb-1 text-right">You</div>
            <div
              className={`rounded-2xl px-4 py-2 text-base font-medium whitespace-pre-wrap break-words transition-colors duration-700 ${bubbleClass}`}
            >
              <span>{message.label}</span>
              {message.action === 'select' && (
                <span className="ml-2">✓</span>
              )}
            </div>
          </div>
        </div>

        {/* User Avatar */}
        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-dark-border flex items-center justify-center">
          <svg
            className="w-5 h-5 text-fg"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
            />
          </svg>
        </div>
      </div>
    </div>
  );
}
