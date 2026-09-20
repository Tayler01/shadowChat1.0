import type { Actor, CircuitLevel } from '../core/types.ts'

const SYMBOLS: Record<string, number> = { '#': 1, '.': 0, c: 2, '~': 3, f: 4, i: 12, K: 100, D: 22, E: 21, S: 34, F: 105, g: 45, '!': 42, '?': 47, '>': 19, '<': 20, '^': 18, v: 13, T: 41, o: 43, b: 39 }

export function authoredLevel(id: string, title: string, rows: string[], hint: string, number = 1): CircuitLevel {
  const width = rows[0].length
  if (rows.some(row => row.length !== width)) throw new Error('Authored board rows differ in width.')
  const actors: Actor[] = []
  const top = rows.join('').split('').map((symbol, cell) => {
    if (symbol === 'P' || symbol === 'B' || symbol === 'e') {
      actors.push({ id: actors.length, kind: symbol === 'P' ? 'player' : symbol === 'B' ? 'block' : 'bug', cell, previous: cell, direction: 1, readyAt: 0, alive: true }); return 0
    }
    if (!(symbol in SYMBOLS)) throw new Error(`Unknown authored symbol ${symbol}`)
    return SYMBOLS[symbol]
  })
  return {
    id: `shadow-fixtures:${id}`, campaignId: 'shadow-fixtures', contentHash: `authored-v1:${id}:${rows.join('')}`, title, number,
    hint, password: ({vestibule:'INIT',waterworks:'BRDG','cold-path':'ICE0'} as Record<string,string>)[id]??'', width, height: rows.length, top, bottom: top.map(() => 0), actors,
    requiredChips: top.filter(t => t === 2).length, timeLimit: 0, traps: [], clones: [], source: 'authored', warnings: [],
  }
}

export const AUTHORED_LEVELS: CircuitLevel[] = [
  authoredLevel('vestibule', 'The Circuit Vestibule', [
    '#############',
    '#P.c....#..E#',
    '#.#.###.#.S##',
    '#.#.K.D...c.#',
    '#...###.#...#',
    '###.....#.#.#',
    '#..B~...#.#.#',
    '#.c.....#...#',
    '#....Ff...c.#',
    '#...........#',
    '#############',
  ], 'Collect the four circuit chips, then pass the socket to the gold gateway. The blue key opens its matching door. Blocks fill water; fire boots protect against heat.'),
  authoredLevel('waterworks', 'A Bridge of Stone', [
    '###########',
    '#P.B~.c.SE#',
    '#..########',
    '#..K.D.c..#',
    '#.........#',
    '###########',
  ], 'A pushed block fills water with dirt. Find both chips before the socket opens.', 2),
  authoredLevel('cold-path', 'The Frost Conduit', [
    '###########',
    '#P.c......#',
    '#.#######.#',
    '#.>>>ic...#',
    '#.#######S#',
    '#.........#',
    '#........E#',
    '###########',
  ], 'Force floors and ice keep you moving. The paused Focus view lets you inspect and rotate the camera.', 3),
]
