/**
 * StageRenderer Component
 *
 * UISpec의 stage에 따라 적절한 Stage 컴포넌트를 렌더링
 */

import type { UISpec } from '../spec';
import {
  MovieStage,
  TheaterStage,
  DateStage,
  TimeStage,
  SeatStage,
  TicketStage,
  ConfirmStage,
} from './stages';

export interface StageRendererProps {
  spec: UISpec;
  onSelect: (id: string) => void;
  onToggle?: (id: string) => void;
  onQuantityChange?: (typeId: string, quantity: number) => void;
  onNext: () => void;
  onBack?: () => void;
  onConfirm?: () => void;
}

export function StageRenderer({
  spec,
  onSelect,
  onToggle,
  onQuantityChange,
  onNext,
  onBack,
  onConfirm,
}: StageRendererProps) {
  switch (spec.stage) {
    case 'movie':
      return (
        <MovieStage
          spec={spec}
          onSelect={onSelect}
          onNext={onNext}
        />
      );

    case 'theater':
      return (
        <TheaterStage
          spec={spec}
          onSelect={onSelect}
          onNext={onNext}
          onBack={onBack}
        />
      );

    case 'date':
      return (
        <DateStage
          spec={spec}
          onSelect={onSelect}
          onNext={onNext}
          onBack={onBack}
        />
      );

    case 'time':
      return (
        <TimeStage
          spec={spec}
          onSelect={onSelect}
          onNext={onNext}
          onBack={onBack}
        />
      );

    case 'seat':
      return (
        <SeatStage
          spec={spec}
          onSelect={onSelect}
          onToggle={onToggle ?? onSelect}
          onNext={onNext}
          onBack={onBack}
        />
      );

    case 'ticket':
      return (
        <TicketStage
          spec={spec}
          onSelect={onSelect}
          onQuantityChange={onQuantityChange ?? (() => {})}
          onNext={onNext}
          onBack={onBack}
        />
      );

    case 'confirm':
      return (
        <ConfirmStage
          spec={spec}
          onConfirm={onConfirm ?? onNext}
          onNext={onNext}
          onBack={onBack}
        />
      );

    default:
      return <div>Unknown stage: {spec.stage}</div>;
  }
}
