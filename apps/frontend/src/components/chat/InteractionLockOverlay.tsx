import { AgentActivityOverlay } from './AgentActivityOverlay';

interface InteractionLockOverlayProps {
  label?: string;
}

export function InteractionLockOverlay({
  label = 'Waiting for the next agent message...',
}: InteractionLockOverlayProps) {
  return (
    <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-2xl bg-dark/50 backdrop-blur-[1px]">
      <div className="rounded-2xl border border-info-border/70 bg-dark/90 px-4 py-3 shadow-[0_10px_30px_rgba(2,6,23,0.35)]">
        <div className="flex justify-center">
          <AgentActivityOverlay />
        </div>
        <div className="mt-1 text-center text-xs text-fg-muted">{label}</div>
      </div>
    </div>
  );
}
