import type { UserMessage as UserMessageType } from '../../store/chatStore';

interface UserMessageProps {
  message: UserMessageType;
}

export function UserMessage({ message }: UserMessageProps) {
  const isBack = message.action === 'back';

  return (
    <div className="flex gap-3 py-4 justify-end">
      {/* Message Content */}
      <div className="max-w-[80%]">
        <div className="text-sm text-gray-400 mb-1 text-right">You</div>
        <div
          className={`rounded-2xl px-4 py-2 ${
            isBack
              ? 'bg-gray-700 text-gray-300'
              : 'bg-primary text-dark'
          }`}
        >
          <span className="font-medium">{message.label}</span>
          {!isBack && (
            <span className="ml-2">✓</span>
          )}
        </div>
      </div>

      {/* User Avatar */}
      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gray-600 flex items-center justify-center">
        <svg
          className="w-5 h-5 text-gray-300"
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
