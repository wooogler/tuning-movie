import type { UserMessage as UserMessageType } from '../../store/chatStore';

interface UserMessageProps {
  message: UserMessageType;
}

export function UserMessage({ message }: UserMessageProps) {
  const isBack = message.action === 'back';
  const isInput = message.action === 'input';

  return (
    <div className="flex gap-3 py-4 justify-end">
      {/* Message Content */}
      <div className="max-w-[80%]">
        <div className="text-sm text-fg-muted mb-1 text-right">You</div>
        <div
          className={`rounded-2xl px-4 py-2 ${
            isBack
              ? 'bg-dark-lighter text-fg'
              : isInput
              ? 'bg-blue-600 text-white'
              : 'bg-primary text-primary-fg'
          }`}
        >
          <span className="font-medium">{message.label}</span>
          {message.action === 'select' && (
            <span className="ml-2">✓</span>
          )}
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
  );
}
