import { createContext, useContext, useState, ReactNode } from 'react';
import type { UISpec } from '../converter/types';

interface DevToolsContextValue {
  backendData: Record<string, unknown>;
  uiSpec: UISpec | null;
  setBackendData: (data: Record<string, unknown>) => void;
  setUiSpec: (spec: UISpec | null) => void;
}

const DevToolsContext = createContext<DevToolsContextValue | null>(null);

export function DevToolsProvider({ children }: { children: ReactNode }) {
  const [backendData, setBackendData] = useState<Record<string, unknown>>({});
  const [uiSpec, setUiSpec] = useState<UISpec | null>(null);

  return (
    <DevToolsContext.Provider value={{ backendData, uiSpec, setBackendData, setUiSpec }}>
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
