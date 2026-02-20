import type { SystemMessage as SystemMessageType } from '../../store/chatStore';
import type { UISpec } from '../../spec';
import { StageRenderer } from '../../renderer';

function getToolActionLabel(toolName: string): string {
  switch (toolName) {
    case 'select':
      return 'is selecting';
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
    case 'setQuantity':
      return 'is setting quantities';
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
  linkedAssistantText?: string;
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
  linkedAssistantText,
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
  const annotation = message.annotation;
  const isToolModification = annotation?.kind === 'tool-modification';
  const isAgentControlled = isToolModification && annotation?.source === 'agent';
  const toolDescriptionText =
    typeof linkedAssistantText === 'string' && linkedAssistantText.trim()
      ? linkedAssistantText.trim()
      : annotation?.reason ?? '';
  const titleClass = isActive ? 'text-fg-strong font-medium mb-1' : 'text-fg-faint font-medium mb-1';
  const descriptionClass = isActive ? 'text-fg-muted text-sm mb-3' : 'text-fg-faint text-sm mb-3';
  const stageCard = (
    <div className="bg-dark border border-dark-border rounded-2xl rounded-tl-sm px-4 py-3">
      {/* Stage Title */}
      <div className={titleClass}>{spec.title}</div>
      {spec.description && (
        <div className={descriptionClass}>{spec.description}</div>
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
  );

  return (
    <div className="flex gap-3 py-4 justify-start">
      {/* System Avatar */}
      <div
        className={`flex-shrink-0 w-8 h-8 rounded-full bg-primary flex items-center justify-center self-start mt-1 ${
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

      {/* Message Content */}
      <div className="max-w-[85%] min-w-0">
        {isToolModification ? (
          <div className="-mr-3 rounded-2xl rounded-tl-sm p-3 bg-info-bg border border-info-border">
            {annotation ? (
              <div className="w-0 min-w-full">
                <div className="text-info-label text-xs font-semibold mb-1">
                  {annotation.source === 'devtools' ? 'DevTools' : 'Agent'}{' '}
                  {getToolActionLabel(annotation.toolName)}
                </div>
                {toolDescriptionText ? (
                  <div className="text-info-text text-base font-medium mb-3 whitespace-pre-wrap break-words">
                    {toolDescriptionText}
                  </div>
                ) : null}
              </div>
            ) : null}
            {stageCard}
          </div>
        ) : (
          stageCard
        )}
      </div>
    </div>
  );
}
