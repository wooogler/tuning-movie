/**
 * TheaterStage Component
 *
 * 극장 선택 Stage - ButtonGroup 사용
 */

import type { TheaterItem } from '../../spec';
import { ButtonGroup } from '../components/ButtonGroup';
import { ActionBar } from './ActionBar';
import type { StageProps } from './types';

export function TheaterStage({
  spec,
  onSelect,
  onNext,
  onBack,
}: StageProps<TheaterItem>) {
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
