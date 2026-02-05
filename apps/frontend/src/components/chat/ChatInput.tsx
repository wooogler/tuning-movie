interface ChatInputProps {
  disabled?: boolean;
  placeholder?: string;
}

export function ChatInput({
  disabled = true,
  placeholder = 'Type a message...',
}: ChatInputProps) {
  return (
    <div className="border-t border-gray-700 bg-dark p-4">
      <div className="max-w-3xl mx-auto">
        <div className="flex gap-3 items-center">
          <input
            type="text"
            disabled={disabled}
            placeholder={placeholder}
            className={`flex-1 bg-dark-light border border-gray-700 rounded-full px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-primary ${
              disabled ? 'opacity-50 cursor-not-allowed' : ''
            }`}
          />
          <button
            disabled={disabled}
            className={`w-10 h-10 rounded-full bg-primary flex items-center justify-center ${
              disabled ? 'opacity-50 cursor-not-allowed' : 'hover:bg-primary/80'
            }`}
          >
            <svg
              className="w-5 h-5 text-dark"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
              />
            </svg>
          </button>
        </div>
        {disabled && (
          <div className="text-center text-gray-500 text-xs mt-2">
            Text input coming soon
          </div>
        )}
      </div>
    </div>
  );
}
