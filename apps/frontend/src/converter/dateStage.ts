import type { UISpec } from './types';

export function convertDateStage(dates: string[], selectedDate?: string): UISpec {
  return {
    surface: 'date_select',
    components: [
      {
        id: 'root',
        type: 'Column',
        children: ['date_row', 'actions'],
        props: { align: 'center', gap: 8 },
      },
      {
        id: 'date_row',
        type: 'Row',
        children: { each: '/dates', template: 'date_picker_tpl' },
        props: { justify: 'center', gap: 4, wrap: true },
      },
      {
        id: 'date_picker_tpl',
        type: 'DatePicker',
        data: { path: '/_item' },
        props: {
          action: { type: 'setState', event: 'selectDate' },
          selectedDate,
        },
      },
      {
        id: 'actions',
        type: 'ActionBar',
        props: {
          back: { to: '/theater', label: 'Back' },
          next: {
            to: '/time',
            label: 'Continue',
            disabled: !selectedDate,
          },
        },
      },
    ],
    dataModel: { dates },
    state: {
      selectedDate,
    },
    actions: {
      selectDate: {
        type: 'setState',
        payload: { target: 'selectedDate' },
      },
    },
  };
}
