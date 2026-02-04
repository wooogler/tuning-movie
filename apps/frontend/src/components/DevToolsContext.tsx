import { createContext, useContext, useState, useRef } from 'react';
import type { ReactNode } from 'react';
import type { UISpec } from '../spec';

type ToolApplyHandler = (toolName: string, params: Record<string, unknown>) => void;

interface DevToolsContextValue {
  backendData: Record<string, unknown>;
  uiSpec: UISpec | null;
  setBackendData: (data: Record<string, unknown>) => void;
  setUiSpec: (spec: UISpec | null) => void;
  onToolApply: ToolApplyHandler | null;
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

  return (
    <DevToolsContext.Provider
      value={{
        backendData,
        uiSpec,
        setBackendData,
        setUiSpec,
        onToolApply: onToolApplyRef.current,
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
