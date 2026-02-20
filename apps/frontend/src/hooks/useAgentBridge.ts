import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ToolDefinition } from '../agent/tools';
import { PROTOCOL_VERSION, type RelayEnvelope, type SnapshotPayload } from '../agent/protocol';
import type { UISpec, Stage } from '../spec';
import type { ChatMessage } from '../store/chatStore';
import type { ToolApplyContext } from '../components/devToolsContextShared';

interface UseAgentBridgeOptions {
  uiSpec: UISpec | null;
  messageHistory: ChatMessage[];
  toolSchema: ToolDefinition[];
  onToolCall: (
    toolName: string,
    params: Record<string, unknown>,
    context?: ToolApplyContext
  ) => UISpec | null | void;
  onAgentMessage: (text: string) => void;
  onSessionEnd: () => void;
  enabled?: boolean;
}

interface UseAgentBridgeResult {
  sendUserMessageToAgent: (text: string, stage: Stage) => void;
  sendSessionResetToAgent: (reason?: string) => void;
  isConnected: boolean;
  isJoined: boolean;
  joinedSessionId: string | null;
  connectedAgents: Array<{ id: string; name: string }>;
}

function buildWsUrl(): string {
  const configured = import.meta.env.VITE_AGENT_WS_URL as string | undefined;
  const endpoint =
    configured && configured.trim()
      ? configured.trim()
      : import.meta.env.DEV
      ? 'ws://localhost:3000/agent/ws'
      : '/agent/ws';

  if (/^wss?:\/\//.test(endpoint)) {
    return endpoint;
  }

  const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
  const basePath = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  return `${protocol}://${window.location.host}${basePath}`;
}

