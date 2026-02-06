/**
 * MovieStage Component
 *
 * 영화 선택 Stage - ButtonGroup 사용
 */

import type { MovieItem } from '../../spec';
import { ButtonGroup } from '../components/ButtonGroup';
import { ActionBar } from './ActionBar';
import type { StageProps } from './types';

export function MovieStage({
  spec,
  onSelect,
  onNext,
}: StageProps<MovieItem>) {
  const canProceed = !!spec.state.selected;

  return (
    <div className="flex flex-col items-center gap-6">
      <ButtonGroup
        items={spec.visibleItems}
        onSelect={onSelect}
        selectedId={spec.state.selected?.id}
        highlightedIds={spec.modification.highlight?.itemIds}
        highlightStyle={spec.modification.highlight?.style}
      />

      <ActionBar
        onNext={onNext}
        nextDisabled={!canProceed}
        nextLabel="Continue"
      />
    </div>
  );
}
