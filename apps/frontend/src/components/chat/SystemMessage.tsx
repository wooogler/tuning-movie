import type { SystemMessage as SystemMessageType } from '../../store/chatStore';
import type { UISpec } from '../../spec';
import { StageRenderer } from '../../renderer';

interface SystemMessageProps {
  message: SystemMessageType;
  isActive: boolean;
  onSelect?: (id: string) => void;
  onToggle?: (id: string) => void;
  onQuantityChange?: (typeId: string, quantity: number) => void;
  onNext?: () => void;
  onBack?: () => void;
  onConfirm?: () => void;
  /** Override spec for active message (to reflect live selections) */
  activeSpec?: UISpec | null;
}

export function SystemMessage({
  message,
  isActive,
  onSelect,
  onToggle,
  onQuantityChange,
  onNext,
  onBack,
  onConfirm,
  activeSpec,
}: SystemMessageProps) {
  // Use activeSpec for the active message, otherwise use message's spec
  const spec = isActive && activeSpec ? activeSpec : message.spec;

  return (
    <div className="flex gap-3 py-4 justify-start">
      {/* System Avatar */}
      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary flex items-center justify-center self-start mt-1">
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
            d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
          />
        </svg>
      </div>

      {/* Message Content */}
      <div className="max-w-[85%]">
        {/* Message Bubble */}
        <div className="bg-dark-light rounded-2xl rounded-tl-sm px-4 py-3">
          {/* Stage Title */}
          <div className="text-white font-medium mb-1">{spec.title}</div>
          {spec.description && (
            <div className="text-gray-400 text-sm mb-3">{spec.description}</div>
          )}

          {/* Stage Component */}
          <div
            className={`transition-opacity ${
              !isActive ? 'opacity-50 pointer-events-none' : ''
            }`}
          >
            <StageRenderer
              spec={spec}
              onSelect={isActive && onSelect ? onSelect : () => {}}
              onToggle={isActive && onToggle ? onToggle : () => {}}
              onQuantityChange={isActive && onQuantityChange ? onQuantityChange : () => {}}
              onNext={isActive && onNext ? onNext : () => {}}
              onBack={isActive && onBack ? onBack : undefined}
              onConfirm={isActive && onConfirm ? onConfirm : () => {}}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
