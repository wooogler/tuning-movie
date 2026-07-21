export function AgentActivityOverlay() {
  return (
    <div
      className="pointer-events-none inline-flex items-center gap-2 px-2 py-1 text-xs font-medium text-info-label/85 [text-shadow:0_1px_6px_rgba(2,6,23,0.28)]"
      role="status"
      aria-live="polite"
      aria-label="Agent is working"
    >
      <span>Agent working</span>
      <div className="flex items-center gap-1 text-info-label/75" aria-hidden="true">
        <span className="typing-dot" />
        <span className="typing-dot typing-dot-delay-1" />
        <span className="typing-dot typing-dot-delay-2" />
      </div>
    </div>
  );
}
