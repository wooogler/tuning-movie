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
  voiceModeEnabled?: boolean;
  voiceStatusLabel?: string | null;
  voiceError?: string | null;
}

export function ChatInput({
  disabled = true,
  placeholder = 'Type a message...',
  chatWidthPx = 768,
  onSubmit,
  voiceModeEnabled = false,
  voiceStatusLabel = null,
  voiceError = null,
}: ChatInputProps) {
  const [text, setText] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const shouldRestoreFocusRef = useRef(false);
  const previousDisabledRef = useRef(disabled);
  const isInputReady = !disabled;
  const isVoiceInputHighlighted = isInputReady && voiceModeEnabled;

  const handleSubmit = () => {
    const trimmed = text.trim();
    if (!trimmed || disabled) return;
    shouldRestoreFocusRef.current = true;
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

  useLayoutEffect(() => {
    const wasDisabled = previousDisabledRef.current;
    previousDisabledRef.current = disabled;

    if (disabled || !wasDisabled || !shouldRestoreFocusRef.current) return;

    const element = textareaRef.current;
    if (!element) return;

    element.focus();
    const cursorPosition = element.value.length;
    element.setSelectionRange(cursorPosition, cursorPosition);
    shouldRestoreFocusRef.current = false;
  }, [disabled]);

  return (
    <div className="border-t border-dark-border bg-dark p-4">
      <div
        className="mx-auto w-full"
        style={chatWidthPx ? { width: `min(100%, ${chatWidthPx}px)` } : undefined}
      >
        {(voiceModeEnabled || voiceStatusLabel || voiceError) && (
          <div className="mb-2 flex flex-wrap items-center gap-2 px-2 text-xs">
            {voiceModeEnabled && (
              <span className="rounded-full border border-info-border bg-info-bg px-2 py-1 text-info-text">
                Voice mode
              </span>
            )}
            {voiceStatusLabel && (
              <span className="text-fg-muted">{voiceStatusLabel}</span>
            )}
            {voiceError && (
              <span className="text-primary">{voiceError}</span>
            )}
          </div>
        )}
        <div
          className={`rounded-[30px] p-1 transition-[background-color,border-color,box-shadow] duration-200 ${
            isVoiceInputHighlighted
              ? 'border border-rose-500/70 bg-rose-500/[0.08] shadow-[0_0_0_3px_rgba(244,63,94,0.18)]'
              : 'border border-transparent'
          }`}
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
              className={`flex-1 resize-none rounded-3xl border bg-dark-light px-4 py-3 leading-6 text-fg-strong placeholder-fg-faint transition-colors focus:outline-none ${
                isVoiceInputHighlighted
                  ? 'border-rose-400/70 focus:border-rose-300'
                  : 'border-dark-border focus:border-primary'
              } ${disabled ? 'cursor-not-allowed opacity-50' : ''}`}
            />
            <button
              disabled={disabled}
              onClick={handleSubmit}
              className={`self-center flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-colors ${
                isVoiceInputHighlighted
                  ? 'bg-rose-500 text-white hover:bg-rose-400'
                  : 'bg-primary text-primary-fg'
              } ${disabled ? 'cursor-not-allowed opacity-50' : ''}`}
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
                  d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
                />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
