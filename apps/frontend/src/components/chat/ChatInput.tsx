import { useState } from 'react';

interface ChatInputProps {
  disabled?: boolean;
  placeholder?: string;
  statusLabel?: string;
  statusDetail?: string;
  statusTone?: 'default' | 'warning' | 'success';
  chatWidthPx?: number;
  onSubmit?: (text: string) => void;
}

export function ChatInput({
  disabled = true,
  placeholder = 'Type a message...',
  statusLabel,
  statusDetail,
  statusTone = 'default',
  chatWidthPx = 768,
  onSubmit,
}: ChatInputProps) {
  const [text, setText] = useState('');

  const handleSubmit = () => {
    const trimmed = text.trim();
    if (!trimmed || disabled) return;
    onSubmit?.(trimmed);
    setText('');
  };

  return (
    <div className="border-t border-dark-border bg-dark p-4">
      <div className="mx-auto" style={{ width: `min(100%, ${chatWidthPx}px)` }}>
        {(statusLabel || statusDetail) && (
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs">
            {statusLabel && (
              <span
                className={
                  statusTone === 'warning'
                    ? 'text-yellow-400'
                    : statusTone === 'success'
                    ? 'text-info-label'
                    : 'text-fg-faint'
                }
              >
                {statusLabel}
              </span>
            )}
            {statusDetail && <span className="text-fg-faint">{statusDetail}</span>}
          </div>
        )}
        <div className="flex gap-3 items-center">
          <input
            type="text"
            disabled={disabled}
            placeholder={placeholder}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleSubmit();
              }
            }}
            className={`flex-1 bg-dark-light border border-dark-border rounded-full px-4 py-3 text-fg-strong placeholder-fg-faint focus:outline-none focus:border-primary ${
              disabled ? 'opacity-50 cursor-not-allowed' : ''
            }`}
          />
          <button
            disabled={disabled}
            onClick={handleSubmit}
            className={`w-10 h-10 rounded-full bg-primary flex items-center justify-center ${
              disabled ? 'opacity-50 cursor-not-allowed' : 'hover:bg-primary/80'
            }`}
          >
            <svg
              className="w-5 h-5 text-primary-fg"
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
          <div className="text-center text-fg-faint text-xs mt-2">
            Input is currently disabled
          </div>
        )}
      </div>
    </div>
  );
}
