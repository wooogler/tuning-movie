import { useState, useRef, useCallback } from 'react';
import type { ReactNode } from 'react';
import type { UISpec } from '../spec';
import { DevToolsContext, type ToolApplyContext, type ToolApplyHandler } from './devToolsContextShared';

export function DevToolsProvider({ children }: { children: ReactNode }) {
  const [backendData, setBackendData] = useState<Record<string, unknown>>({});
  const [uiSpec, setUiSpec] = useState<UISpec | null>(null);
  const onToolApplyRef = useRef<ToolApplyHandler | null>(null);

  const setOnToolApply = (handler: ToolApplyHandler | null) => {
    onToolApplyRef.current = handler;
  };

  // Stable wrapper that reads the ref at call time, not at render time
  const onToolApply = useCallback(
    (toolName: string, params: Record<string, unknown>, context?: ToolApplyContext) => {
      return onToolApplyRef.current?.(toolName, params, context);
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
