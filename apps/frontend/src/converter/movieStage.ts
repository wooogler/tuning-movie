import type { Movie } from '../types';
import type { UISpec } from './types';

export function convertMovieStage(
  movies: Movie[],
  selectedMovieId?: string,
): UISpec {
  return {
    surface: 'movie_select',
    components: [
      {
        id: 'root',
        type: 'Column',
        children: ['movie_grid', 'actions'],
        props: { align: 'center', gap: 6 },
      },
      {
        id: 'movie_grid',
        type: 'Grid',
        children: { each: '/movies', template: 'movie_card_tpl' },
        props: { columns: { sm: 3, md: 4, lg: 5 }, gap: 6 },
      },
      {
        id: 'movie_card_tpl',
        type: 'MovieCard',
        data: { path: '/_item' },
        props: {
          action: { type: 'setState', event: 'selectMovie' },
          selectedId: selectedMovieId,
        },
      },
      {
        id: 'actions',
        type: 'ActionBar',
        props: {
          next: {
            to: '/theater',
            label: 'Continue',
            disabled: !selectedMovieId,
          },
        },
      },
    ],
    dataModel: { movies },
    state: {
      selectedMovieId,
    },
    actions: {
      selectMovie: {
        type: 'setState',
        payload: { target: 'selectedMovieId' },
      },
    },
  };
}
