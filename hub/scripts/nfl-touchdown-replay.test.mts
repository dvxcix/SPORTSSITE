import assert from 'node:assert/strict'
import test from 'node:test'
import sharp from 'sharp'
import { renderNflTouchdownReplayGif } from '../src/lib/nflTouchdownReplayGif'
import type { NflTouchdownEvent } from '../src/lib/nflTouchdownFeed'

test('NFL touchdown replay renders an animated GIF without an external encoder', async () => {
  const event: NflTouchdownEvent = {
    id: '401872922349', gameId: '2026_01_CLE_JAX', gameDate: '2026-09-13', bdlGameId: 1392224,
    playerName: 'Parker Washington', playerId: '00-0038606', bdlPlayerId: 1057,
    headshot: null, position: 'WR', team: 'JAX', opponent: 'CLE', teamLogo: null,
    quarter: 1, clock: '8:11', kind: 'receiving', yards: 30, passerName: 'Trevor Lawrence',
    text: 'Parker Washington 30 Yd pass from Trevor Lawrence', awayScore: 0, homeScore: 7,
    isFirstTdOfGame: true, playerTdNumber: 1, gameStatus: 'in_progress', occurredAt: '2026-09-13T17:14:52Z',
    startYardLine: 70, endYardLine: 100, startYardsToEndzone: 30, endYardsToEndzone: 0,
  }
  const body = await renderNflTouchdownReplayGif(event)
  const metadata = await sharp(body, { animated: true }).metadata()
  assert.equal(metadata.format, 'gif')
  assert.equal(metadata.width, 640)
  assert.equal(metadata.pageHeight, 360)
  assert.equal(metadata.pages, 24)
  assert.ok(body.byteLength > 50_000)
})
