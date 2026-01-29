import type { Showing } from '../types';
import type { UISpec } from './types';

export function convertTimeStage(
  showings: Showing[],
  selectedShowingId?: string,
): UISpec {
  return {
    surface: 'time_select',
    components: [
      {
        id: 'root',
        type: 'Column',
        children: ['time_row', 'actions'],
        props: { align: 'center', gap: 8 },
      },
      {
        id: 'time_row',
        type: 'Row',
        children: { each: '/showings', template: 'time_picker_tpl' },
        props: { justify: 'center', gap: 4, wrap: true },
      },
      {
        id: 'time_picker_tpl',
        type: 'TimePicker',
        data: { path: '/_item' },
        props: {
          action: { type: 'setState', event: 'selectTime' },
          selectedId: selectedShowingId,
        },
      },
      {
        id: 'actions',
        type: 'ActionBar',
        props: {
          back: { to: '/date', label: 'Back' },
          next: {
            to: '/seats',
            label: 'Continue',
            disabled: !selectedShowingId,
          },
        },
      },
    ],
    dataModel: { showings },
    state: {
      selectedShowingId,
    },
    actions: {
      selectTime: {
        type: 'setState',
        payload: { target: 'selectedShowingId' },
      },
    },
  };
}
