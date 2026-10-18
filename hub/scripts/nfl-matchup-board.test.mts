import test from 'node:test'
import assert from 'node:assert/strict'
import { nflMatchupBoard } from '../src/lib/nflMatchupBoard.ts'
import type { SidelineOddsBoard } from '../src/lib/nflOddsTypes.ts'
test('quarantines unrelated teams without rewriting valid transfers or raw boards', () => {
 const players=[{name:'Marvin Harrison Jr.',team:'HOU'},{name:'Xavier Hutchinson',team:'HOU'},{name:'Trevor Lawrence',team:'JAX'},{name:'Jared Wayne',team:'MIA'}]
 const board={players} as SidelineOddsBoard
 assert.deepEqual(nflMatchupBoard(board,'HOU','JAX').players.map(p=>p.name),players.slice(0,3).map(p=>p.name))
 assert.equal(board.players.length,4)
})
test('preserves Rams and Jaguars alias identities', () => {
 const board={players:[{team:'LAR'},{team:'JAC'}]} as SidelineOddsBoard
 assert.equal(nflMatchupBoard(board,'LA','JAX').players.length,2)
})
