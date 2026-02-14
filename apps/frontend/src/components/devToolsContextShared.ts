import { createContext, useContext } from 'react';
import type { UISpec } from '../spec';

export type ToolApplyHandler = (
  toolName: string,
  params: Record<string, unknown>
) => UISpec | null | void;

export interface DevToolsContextValue {
  backendData: Record<string, unknown>;
  uiSpec: UISpec | null;
  setBackendData: (data: Record<string, unknown>) => void;
  setUiSpec: (spec: UISpec | null) => void;
  onToolApply: ToolApplyHandler;
  setOnToolApply: (handler: ToolApplyHandler | null) => void;
}

export const DevToolsContext = createContext<DevToolsContextValue | null>(null);

export function useDevTools() {
  const context = useContext(DevToolsContext);
  if (!context) {
    throw new Error('useDevTools must be used within DevToolsProvider');
  }
  return context;
}
