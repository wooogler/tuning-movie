/**
 * Stage Component Props
 */

import type { UISpec } from '../../spec';

export type GuiMotionProfile = 'default' | 'full-tuning';

export interface StageProps<T = unknown> {
  spec: UISpec<T>;
  onSelect: (id: string) => void;
  onNext: () => void;
  onBack?: () => void;
  onStartOver?: () => void;
  motionProfile?: GuiMotionProfile;
}
