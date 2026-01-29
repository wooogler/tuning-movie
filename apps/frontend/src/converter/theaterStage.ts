import type { Theater } from '../types';
import type { UISpec } from './types';

export function convertTheaterStage(theaters: Theater[]): UISpec {
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
        data: { path: '.' },
        props: {
          action: { type: 'navigate', event: 'selectTheater' },
        },
      },
      {
        id: 'actions',
        type: 'ActionBar',
        props: {
          back: { to: '/', label: 'Back' },
        },
      },
    ],
    dataModel: { theaters },
    actions: {
      selectTheater: {
        type: 'navigate',
        payload: { to: '/date', store: 'theater' },
      },
    },
  };
}
