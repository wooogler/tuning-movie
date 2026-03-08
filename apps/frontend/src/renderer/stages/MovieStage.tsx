/**
 * MovieStage Component
 *
 * 영화 선택 Stage - 제목만 표시하는 버튼 목록
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
      />

      <ActionBar
        onNext={onNext}
        nextDisabled={!canProceed}
        nextLabel="Continue"
      />
    </div>
  );
}
