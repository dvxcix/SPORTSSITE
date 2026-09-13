import assert from 'node:assert/strict'
import test from 'node:test'
import sharp from 'sharp'
import { renderNflTouchdownReplayGif } from '../src/lib/nflTouchdownReplayGif'
import type { NflTouchdownEvent } from '../src/lib/nflTouchdownFeed'
import { classifyNflTouchdown, isNflTouchdownPlay } from '../src/lib/nflTouchdownFeed'

test('defensive touchdowns are detected when TOUCHDOWN only appears in full play text', () => {
  const play = {
    scoring_play: true,
    type_slug: 'sack-opp-fumble-recovery',
    type_text: 'Sack Opp Fumble Recovery',
    short_text: 'Demetrius Knight Jr. 27 Yd Fumble Return (Evan McPherson Kick)',
    text: 'RECOVERED by CIN-D.Knight at TB 27. D.Knight for 27 yards, TOUCHDOWN.',
  }
  assert.equal(isNflTouchdownPlay(play), true)
  assert.equal(classifyNflTouchdown(play.type_slug, `${play.short_text} ${play.text}`), 'defense')
})

test('NFL touchdown replay renders an animated GIF without an external encoder', async () => {
  const event: NflTouchdownEvent = {
    id: '401872922349', gameId: '2026_01_CLE_JAX', gameDate: '2026-09-13', bdlGameId: 1392224,
    playerName: 'Parker Washington', playerId: '00-0038606', bdlPlayerId: 1057,
    headshot: null, position: 'WR', team: 'JAX', opponent: 'CLE', awayTeam: 'CLE', homeTeam: 'JAX', teamLogo: null,
    quarter: 1, clock: '8:11', kind: 'receiving', yards: 30, passerName: 'Trevor Lawrence',
    text: 'Parker Washington 30 Yd pass from Trevor Lawrence', awayScore: 0, homeScore: 7,
    isFirstTdOfGame: true, playerTdNumber: 1, gameStatus: 'in_progress', occurredAt: '2026-09-13T17:14:52Z',
    startYardLine: 70, endYardLine: 100, startYardsToEndzone: 30, endYardsToEndzone: 0, teamColor: '#006778', opponentLogo: null,
    marketQuotes: [
      { propType: 'first_td', label: 'First Touchdown', vendor: 'fanduel', line: null, odds: 850, openingOdds: 900 },
      { propType: 'anytime_td', label: 'Anytime Touchdown', vendor: 'fanduel', line: 0.5, odds: 190, openingOdds: 195 },
    ],
  }
  const body = await renderNflTouchdownReplayGif(event)
  const metadata = await sharp(body, { animated: true }).metadata()
  assert.equal(metadata.format, 'gif')
  assert.equal(metadata.width, 960)
  assert.equal(metadata.pageHeight, 540)
  assert.equal(metadata.pages, 24)
  assert.ok(body.byteLength > 50_000)
  for (const page of [0, 11, 23]) {
    const decoded = await sharp(body, { page }).png().toBuffer()
    assert.ok(decoded.length > 1_000, `frame ${page} should decode into a non-empty PNG`)
  }
})
