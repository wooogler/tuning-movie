import type { AgentMessage as AgentMessageType } from '../../store/chatStore';
import type { UISpec } from '../../spec';
import { renderMessageText } from './renderMessageText';
import { MessageStageSnapshot } from './MessageStageSnapshot';

interface AgentMessageProps {
  message: AgentMessageType;
  highlighted?: boolean;
  speaking?: boolean;
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

export function AgentMessage({
  message,
  highlighted = false,
  speaking = false,
  snapshotSpec = null,
  snapshotIsActive = false,
  snapshotActiveSpec = null,
  onSnapshotSelect,
  onSnapshotToggle,
  onSnapshotNext,
  onSnapshotBack,
  onSnapshotStartOver,
  onSnapshotConfirm,
}: AgentMessageProps) {
  const actionTag = message.actionTag;
  const containerClass = highlighted
    ? 'border border-primary/45 bg-primary/5'
    : 'border border-transparent';
  const bubbleClass = speaking
    ? 'border border-rose-400/70 bg-rose-500/[0.08] text-info-text'
    : 'border border-info-border bg-info-bg text-info-text';

  return (
    <div className="flex gap-3 py-4 justify-start">
      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center self-start mt-1">
        <svg
          className="w-4 h-4 text-white"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M8 10h.01M12 10h.01M16 10h.01M9 16h6M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
      </div>

      <div className="flex-1 min-w-0">
        <div
          className={`max-w-[80%] min-w-0 rounded-3xl py-2 transition-colors duration-700 ${containerClass}`}
        >
          <div className="text-sm text-info-label mb-1 flex items-center gap-2">
            <span>Agent</span>
            {actionTag ? (
              <span
                className="text-[11px] uppercase tracking-wide rounded-full px-2 py-0.5 border border-info-border text-info-text bg-info-bg"
                title={actionTag.reason}
              >
                {actionTag.toolName}
              </span>
            ) : null}
          </div>
          <div
            className={`rounded-2xl rounded-tl-sm px-4 py-2 text-base font-medium whitespace-pre-wrap break-words ${bubbleClass}`}
          >
            {renderMessageText(message.text)}
          </div>
        </div>
        {snapshotSpec ? (
          <div className="mt-3">
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
    </div>
  );
}
