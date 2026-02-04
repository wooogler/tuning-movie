/**
 * TheaterStage Component
 *
 * 극장 선택 Stage - ButtonGroup 사용
 */

import { getVisibleItems, type TheaterItem } from '../../spec';
import { ButtonGroup } from '../components/ButtonGroup';
import { ActionBar } from './ActionBar';
import type { StageProps } from './types';

export function TheaterStage({
  spec,
  onSelect,
  onNext,
  onBack,
}: StageProps<TheaterItem>) {
  const visibleItems = getVisibleItems(spec);
  const canProceed = !!spec.state.selectedId;

  return (
    <div className="flex flex-col items-center gap-6">
      <ButtonGroup
        items={visibleItems}
        selectedId={spec.state.selectedId}
        onSelect={onSelect}
        labelField="name"
      />

      <ActionBar
        onBack={onBack}
        onNext={onNext}
        nextDisabled={!canProceed}
      />
    </div>
  );
}
