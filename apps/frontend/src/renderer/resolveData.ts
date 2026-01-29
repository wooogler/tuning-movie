import type { DataBinding } from '../converter/types';

/**
 * Resolves a data binding against a data context using JSON Pointer paths.
 * - "." returns the entire context
 * - "/movies/0/title" traverses into dataModel.movies[0].title
 */
export function resolveData(
  binding: DataBinding,
  context: Record<string, unknown>,
): unknown {
  if (binding.path === '.') return context;

  const segments = binding.path.replace(/^\//, '').split('/');
  let current: unknown = context;

  for (const segment of segments) {
    if (current == null) return undefined;
    current = (current as Record<string, unknown>)[segment];
  }

  return current;
}
