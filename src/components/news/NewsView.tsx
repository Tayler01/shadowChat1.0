import { BoardsView } from '../boards/BoardsView'

// Compatibility export for older imports and old `view=news` routes.
export function NewsView() {
  return <BoardsView />
}
