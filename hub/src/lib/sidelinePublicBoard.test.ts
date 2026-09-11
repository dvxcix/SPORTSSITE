import assert from 'node:assert/strict'
import test from 'node:test'
import { sidelinePublicBoard } from './sidelinePublicBoard.ts'

test('removes private ingestion metadata from nested public board data', () => {
  const board = {
    games: [{
      id: 'game-1',
      sourceUrl: 'https://private.example/session',
      rawPayload: { token: 'private' },
      players: [{
        name: 'Player One',
        pikkitPickCount: 18,
        markets: [{ name: 'Anytime TD', rawMarket: { source: 'private' }, odds: 240 }],
      }],
    }],
    label: 'Pikkit picks',
  }

  const clean = sidelinePublicBoard(board as never) as unknown as Record<string, unknown>
  const serialized = JSON.stringify(clean)

  assert.equal(serialized.includes('sourceUrl'), false)
  assert.equal(serialized.includes('rawPayload'), false)
  assert.equal(serialized.includes('rawMarket'), false)
  assert.equal(serialized.toLowerCase().includes('pikkit'), false)
  assert.equal(serialized.includes('Player One'), true)
  assert.equal(serialized.includes('Anytime TD'), true)
})
