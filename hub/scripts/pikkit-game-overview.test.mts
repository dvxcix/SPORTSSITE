import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import test from 'node:test'
import type { Page } from 'playwright-core'
import { parsePikkitGameOverview, pikkitOverviewEventId } from '../src/lib/pikkitGameOverview.ts'
import { observePikkitGameOverview } from '../src/lib/pikkitGameOverviewServer.ts'

const source = 'https://prod-website.pikkit.app'
const eventId = 'test-event'
const overviewUrl = source + '/event/foryou/' + eventId
const info = {
  _id: eventId, start_time: '2099-10-21T23:00:00Z',
  event_info: { league: { short: 'NFL' }, away: { full: 'Buffalo Bills', short: 'BUF' }, home: { full: 'Minnesota Vikings', short: 'MIN' } },
}
const payload = {
  info, community: { num_picks: 100, total_wagered: 956.73,
    breakdowns: {
      moneyline: { away: { label: 'BUF', bet_pct: .62, handle_pct: .41 }, home: { label: 'MIN', bet_pct: .38, handle_pct: .59 } },
      spread: { away: { label: 'BUF', bet_pct: 0 }, home: { label: 'MIN', bet_pct: 1, handle_pct: 1 } },
      total: { under: { label: 'Under', bet_pct: .45, handle_pct: .23 }, over: { label: 'Over', bet_pct: .55, handle_pct: .77 } },
    },
  },
  odds: [{ title: 'Example book', odds: { spread: { away: { name: 'away', value: -4.5, odds: 1.9 }, home: { name: 'home', value: 4.5, odds: 1.92 } },
    moneyline: { away: { name: 'away', odds: 1.55 } }, total: { over: { name: 'over', value: 43.5, odds: 1.94 } } } }],
}
const settle = () => new Promise<void>(resolve => setImmediate(resolve))

test('overview stores game totals, separately keyed side shares, and independent prices', () => {
  const row = parsePikkitGameOverview(payload)!
  assert.equal(row.totalBets, 100)
  assert.equal(row.totalHandleDollars, 956.73)
  assert.deepEqual(row.splits.find(x => x.market === 'spread' && x.side === 'away'),
    { market: 'spread', side: 'away', label: 'BUF', betShare: 0, moneyShare: null })
  assert.deepEqual(row.splits.filter(x => x.market === 'total').map(x => x.side), ['under', 'over'])
  assert.deepEqual(row.books[0].quotes.map(x => [x.market, x.side, x.line, x.decimalPrice]), [
    ['moneyline', 'away', null, 1.55], ['spread', 'away', -4.5, 1.9], ['spread', 'home', 4.5, 1.92], ['total', 'over', 43.5, 1.94],
  ])
})

test('missing values remain missing and unrelated origins or endpoints cannot identify an overview', () => {
  assert.equal(parsePikkitGameOverview({ ...payload, community: null }), null)
  assert.equal(parsePikkitGameOverview({ ...payload, community: { num_picks: '100', total_wagered: -5 } }), null)
  assert.equal(parsePikkitGameOverview({ ...payload, community: { num_picks: 0 } })?.totalBets, 0)
  assert.equal(pikkitOverviewEventId(overviewUrl), eventId)
  for (const url of [overviewUrl + '?other=1', overviewUrl.replace(source, 'https://wrong.example'), source + '/event/' + eventId]) {
    assert.equal(pikkitOverviewEventId(url), null)
  }
})

test('observer requires a request from the current visit and checks the NFL event, teams and kickoff', async () => {
  const page = Object.assign(new EventEmitter(), { url: () => 'https://app.pikkit.com/event/' + eventId })
  const watch = observePikkitGameOverview(page as unknown as Page, 'nfl')
  const send = (url: string, body: unknown, current = true) => {
    const request = { url: () => url }
    if (current) page.emit('request', request)
    page.emit('response', { url: () => url, request: () => request, status: () => 200, json: async () => body })
  }
  send(source + '/event/' + eventId, { event: info })
  send(overviewUrl, payload, false)
  await settle()
  const kickoff = Date.parse(info.start_time)
  const identity = watch.nflIdentity('Buffalo Bills', 'Minnesota Vikings', kickoff)!
  assert.ok(identity)
  assert.equal(watch.nflIdentity('Minnesota Vikings', 'Buffalo Bills', kickoff), null)
  assert.equal(watch.nflIdentity('Buffalo Bills', 'Minnesota Vikings', kickoff + 60_000), null)
  assert.equal(watch.find(identity), null)
  send(overviewUrl, payload)
  await settle()
  assert.equal(watch.find(identity)?.overview.totalBets, 100)
  assert.equal(watch.find({ ...identity, id: 'wrong-event' }), null)
  assert.equal(watch.find({ ...identity, start: '2000-10-21T23:00:00Z' }), null)
  watch.dispose()
  assert.equal(page.listenerCount('request'), 0)
  assert.equal(page.listenerCount('response'), 0)
})

