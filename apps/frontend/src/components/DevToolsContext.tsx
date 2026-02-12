import { createContext, useContext, useState, useRef, useCallback } from 'react';
import type { ReactNode } from 'react';
import type { UISpec } from '../spec';

type ToolApplyHandler = (toolName: string, params: Record<string, unknown>) => void;

interface DevToolsContextValue {
  backendData: Record<string, unknown>;
  uiSpec: UISpec | null;
  setBackendData: (data: Record<string, unknown>) => void;
  setUiSpec: (spec: UISpec | null) => void;
  onToolApply: ToolApplyHandler;
  setOnToolApply: (handler: ToolApplyHandler | null) => void;
}

const DevToolsContext = createContext<DevToolsContextValue | null>(null);

export function DevToolsProvider({ children }: { children: ReactNode }) {
  const [backendData, setBackendData] = useState<Record<string, unknown>>({});
  const [uiSpec, setUiSpec] = useState<UISpec | null>(null);
  const onToolApplyRef = useRef<ToolApplyHandler | null>(null);

  const setOnToolApply = (handler: ToolApplyHandler | null) => {
    onToolApplyRef.current = handler;
  };

  // Stable wrapper that reads the ref at call time, not at render time
  const onToolApply = useCallback(
    (toolName: string, params: Record<string, unknown>) => {
      onToolApplyRef.current?.(toolName, params);
    },
    []
  );

  return (
    <DevToolsContext.Provider
      value={{
        backendData,
        uiSpec,
        setBackendData,
        setUiSpec,
        onToolApply,
        setOnToolApply,
      }}
    >
      {children}
    </DevToolsContext.Provider>
  );
}

export function useDevTools() {
  const context = useContext(DevToolsContext);
  if (!context) {
    throw new Error('useDevTools must be used within DevToolsProvider');
  }
  return context;
}
