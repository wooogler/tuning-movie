/**
 * ButtonGroup Component
 *
 * Movie, Theater, Time Stage에서 사용하는 텍스트 버튼 목록
 * DisplayItem의 value를 직접 렌더링
 */

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { DisplayItem } from '../../spec';

type RenderPhase = 'stable' | 'entering' | 'exiting';

interface RenderItem extends DisplayItem {
  phase: RenderPhase;
  textChanged: boolean;
}

const ENTRY_DURATION_MS = 440;
const EXIT_DURATION_MS = 380;
const TEXT_CHANGE_DURATION_MS = 980;

interface ButtonGroupProps {
  items: DisplayItem[];
  onSelect: (id: string) => void;
  selectedId?: string;
  highlightedIds?: string[];
  disabled?: boolean;
  animationScope?: string;
}

export function ButtonGroup({
  items,
  onSelect,
  selectedId,
  highlightedIds = [],
  disabled = false,
  animationScope = 'default',
}: ButtonGroupProps) {
  const highlightSet = useMemo(() => new Set(highlightedIds), [highlightedIds]);
  const itemSignature = useMemo(
    () =>
      items
        .map((item) => `${item.id}::${item.value}::${item.isDisabled ? '1' : '0'}`)
        .join('|'),
    [items]
  );
  const [renderItems, setRenderItems] = useState<RenderItem[]>(() =>
    items.map((item) => ({
      ...item,
      phase: 'stable',
      textChanged: false,
    }))
  );
  const itemRefs = useRef(new Map<string, HTMLDivElement>());
  const previousRectsRef = useRef(new Map<string, DOMRect>());
  const timeoutIdsRef = useRef<number[]>([]);
  const lastAppliedSignatureRef = useRef(itemSignature);

  useEffect(
    () => () => {
      timeoutIdsRef.current.forEach((timeoutId) => window.clearTimeout(timeoutId));
    },
    []
  );

  useEffect(() => {
    timeoutIdsRef.current.forEach((timeoutId) => window.clearTimeout(timeoutId));
    timeoutIdsRef.current = [];
    previousRectsRef.current = new Map();
    lastAppliedSignatureRef.current = itemSignature;
    setRenderItems(
      items.map((item) => ({
        ...item,
        phase: 'stable',
        textChanged: false,
      }))
    );
  }, [animationScope]);

  useEffect(() => {
    if (lastAppliedSignatureRef.current === itemSignature) {
      return;
    }
    lastAppliedSignatureRef.current = itemSignature;

    setRenderItems((previous) => {
      const previousById = new Map(previous.map((item) => [item.id, item]));
      const nextById = new Map(items.map((item) => [item.id, item]));

      const nextRenderItems: RenderItem[] = items.map((item) => {
        const previousItem = previousById.get(item.id);
        return {
          ...item,
          phase: previousItem ? 'stable' : 'entering',
          textChanged: previousItem ? previousItem.value !== item.value : false,
        };
      });

      const removedItems = previous
        .filter((item) => !nextById.has(item.id))
        .map((item) => ({
          ...item,
          phase: 'exiting' as const,
          textChanged: false,
        }));

      for (const removedItem of removedItems) {
        const previousIndex = previous.findIndex((item) => item.id === removedItem.id);
        const insertIndex = Math.min(previousIndex, nextRenderItems.length);
        nextRenderItems.splice(insertIndex, 0, removedItem);
      }

      return nextRenderItems;
    });
  }, [itemSignature, items]);

  useEffect(() => {
    timeoutIdsRef.current.forEach((timeoutId) => window.clearTimeout(timeoutId));
    timeoutIdsRef.current = [];

    for (const item of renderItems) {
      if (item.phase === 'entering') {
        timeoutIdsRef.current.push(
          window.setTimeout(() => {
            setRenderItems((previous) =>
              previous.map((entry) =>
                entry.id === item.id ? { ...entry, phase: 'stable' } : entry
              )
            );
          }, ENTRY_DURATION_MS)
        );
      }

      if (item.phase === 'exiting') {
        timeoutIdsRef.current.push(
          window.setTimeout(() => {
            setRenderItems((previous) =>
              previous.filter((entry) => !(entry.id === item.id && entry.phase === 'exiting'))
            );
          }, EXIT_DURATION_MS)
        );
      }

      if (item.textChanged) {
        timeoutIdsRef.current.push(
          window.setTimeout(() => {
            setRenderItems((previous) =>
              previous.map((entry) =>
                entry.id === item.id ? { ...entry, textChanged: false } : entry
              )
            );
          }, TEXT_CHANGE_DURATION_MS)
        );
      }
    }
  }, [renderItems]);

  useLayoutEffect(() => {
    const nextRects = new Map<string, DOMRect>();

    for (const item of renderItems) {
      const node = itemRefs.current.get(item.id);
      if (!node) continue;
      nextRects.set(item.id, node.getBoundingClientRect());
    }

    for (const item of renderItems) {
      const node = itemRefs.current.get(item.id);
      const previousRect = previousRectsRef.current.get(item.id);
      const nextRect = nextRects.get(item.id);
      if (!node || !previousRect || !nextRect || item.phase === 'exiting') continue;

      const deltaX = previousRect.left - nextRect.left;
      const deltaY = previousRect.top - nextRect.top;
      if (Math.abs(deltaX) < 1 && Math.abs(deltaY) < 1) continue;

      node.style.transition = 'none';
      node.style.transform = `translate(${deltaX}px, ${deltaY}px)`;

      requestAnimationFrame(() => {
        node.style.transition =
          'transform 560ms cubic-bezier(0.22, 1, 0.36, 1), opacity 320ms ease';
        node.style.transform = '';
      });
    }

    previousRectsRef.current = nextRects;
  }, [renderItems]);

  return (
    <div className="flex w-full max-w-md flex-col">
      {renderItems.map((item) => {
        const isSelected = item.id === selectedId;
        const isHighlighted = highlightSet.has(item.id);

        const highlightClass = isHighlighted ? 'ring-2 ring-primary gui-highlight-wave' : '';

        const isDisabled = disabled || item.isDisabled;

        return (
          <div
            key={item.id}
            ref={(node) => {
              if (node) {
                itemRefs.current.set(item.id, node);
              } else {
                itemRefs.current.delete(item.id);
              }
            }}
            className={`gui-item-shell ${
              item.phase === 'entering'
                ? 'gui-item-enter'
                : item.phase === 'exiting'
                ? 'gui-item-exit'
                : ''
            }`}
          >
            <button
              onClick={() => !isDisabled && onSelect(item.id)}
              disabled={isDisabled || item.phase === 'exiting'}
              className={`
                relative w-full rounded-xl border px-6 py-4 text-left transition-all
                ${
                  isSelected
                    ? 'border-primary bg-primary font-semibold text-primary-fg'
                    : 'border-dark-border bg-dark-light text-fg-strong hover:border-dark-border hover:bg-dark-lighter'
                }
                ${highlightClass}
                ${isDisabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}
                ${item.textChanged ? 'gui-item-text-shift' : ''}
              `}
            >
              <span className={`block ${item.textChanged ? 'gui-item-text-flash' : ''}`}>
                {item.value}
              </span>
            </button>
          </div>
        );
      })}
    </div>
  );
}
