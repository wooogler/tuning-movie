import type { AgentMessage as AgentMessageType } from '../../store/chatStore';

interface AgentMessageProps {
  message: AgentMessageType;
}

export function AgentMessage({ message }: AgentMessageProps) {
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

      <div className="max-w-[80%]">
        <div className="text-sm text-blue-300 mb-1">Agent</div>
        <div className="rounded-2xl rounded-tl-sm px-4 py-2 bg-blue-500/15 border border-blue-500/40 text-blue-100 whitespace-pre-wrap">
          {message.text}
        </div>
      </div>
    </div>
  );
}
