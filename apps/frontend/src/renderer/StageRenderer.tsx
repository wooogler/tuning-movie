/**
 * StageRenderer Component
 *
 * UISpec의 stage에 따라 적절한 Stage 컴포넌트를 렌더링
 */

import type { UISpec, MovieItem, TheaterItem, DateItem, TimeItem, SeatItem } from '../spec';
import {
  MovieStage,
  TheaterStage,
  DateStage,
  TimeStage,
  SeatStage,
  ConfirmStage,
} from './stages';

export interface StageRendererProps {
  spec: UISpec;
  onSelect: (id: string) => void;
  onToggle?: (id: string) => void;
  onNext: () => void;
  onBack?: () => void;
  onStartOver?: () => void;
  onConfirm?: () => void;
}

export function StageRenderer({
  spec,
  onSelect,
  onToggle,
  onNext,
  onBack,
  onStartOver,
  onConfirm,
}: StageRendererProps) {
  switch (spec.stage) {
    case 'movie':
      return (
        <MovieStage
          spec={spec as UISpec<MovieItem>}
          onSelect={onSelect}
          onNext={onNext}
        />
      );

    case 'theater':
      return (
        <TheaterStage
          spec={spec as UISpec<TheaterItem>}
          onSelect={onSelect}
          onNext={onNext}
          onBack={onBack}
          onStartOver={onStartOver}
        />
      );

    case 'date':
      return (
        <DateStage
          spec={spec as UISpec<DateItem>}
          onSelect={onSelect}
          onNext={onNext}
          onBack={onBack}
          onStartOver={onStartOver}
        />
      );

    case 'time':
      return (
        <TimeStage
          spec={spec as UISpec<TimeItem>}
          onSelect={onSelect}
          onNext={onNext}
          onBack={onBack}
          onStartOver={onStartOver}
        />
      );

    case 'seat':
      return (
        <SeatStage
          spec={spec as UISpec<SeatItem>}
          onSelect={onSelect}
          onToggle={onToggle ?? onSelect}
          onNext={onNext}
          onBack={onBack}
          onStartOver={onStartOver}
        />
      );

    case 'confirm':
      return (
        <ConfirmStage
          spec={spec}
          onConfirm={onConfirm ?? onNext}
          onNext={onNext}
          onBack={onBack}
          onStartOver={onStartOver}
        />
      );

    default:
      return <div>Unknown stage: {spec.stage}</div>;
  }
}
