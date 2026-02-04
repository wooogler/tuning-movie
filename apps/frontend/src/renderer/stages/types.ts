/**
 * Stage Component Props
 */

import type { UISpec } from '../../spec';

export interface StageProps<T = unknown> {
  spec: UISpec<T>;
  onSelect: (id: string) => void;
  onNext: () => void;
  onBack?: () => void;
}
