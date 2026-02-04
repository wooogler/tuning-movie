/**
 * MovieStage Component
 *
 * 영화 선택 Stage - ButtonGroup 사용
 */

import { getVisibleItems, type MovieItem } from '../../spec';
import { ButtonGroup } from '../components/ButtonGroup';
import { ActionBar } from './ActionBar';
import type { StageProps } from './types';

export function MovieStage({
  spec,
  onSelect,
  onNext,
}: StageProps<MovieItem>) {
  const visibleItems = getVisibleItems(spec);
  const canProceed = !!spec.state.selectedId;

  return (
    <div className="flex flex-col items-center gap-6">
      <ButtonGroup
        items={visibleItems}
        selectedId={spec.state.selectedId}
        onSelect={onSelect}
        labelField="title"
      />

      <ActionBar
        onNext={onNext}
        nextDisabled={!canProceed}
        nextLabel="Continue"
      />
    </div>
  );
}
