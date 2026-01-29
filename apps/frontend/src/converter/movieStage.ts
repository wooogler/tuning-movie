import type { Movie } from '../types';
import type { UISpec } from './types';

export function convertMovieStage(movies: Movie[]): UISpec {
  return {
    surface: 'movie_select',
    components: [
      {
        id: 'root',
        type: 'Grid',
        children: { each: '/movies', template: 'movie_card_tpl' },
        props: { columns: { sm: 3, md: 4, lg: 5 }, gap: 6 },
      },
      {
        id: 'movie_card_tpl',
        type: 'MovieCard',
        data: { path: '.' },
        props: {
          action: { type: 'navigate', event: 'selectMovie' },
        },
      },
    ],
    dataModel: { movies },
    actions: {
      selectMovie: {
        type: 'navigate',
        payload: { to: '/theater', store: 'movie' },
      },
    },
  };
}
