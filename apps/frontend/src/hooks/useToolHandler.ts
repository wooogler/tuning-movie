import { useEffect, useCallback } from 'react';
import { useDevTools } from '../components/DevToolsContext';
import {
  selectItem,
  toggleItem,
  setQuantity,
  applyFilter,
  applySort,
  applyHighlight,
  applyAugment,
  clearModification,
  type UISpec,
  type DataItem,
  type FilterState,
  type SortState,
  type HighlightState,
} from '../spec';

interface UseToolHandlerOptions<T extends DataItem> {
  spec: UISpec<T> | null;
  setSpec: (spec: UISpec<T>) => void;
  onNext?: () => void;
  onBack?: () => void;
  multiSelect?: boolean;
}

export function useToolHandler<T extends DataItem>({
  spec,
  setSpec,
  onNext,
  onBack,
  multiSelect = false,
}: UseToolHandlerOptions<T>) {
  const { setUiSpec, setOnToolApply } = useDevTools();

  const handleToolApply = useCallback(
    (toolName: string, params: Record<string, unknown>) => {
      if (!spec) return;

      let newSpec = spec;

      switch (toolName) {
        case 'filter':
          newSpec = applyFilter(spec, params as unknown as FilterState);
          break;
        case 'sort':
          newSpec = applySort(spec, params as unknown as SortState);
          break;
        case 'highlight':
          newSpec = applyHighlight(spec, params as unknown as HighlightState);
          break;
        case 'augment': {
          const { itemId, value, prefix, suffix } = params as {
            itemId: string;
            value?: string;
            prefix?: string;
            suffix?: string;
          };
          newSpec = applyAugment(spec, [{ itemId, value, prefix, suffix }]);
          break;
        }
        case 'clearModification': {
          const type = params.type as 'filter' | 'sort' | 'highlight' | 'augment' | 'all' | undefined;
          newSpec = clearModification(spec, type);
          break;
        }
        case 'select': {
          const itemId = params.itemId as string;
          if (multiSelect) {
            newSpec = toggleItem(spec, itemId);
          } else {
            newSpec = selectItem(spec, itemId);
          }
          break;
        }
        case 'setQuantity': {
          const { typeId, quantity } = params as { typeId: string; quantity: number };
          newSpec = setQuantity(spec, typeId, quantity);
          break;
        }
        case 'next':
          onNext?.();
          return;
        case 'prev':
          onBack?.();
          return;
        default:
          console.warn(`Unknown tool: ${toolName}`);
          return;
      }

      setSpec(newSpec as UISpec<T>);
      setUiSpec(newSpec);
    },
    [spec, setSpec, setUiSpec, onNext, onBack, multiSelect]
  );

  // Register tool handler
  useEffect(() => {
    setOnToolApply(handleToolApply);
    return () => setOnToolApply(null);
  }, [handleToolApply, setOnToolApply]);

  return { handleToolApply };
}
