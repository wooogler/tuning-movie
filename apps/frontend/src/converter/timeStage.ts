import type { Showing } from '../types';
import type { UISpec } from './types';

export function convertTimeStage(showings: Showing[]): UISpec {
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
          action: { type: 'navigate', event: 'selectTime' },
        },
      },
      {
        id: 'actions',
        type: 'ActionBar',
        props: {
          back: { to: '/date', label: 'Back' },
        },
      },
    ],
    dataModel: { showings },
    actions: {
      selectTime: {
        type: 'navigate',
        payload: { to: '/seats', store: 'showing' },
      },
    },
  };
}
