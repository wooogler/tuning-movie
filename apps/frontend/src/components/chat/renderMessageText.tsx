import type { ReactNode } from 'react';

const BOLD_PATTERN = /\*\*(.+?)\*\*/gs;

export function renderMessageText(text: string): ReactNode {
  const matches = Array.from(text.matchAll(BOLD_PATTERN));
  if (matches.length === 0) {
    return text;
  }

  const nodes: ReactNode[] = [];
  let cursor = 0;

  for (const match of matches) {
    const start = match.index ?? 0;
    const fullMatch = match[0];
    const content = match[1];

    if (start > cursor) {
      nodes.push(text.slice(cursor, start));
    }

    nodes.push(
      <strong key={`msg-bold-${start}`} className="font-bold text-fg-strong">
        {content}
      </strong>
    );

    cursor = start + fullMatch.length;
  }

  if (cursor < text.length) {
    nodes.push(text.slice(cursor));
  }

  return nodes;
}
