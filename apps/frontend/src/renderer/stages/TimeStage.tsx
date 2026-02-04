/**
 * TimeStage Component
 *
 * 상영 시간 선택 Stage - ButtonGroup 사용
 */

import { getVisibleItems, type TimeItem } from '../../spec';
import { ButtonGroup } from '../components/ButtonGroup';
import { ActionBar } from './ActionBar';
import type { StageProps } from './types';

export function TimeStage({
  spec,
  onSelect,
  onNext,
  onBack,
}: StageProps<TimeItem>) {
  const visibleItems = getVisibleItems(spec);
  const canProceed = !!spec.state.selectedId;

  return (
    <div className="flex flex-col items-center gap-6">
      <ButtonGroup
        items={visibleItems}
        selectedId={spec.state.selectedId}
        onSelect={onSelect}
        labelField="time"
      />

      <ActionBar
        onBack={onBack}
        onNext={onNext}
        nextDisabled={!canProceed}
      />
    </div>
  );
}