function parseEnvelope(raw: unknown): RelayEnvelope | null {
  if (!(raw instanceof MessageEvent)) return null;
  if (typeof raw.data !== 'string') return null;

  try {
    const parsed = JSON.parse(raw.data) as RelayEnvelope;
    if (!parsed || typeof parsed !== 'object' || typeof parsed.type !== 'string') {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function isUiSpec(value: unknown): value is UISpec {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const candidate = value as Partial<UISpec>;
  return typeof candidate.stage === 'string' && typeof candidate.state === 'object';
}

export function useAgentBridge({
  uiSpec,
  messageHistory,
  toolSchema,
  onToolCall,
  onAgentMessage,
  onSessionEnd,
  enabled = true,
}: UseAgentBridgeOptions): UseAgentBridgeResult {
  const [isConnected, setIsConnected] = useState(false);
  const [isJoined, setIsJoined] = useState(false);
  const [joinedSessionId, setJoinedSessionId] = useState<string | null>(null);
  const [connectedAgents, setConnectedAgents] = useState<Array<{ id: string; name: string }>>([]);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);
  const sessionIdRef = useRef<string>((import.meta.env.VITE_AGENT_SESSION_ID as string) || 'default');
  const enabledRef = useRef(enabled);
  const latestRef = useRef({
    uiSpec,
    messageHistory,
    toolSchema,
    onToolCall,
    onAgentMessage,
    onSessionEnd,
  });

  useEffect(() => {
    latestRef.current = {
      uiSpec,
      messageHistory,
      toolSchema,
      onToolCall,
      onAgentMessage,
      onSessionEnd,
    };
  }, [uiSpec, messageHistory, toolSchema, onToolCall, onAgentMessage, onSessionEnd]);

  useEffect(() => {
    enabledRef.current = enabled;
  }, [enabled]);

  const wsUrl = useMemo(() => buildWsUrl(), []);

  const sendEnvelope = useCallback((envelope: RelayEnvelope) => {
    if (!enabledRef.current) return false;
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return false;
    ws.send(JSON.stringify({ v: PROTOCOL_VERSION, ...envelope }));
    return true;
  }, []);

  const getSnapshotPayload = useCallback((): SnapshotPayload => {
    const current = latestRef.current;
    return {
      sessionId: sessionIdRef.current,
      uiSpec: current.uiSpec,
      messageHistory: current.messageHistory,
      toolSchema: current.toolSchema,
    };
  }, []);

  const handleEnvelope = useCallback((message: RelayEnvelope) => {
    const { onToolCall: applyTool, onAgentMessage: postAgentMessage } = latestRef.current;

    switch (message.type) {
      case 'relay.joined':
        setIsJoined(true);
        setJoinedSessionId(
          typeof message.payload?.sessionId === 'string' && message.payload.sessionId.trim()
            ? message.payload.sessionId.trim()
            : sessionIdRef.current
        );
        return;

      case 'relay.presence': {
        const agentsRaw = Array.isArray(message.payload?.agents) ? message.payload?.agents : [];
        const agents = agentsRaw
          .map((entry) => {
            if (!entry || typeof entry !== 'object') return null;
            const id = typeof (entry as Record<string, unknown>).id === 'string'
              ? (entry as Record<string, unknown>).id
              : '';
            const name = typeof (entry as Record<string, unknown>).name === 'string'
              ? (entry as Record<string, unknown>).name
              : '';
            if (!id || !name) return null;
            return { id, name };
          })
          .filter((entry): entry is { id: string; name: string } => entry !== null);
        setConnectedAgents(agents);
        if (typeof message.payload?.sessionId === 'string' && message.payload.sessionId.trim()) {
          setJoinedSessionId(message.payload.sessionId.trim());
        }
        return;
      }

      case 'session.start':
        sendEnvelope({
          type: 'session.started',
          replyTo: message.id,
          payload: {
            sessionId: sessionIdRef.current,
          },
        });
        return;

      case 'snapshot.get':
        sendEnvelope({
          type: 'snapshot.state',
          replyTo: message.id,
          payload: getSnapshotPayload() as unknown as Record<string, unknown>,
        });
        return;

      case 'tool.call': {
        const toolName = message.payload?.toolName;
        const params = message.payload?.params;
        const reason =
          typeof message.payload?.reason === 'string' && message.payload.reason.trim()
            ? message.payload.reason.trim()
            : undefined;

        if (typeof toolName !== 'string') {
          sendEnvelope({
            type: 'error',
            replyTo: message.id,
            payload: {
              code: 'INVALID_PARAMS',
              message: 'tool.call requires payload.toolName',
            },
          });
          return;
        }

        try {
          const result = applyTool(toolName, (params as Record<string, unknown>) ?? {}, {
            source: 'agent',
            reason,
          });
          const immediateUiSpec = isUiSpec(result) ? result : undefined;
          sendEnvelope({
            type: 'tool.result',
            replyTo: message.id,
            payload: {
              ok: true,
              toolName,
              ...(immediateUiSpec ? { uiSpec: immediateUiSpec } : {}),
            },
          });
        } catch (error) {
          sendEnvelope({
            type: 'error',
            replyTo: message.id,
            payload: {
              code: 'TOOL_EXECUTION_FAILED',
              message: error instanceof Error ? error.message : 'Tool execution failed',
            },
          });
        }
        return;
      }

      case 'agent.message': {
        const text = message.payload?.text;
        if (typeof text !== 'string' || !text.trim()) {
          sendEnvelope({
            type: 'error',
            replyTo: message.id,
            payload: {
              code: 'INVALID_PARAMS',
              message: 'agent.message requires a non-empty payload.text',
            },
          });
          return;
        }
        postAgentMessage(text.trim());
        return;
      }

      case 'session.end':
        // Intentionally ignore session.end from agent on host side.
        return;

      default:
        return;
    }
  }, [getSnapshotPayload, sendEnvelope]);

  useEffect(() => {
    if (!enabled) {
      if (reconnectTimerRef.current !== null) {
        window.clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }

      const ws = wsRef.current;
      if (ws && ws.readyState < WebSocket.CLOSING) {
        ws.close(1000, 'host-connection-disabled');
      }
      wsRef.current = null;
      return;
    }

    let disposed = false;
    let currentWs: WebSocket | null = null;

    const connect = () => {
      if (disposed || !enabled) return;

      const ws = new WebSocket(wsUrl);
      currentWs = ws;
      wsRef.current = ws;
      setIsJoined(false);

      ws.onopen = () => {
        if (disposed) return;
        setIsConnected(true);
        ws.send(
          JSON.stringify({
            v: PROTOCOL_VERSION,
            type: 'relay.join',
            payload: {
              role: 'host',
              sessionId: sessionIdRef.current,
            },
          })
        );
      };

      ws.onmessage = (event) => {
        const envelope = parseEnvelope(event);
        if (!envelope) return;
        handleEnvelope(envelope);
      };

      ws.onclose = () => {
        setIsConnected(false);
        setIsJoined(false);
        setJoinedSessionId(null);
        setConnectedAgents([]);
        if (wsRef.current === ws) {
          wsRef.current = null;
        }

        if (!disposed && enabled) {
          reconnectTimerRef.current = window.setTimeout(connect, 1200);
        }
      };

      ws.onerror = () => {
        ws.close();
      };
    };

    connect();

    return () => {
      disposed = true;
      if (reconnectTimerRef.current !== null) {
        window.clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      if (currentWs && currentWs.readyState < WebSocket.CLOSING) {
        currentWs.close();
      }
    };
  }, [enabled, handleEnvelope, wsUrl]);

  useEffect(() => {
    if (!isJoined) return;

    sendEnvelope({
      type: 'state.updated',
      payload: {
        source: 'host',
        uiSpec: latestRef.current.uiSpec,
        messageHistory: latestRef.current.messageHistory,
        toolSchema: latestRef.current.toolSchema,
      },
    });
  }, [isJoined, uiSpec, messageHistory, toolSchema, sendEnvelope]);

  const sendUserMessageToAgent = useCallback(
    (text: string, stage: Stage) => {
      const trimmed = text.trim();
      if (!trimmed) return;

      sendEnvelope({
        type: 'user.message',
        payload: {
          text: trimmed,
          stage,
        },
      });
    },
    [sendEnvelope]
  );

  const sendSessionResetToAgent = useCallback(
    (reason = 'host-manual-reset') => {
      sendEnvelope({
        type: 'session.reset',
        payload: { reason },
      });
    },
    [sendEnvelope]
  );

  return {
    sendUserMessageToAgent,
    sendSessionResetToAgent,
    isConnected,
    isJoined,
    joinedSessionId,
    connectedAgents,
  };
}
