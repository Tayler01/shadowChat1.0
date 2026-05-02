import { BoardChat } from '../boards/BoardChat'
import { getChatBoardDefinition } from '../../lib/boards'

export function NewsChat() {
  const board = getChatBoardDefinition('news-chat')
  if (!board) return null
  return <BoardChat board={board} />
}
