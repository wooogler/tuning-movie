import type { UserMessage as UserMessageType } from '../../store/chatStore';
import type { UISpec } from '../../spec';
import { MessageStageSnapshot } from './MessageStageSnapshot';

interface UserMessageProps {
  message: UserMessageType;
  highlighted?: boolean;
  snapshotSpec?: UISpec | null;
  snapshotIsActive?: boolean;
  snapshotActiveSpec?: UISpec | null;
  onSnapshotSelect?: (id: string) => void;
  onSnapshotToggle?: (id: string) => void;
  onSnapshotNext?: () => void;
  onSnapshotBack?: () => void;
  onSnapshotStartOver?: () => void;
  onSnapshotConfirm?: () => void;
}

export function UserMessage({
  message,
  highlighted = false,
  snapshotSpec = null,
  snapshotIsActive = false,
  snapshotActiveSpec = null,
  onSnapshotSelect,
  onSnapshotToggle,
  onSnapshotNext,
  onSnapshotBack,
  onSnapshotStartOver,
  onSnapshotConfirm,
}: UserMessageProps) {
  const isBack = message.action === 'back';
  const isInput = message.action === 'input';

  return (
    <div className="py-4">
      <div className="flex gap-3 justify-end">
        {/* Message Content */}
        <div className="flex-1 min-w-0 flex flex-col items-end">
          <div
            className={`max-w-[80%] min-w-0 rounded-3xl py-2 transition-colors duration-700 ${
              highlighted ? 'border border-primary/45 bg-primary/5' : 'border border-transparent'
            }`}
          >
            <div className="text-sm text-fg-muted mb-1 text-right">You</div>
            <div
              className={`rounded-2xl px-4 py-2 text-base font-medium whitespace-pre-wrap break-words ${
                isBack
                  ? 'bg-dark-lighter text-fg'
                  : isInput
                  ? 'bg-blue-600 text-white'
                  : 'bg-primary text-primary-fg'
              }`}
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

      {snapshotSpec ? (
        <div className="mt-3 ml-11 max-w-[444px] min-w-0">
          <MessageStageSnapshot
            spec={snapshotSpec}
            isActive={snapshotIsActive}
            activeSpec={snapshotActiveSpec}
            onSelect={onSnapshotSelect}
            onToggle={onSnapshotToggle}
            onNext={onSnapshotNext}
            onBack={onSnapshotBack}
            onStartOver={onSnapshotStartOver}
            onConfirm={onSnapshotConfirm}
          />
        </div>
      ) : null}
    </div>
  );
}
