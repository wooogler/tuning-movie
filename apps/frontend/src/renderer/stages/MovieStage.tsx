/**
 * MovieStage Component
 *
 * 영화 선택 Stage - 메타데이터 포함 카드 선택
 */

import type { MovieItem } from '../../spec';
import { ActionBar } from './ActionBar';
import type { StageProps } from './types';

export function MovieStage({
  spec,
  onSelect,
  onNext,
}: StageProps<MovieItem>) {
  const canProceed = !!spec.state.selected;
  const highlightedSet = new Set(spec.modification.highlight?.itemIds ?? []);
  const visibleItemMap = new Map(spec.visibleItems.map((item) => [item.id, item]));
  const movies = spec.visibleItems
    .map((visible) => spec.items.find((movie) => movie.id === visible.id))
    .filter((movie): movie is MovieItem => movie !== undefined);

  return (
    <div className="flex flex-col items-center gap-6">
      <div className="flex w-full max-w-3xl flex-col gap-3">
        {movies.map((movie) => {
          const visibleItem = visibleItemMap.get(movie.id);
          const isSelected = spec.state.selected?.id === movie.id;
          const isHighlighted = highlightedSet.has(movie.id);
          const isDisabled = Boolean(visibleItem?.isDisabled);

          const highlightClass = isHighlighted ? 'ring-2 ring-primary' : '';

          return (
            <button
              key={movie.id}
              onClick={() => !isDisabled && onSelect(movie.id)}
              disabled={isDisabled}
              className={`
                w-full rounded-xl border p-4 text-left transition-all
                ${
                  isSelected
                    ? 'border-primary bg-primary text-primary-fg'
                    : 'border-dark-border bg-dark-light text-fg-strong hover:bg-dark-lighter hover:border-dark-border'
                }
                ${highlightClass}
                ${isDisabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}
              `}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="text-base font-semibold">{movie.title}</div>
                <div className={`${isSelected ? 'text-primary-fg/90' : 'text-fg-muted'}`}>
                  ★ {movie.rating}
                </div>
              </div>
              <div className={`${isSelected ? 'text-primary-fg/90' : 'text-fg-muted'} mt-1 text-sm`}>
                {movie.genre.join(' / ')} • {movie.duration} min
              </div>
            </button>
          );
        })}
      </div>

      <ActionBar
        onNext={onNext}
        nextDisabled={!canProceed}
        nextLabel="Continue"
      />
    </div>
  );
}
