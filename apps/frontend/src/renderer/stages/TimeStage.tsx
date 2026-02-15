/**
 * TimeStage Component
 *
 * 상영 시간 선택 Stage - ButtonGroup 사용
 */

import type { TimeItem } from '../../spec';
import { ButtonGroup } from '../components/ButtonGroup';
import { ActionBar } from './ActionBar';
import type { StageProps } from './types';

export function TimeStage({
  spec,
  onSelect,
  onNext,
  onBack,
}: StageProps<TimeItem>) {
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
        onBack={onBack}
        onNext={onNext}
        nextDisabled={!canProceed}
      />
    </div>
  );
}
