import assert from 'node:assert/strict'
import test from 'node:test'
import { isPublicPreviewPath, PREVIEW_CONFIG, previewPagePath, previewPricingPath, previewWorkspacePath, readPreviewContext, selectPreviewPlayers } from '../src/lib/publicResearchPreview'
import { PUBLIC_PREVIEW_EXAMPLES } from '../src/lib/publicResearchPreviewExamples'

test('only the two research previews bypass sign-in', () => {
  assert.equal(isPublicPreviewPath('/preview/nba'), true)
  assert.equal(isPublicPreviewPath('/preview/nfl'), true)
  for (const path of ['/preview/mlb', '/preview/nba/private', '/api/the-sideline/odds-board', '/the-paint', '/the-sideline']) {
    assert.equal(isPublicPreviewPath(path), false, path)
  }
})

test('checkout context preserves only approved research paths and valid inputs', () => {
  const context = readPreviewContext({ preview: 'nba', game: '21718060', date: '2026-11-08', player: '237', line: '25', next: 'https://elsewhere.test' })
  assert.ok(context)
  assert.equal(previewPagePath(context), '/preview/nba?game=21718060&date=2026-11-08&player=237&line=25')
  assert.equal(previewWorkspacePath(context), '/the-paint?game=21718060&date=2026-11-08&player=237&line=25&market=points&book=fanduel&view=ladders&panel=ladder&type=milestone')
  assert.equal(previewPricingPath(context), '/pricing?game=21718060&date=2026-11-08&player=237&line=25&preview=nba')
  assert.equal(previewPricingPath(null), '/pricing')
  const nfl = readPreviewContext({ preview: 'nfl', game: '2026_09_TB_CHI', date: '2026-11-08', player: '278135', line: '50' })
  assert.ok(nfl)
  assert.equal(previewWorkspacePath(nfl), '/the-sideline?game=2026_09_TB_CHI&date=2026-11-08&player=278135&line=50&preview=nfl')
  assert.equal(readPreviewContext({ preview: 'nfl', game: '//elsewhere.test', date: '2026-11-08' }), null)
  assert.equal(readPreviewContext({ preview: 'nfl', game: '2026_09_TB_CHI', date: '2026-02-31' }), null)
  assert.equal(readPreviewContext({ preview: 'nfl', game: '2026_09_TB_CHI', date: '2026-11-08', line: '99' })?.line, undefined)
})

test('the public slice caps both teams and drops unrelated, ambiguous and private fields', () => {
  const game = PUBLIC_PREVIEW_EXAMPLES.nba.game
  const quotes = Array.from({ length: 12 }, (_, index) => ({
    id: index + 1, name: 'Player ' + (index + 1), team: index < 6 ? game.away : game.home,
    line: 20, price: -150, opening: -110, hiddenMetric: 1234,
  }))
  quotes.push({ ...quotes[0], price: -160 }, { ...quotes[1], id: 99, line: 8 }, { ...quotes[2], id: 100, team: 'BOS' })
  const rows = selectPreviewPlayers('nba', game, quotes)
  assert.equal(rows.length, 8)
  assert.equal(rows.filter(row => row.team === game.away).length, 4)
  assert.ok(!rows.some(row => [1, 99, 100].includes(row.id)))
  assert.deepEqual(Object.keys(rows[0]), ['id', 'name', 'team', 'prices'])
  assert.deepEqual(Object.keys(rows[0].prices[0]), ['line', 'price', 'opening'])
})

test('the archived examples retain real pregame stamps and a single public ladder', () => {
  for (const sport of ['nba', 'nfl'] as const) {
    const board = PUBLIC_PREVIEW_EXAMPLES[sport]
    assert.ok(board.example)
    assert.ok(Date.parse(board.capturedAt) < Date.parse(board.game.start ?? ''))
    assert.equal(board.book, 'FanDuel')
    assert.ok(board.players.length > 3 && board.players.length <= 8)
    const lines: readonly number[] = PREVIEW_CONFIG[sport].lines
    assert.ok(board.players.every(player => player.prices.every(quote => lines.includes(quote.line))))
  }
})
