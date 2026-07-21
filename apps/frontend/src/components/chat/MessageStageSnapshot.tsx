import type { SystemMessage as SystemMessageType } from '../../store/chatStore';
import type { UISpec } from '../../spec';
import { SystemMessage } from './SystemMessage';

interface MessageStageSnapshotProps {
  spec: UISpec;
  isActive?: boolean;
  activeSpec?: UISpec | null;
  onSelect?: (id: string) => void;
  onToggle?: (id: string) => void;
  onNext?: () => void;
  onFinishTask?: () => void;
  onBack?: () => void;
  onConfirm?: () => void;
  interactionLocked?: boolean;
}

export function MessageStageSnapshot({
  spec,
  isActive = false,
  activeSpec = null,
  onSelect,
  onToggle,
  onNext,
  onFinishTask,
  onBack,
  onConfirm,
  interactionLocked = false,
}: MessageStageSnapshotProps) {
  const message: SystemMessageType = {
    id: `snapshot-${spec.stage}-${spec.title}`,
    type: 'system',
    timestamp: 0,
    stage: spec.stage,
    spec,
  };

  return (
    <div className="w-full max-w-[444px] min-w-0">
      <SystemMessage
        message={message}
        isActive={isActive}
        showAvatar={false}
        activeSpec={isActive ? activeSpec : null}
        onSelect={onSelect}
        onToggle={onToggle}
        onNext={onNext}
        onFinishTask={onFinishTask}
        onBack={onBack}
        onConfirm={onConfirm}
        interactionLocked={interactionLocked}
      />
    </div>
  );
}
