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

      try {
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
            const { items } = params as {
              items: { itemId: string; value: string }[];
            };

            // Validate items format
            if (!Array.isArray(items) || items.length === 0) {
              throw new Error('augment requires a non-empty array of items');
            }

            for (const item of items) {
              if (!item || typeof item !== 'object') {
                throw new Error('Each item must be an object with itemId and value');
              }
              if (typeof item.itemId !== 'string' || !item.itemId) {
                throw new Error('Each item must have a non-empty "itemId" string property');
              }
              if (typeof item.value !== 'string') {
                throw new Error('Each item must have a "value" string property');
              }
            }

            newSpec = applyAugment(spec, items);
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
      } catch (error) {
        console.error(`Tool application failed for ${toolName}:`, error);
        throw error; // Re-throw to let DevTools display the error
      }
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
