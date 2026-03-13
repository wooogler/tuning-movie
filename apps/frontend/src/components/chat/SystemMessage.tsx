import type { SystemMessage as SystemMessageType } from '../../store/chatStore';
import type { UISpec } from '../../spec';
import { StageRenderer } from '../../renderer';
import { renderMessageText } from './renderMessageText';
import { SelectionBreadcrumb } from './SelectionBreadcrumb';

function getToolActionLabel(toolName: string): string {
  switch (toolName) {
    case 'select':
      return 'is selecting';
    case 'selectMultiple':
      return 'is selecting multiple seats';
    case 'filter':
      return 'is filtering';
    case 'sort':
      return 'is sorting';
    case 'highlight':
      return 'is highlighting';
    case 'augment':
      return 'is updating labels';
    case 'clearModification':
      return 'is clearing modifications';
    case 'next':
      return 'is moving to the next step';
    case 'prev':
      return 'is going back';
    default:
      return `is applying ${toolName}`;
  }
}

interface SystemMessageProps {
  message: SystemMessageType;
  isActive: boolean;
  showAvatar?: boolean;
  linkedAssistantText?: string;
  linkedAssistantSpeaking?: boolean;
  onSelect?: (id: string) => void;
  onToggle?: (id: string) => void;
  onNext?: () => void;
  onBack?: () => void;
  onStartOver?: () => void;
  onConfirm?: () => void;
  /** Override spec for active message (to reflect live selections) */
  activeSpec?: UISpec | null;
}

export function SystemMessage({
  message,
  isActive,
  showAvatar = true,
  linkedAssistantText,
  linkedAssistantSpeaking = false,
  onSelect,
  onToggle,
  onNext,
  onBack,
  onStartOver,
  onConfirm,
  activeSpec,
}: SystemMessageProps) {
  // Use activeSpec for the active message, otherwise use message's spec
  const spec = isActive && activeSpec ? activeSpec : message.spec;
  const annotation = message.annotation;
  const isToolModification = annotation?.kind === 'tool-modification';
  const isAgentControlled = isToolModification && annotation?.source === 'agent';
  const toolDescriptionText =
    typeof linkedAssistantText === 'string' && linkedAssistantText.trim()
      ? linkedAssistantText.trim()
      : annotation?.reason ?? '';
  const toolDescriptionClass = 'mb-3 whitespace-pre-wrap break-words text-base font-medium text-info-text';
  const titleClass = isActive ? 'text-fg-strong font-medium mb-1' : 'text-fg-faint font-medium mb-1';
  const descriptionClass = isActive ? 'text-fg-muted text-sm mb-3' : 'text-fg-faint text-sm mb-3';
  const breadcrumb = <SelectionBreadcrumb spec={spec} subdued={!isActive} />;
  const breadcrumbWrapperClass = showAvatar ? 'ml-11 min-w-0' : 'min-w-0';
  const stageCardClass = linkedAssistantSpeaking
    ? 'w-[400px] max-w-[calc(100%-2.75rem)] min-w-0 rounded-2xl rounded-tl-sm border border-rose-500/70 bg-dark px-4 py-3 shadow-[0_0_0_3px_rgba(244,63,94,0.18)]'
    : 'w-[400px] max-w-[calc(100%-2.75rem)] min-w-0 rounded-2xl rounded-tl-sm border border-dark-border bg-dark px-4 py-3';
  const stageCardShellClass = showAvatar ? 'flex items-start gap-3' : '';
  const stageCardContent = (
    <div className="w-full max-w-[444px] min-w-0">
      <div className={stageCardShellClass}>
        {showAvatar ? (
          <div
            className={`mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary ${
              isAgentControlled ? 'ring-2 ring-blue-400 shadow-[0_0_0_3px_rgba(59,130,246,0.2)]' : ''
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
                d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
              />
            </svg>
          </div>
        ) : null}
        <div className={stageCardClass}>
          <div className={titleClass}>{spec.title}</div>
          {spec.description && (
            <div className={descriptionClass}>{spec.description}</div>
          )}

          <div
            className={`transition-opacity ${
              !isActive ? 'opacity-50 pointer-events-none' : ''
            }`}
          >
            <StageRenderer
              spec={spec}
              onSelect={isActive && onSelect ? onSelect : () => {}}
              onToggle={isActive && onToggle ? onToggle : () => {}}
              onNext={isActive && onNext ? onNext : () => {}}
              onBack={isActive && onBack ? onBack : undefined}
              onStartOver={isActive && onStartOver ? onStartOver : undefined}
              onConfirm={isActive && onConfirm ? onConfirm : () => {}}
            />
          </div>
        </div>
      </div>
    </div>
  );
  const stageCard = (
    <div className="w-full max-w-[444px] min-w-0">
      <div className={breadcrumbWrapperClass}>
        {breadcrumb}
      </div>
      {stageCardContent}
    </div>
  );

  return (
    <div className="py-4">
      <div className="max-w-full min-w-0">
        {isToolModification ? (
          <div className="w-full max-w-[444px] min-w-0">
            {breadcrumb}
            <div className="-mr-3 rounded-2xl rounded-tl-sm border border-info-border bg-info-bg p-3 transition-colors">
              {annotation ? (
                <div className="w-0 min-w-full">
                  <div className="mb-1 text-info-label text-xs font-semibold">
                    <span>
                      {annotation.source === 'devtools' ? 'DevTools' : 'Agent'}{' '}
                      {getToolActionLabel(annotation.toolName)}
                    </span>
                  </div>
                  {toolDescriptionText ? (
                    <div className={toolDescriptionClass}>
                      {renderMessageText(toolDescriptionText)}
                    </div>
                  ) : null}
                </div>
              ) : null}
              {stageCardContent}
            </div>
          </div>
        ) : (
          stageCard
        )}
      </div>
    </div>
  );
}
