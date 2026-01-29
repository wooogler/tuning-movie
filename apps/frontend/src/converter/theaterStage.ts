import type { Theater } from '../types';
import type { UISpec } from './types';

export function convertTheaterStage(
  theaters: Theater[],
  selectedTheaterId?: string,
): UISpec {
  return {
    surface: 'theater_select',
    components: [
      {
        id: 'root',
        type: 'Column',
        children: ['theater_grid', 'actions'],
        props: { align: 'center', gap: 6 },
      },
      {
        id: 'theater_grid',
        type: 'Grid',
        children: { each: '/theaters', template: 'theater_card_tpl' },
        props: { columns: { sm: 1, md: 2, lg: 3 }, gap: 4 },
      },
      {
        id: 'theater_card_tpl',
        type: 'TheaterCard',
        data: { path: '/_item' },
        props: {
          action: { type: 'setState', event: 'selectTheater' },
          selectedId: selectedTheaterId,
        },
      },
      {
        id: 'actions',
        type: 'ActionBar',
        props: {
          back: { to: '/', label: 'Back' },
          next: {
            to: '/date',
            label: 'Continue',
            disabled: !selectedTheaterId,
          },
        },
      },
    ],
    dataModel: { theaters },
    state: {
      selectedTheaterId,
    },
    actions: {
      selectTheater: {
        type: 'setState',
        payload: { target: 'selectedTheaterId' },
      },
    },
  };
}
