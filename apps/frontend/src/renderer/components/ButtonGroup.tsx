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
  previousValue?: string;
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
  const skipNextFlipRef = useRef(false);
  const previousStableOrderRef = useRef(items.map((item) => item.id));

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
    skipNextFlipRef.current = false;
    previousStableOrderRef.current = items.map((item) => item.id);
    setRenderItems(
      items.map((item) => ({
        ...item,
        phase: 'stable',
        textChanged: false,
        previousValue: undefined,
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
        const reenteringFromExit = previousItem?.phase === 'exiting';
        const textChanged =
          !!previousItem && !reenteringFromExit && previousItem.value !== item.value;
        return {
          ...item,
          phase: previousItem ? (reenteringFromExit ? 'entering' : 'stable') : 'entering',
          textChanged,
          previousValue: textChanged ? previousItem?.value : undefined,
        };
      });

      const removedItems = previous
        .filter((item) => !nextById.has(item.id))
        .map((item) => ({
          ...item,
          phase: 'exiting' as const,
          textChanged: false,
          previousValue: undefined,
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
                entry.id === item.id
                  ? { ...entry, phase: 'stable', previousValue: undefined }
                  : entry
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
                entry.id === item.id
                  ? { ...entry, textChanged: false, previousValue: undefined }
                  : entry
              )
            );
          }, TEXT_CHANGE_DURATION_MS)
        );
      }
    }
  }, [renderItems]);

  useLayoutEffect(() => {
    const nextRects = new Map<string, DOMRect>();
    const hasStructuralAnimation = renderItems.some((item) => item.phase !== 'stable');
    const stableOrder = renderItems
      .filter((item) => item.phase === 'stable')
      .map((item) => item.id);
    const orderChanged =
      stableOrder.length !== previousStableOrderRef.current.length ||
      stableOrder.some((id, index) => id !== previousStableOrderRef.current[index]);

    for (const item of renderItems) {
      const node = itemRefs.current.get(item.id);
      if (!node) continue;
      nextRects.set(item.id, node.getBoundingClientRect());
    }

    if (hasStructuralAnimation) {
      skipNextFlipRef.current = true;
      for (const item of renderItems) {
        const node = itemRefs.current.get(item.id);
        if (!node) continue;
        node.style.transition = '';
        node.style.transform = '';
      }

      previousRectsRef.current = nextRects;
      return;
    }

    if (skipNextFlipRef.current) {
      skipNextFlipRef.current = false;
      for (const item of renderItems) {
        const node = itemRefs.current.get(item.id);
        if (!node) continue;
        node.style.transition = '';
        node.style.transform = '';
      }

      previousRectsRef.current = nextRects;
      previousStableOrderRef.current = stableOrder;
      return;
    }

    if (!orderChanged) {
      for (const item of renderItems) {
        const node = itemRefs.current.get(item.id);
        if (!node) continue;
        node.style.transition = '';
        node.style.transform = '';
      }

      previousRectsRef.current = nextRects;
      previousStableOrderRef.current = stableOrder;
      return;
    }

    for (const item of renderItems) {
      const node = itemRefs.current.get(item.id);
      const previousRect = previousRectsRef.current.get(item.id);
      const nextRect = nextRects.get(item.id);
      if (!node) continue;
      if (item.phase !== 'stable') {
        node.style.transition = '';
        node.style.transform = '';
        continue;
      }
      if (!previousRect || !nextRect) continue;

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
    previousStableOrderRef.current = stableOrder;
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
              {item.textChanged && item.previousValue ? (
                <span className="gui-item-text-stack">
                  <span aria-hidden="true" className="gui-item-text-previous">
                    {item.previousValue}
                  </span>
                  <span className="gui-item-text-current">{item.value}</span>
                </span>
              ) : (
                <span className="block">{item.value}</span>
              )}
            </button>
          </div>
        );
      })}
    </div>
  );
}
