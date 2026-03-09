import { useLayoutEffect, useRef, useState } from 'react';

const MAX_TEXTAREA_HEIGHT_PX = 160;

function resizeTextareaToContent(element: HTMLTextAreaElement) {
  element.style.height = '0px';
  const nextHeight = Math.min(element.scrollHeight, MAX_TEXTAREA_HEIGHT_PX);
  element.style.height = `${nextHeight}px`;
  element.style.overflowY =
    element.scrollHeight > MAX_TEXTAREA_HEIGHT_PX ? 'auto' : 'hidden';
}

interface ChatInputProps {
  disabled?: boolean;
  placeholder?: string;
  chatWidthPx?: number | null;
  onSubmit?: (text: string) => void;
}

export function ChatInput({
  disabled = true,
  placeholder = 'Type a message...',
  chatWidthPx = 768,
  onSubmit,
}: ChatInputProps) {
  const [text, setText] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const handleSubmit = () => {
    const trimmed = text.trim();
    if (!trimmed || disabled) return;
    onSubmit?.(trimmed);
    setText('');
  };

  useLayoutEffect(() => {
    const element = textareaRef.current;
    if (!element) return;
    resizeTextareaToContent(element);
  }, [chatWidthPx, text]);

  useLayoutEffect(() => {
    const element = textareaRef.current;
    if (!element || typeof ResizeObserver === 'undefined') return;

    let previousWidth = element.clientWidth;
    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return;
      const nextWidth = entry.contentRect.width;
      if (nextWidth === previousWidth) return;
      previousWidth = nextWidth;
      resizeTextareaToContent(element);
    });

    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return (
    <div className="border-t border-dark-border bg-dark p-4">
      <div
        className="mx-auto w-full"
        style={chatWidthPx ? { width: `min(100%, ${chatWidthPx}px)` } : undefined}
      >
        <div className="flex items-end gap-3">
          <textarea
            ref={textareaRef}
            rows={1}
            disabled={disabled}
            placeholder={placeholder}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSubmit();
              }
            }}
            className={`flex-1 resize-none bg-dark-light border border-dark-border rounded-3xl px-4 py-3 text-fg-strong placeholder-fg-faint leading-6 focus:outline-none focus:border-primary ${
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
      </div>
    </div>
  );
}
