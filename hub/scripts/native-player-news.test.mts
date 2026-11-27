import assert from 'node:assert/strict'
import { test } from 'node:test'
import { appleNotificationPayload } from '../src/lib/appleNotificationPayload'
import { nativeNotificationArtwork, nativePlayerNewsName } from '../src/lib/nativeNotificationArtwork'
import { espnInjuryNews, espnRosterNews, matchesPlayerNews, mlbTransactionNews, playerNewsArtwork, playerNewsLink } from '../src/lib/nativePlayerNews'
import type { FavoriteTeam } from '../src/lib/sportFavorites'

const nba = {
  id: '18', abbreviation: 'NY', displayName: 'New York Knicks', color: '006BB6', alternateColor: 'F58426',
  logos: [{ href: 'https://a.espncdn.com/i/teamlogos/nba/500/ny.png' }],
}
const atl = {
  id: '1', abbreviation: 'ATL', displayName: 'Atlanta Hawks', color: 'E03A3E', alternateColor: 'C1D32F',
}
const chicago = {
  id: '3', abbreviation: 'CHI', displayName: 'Chicago Bears', color: '0B162A', alternateColor: 'C83803',
}
const portrait = 'https://a.espncdn.com/i/headshots/nba/players/full/3146557.png'
const report = (status: string, timestamp = '2026-11-26T22:00:00Z') => ({
  id: '540374', date: timestamp, status, shortComment: 'Landale (hip) will miss the next game.',
  athlete: { displayName: 'Jock Landale', team: atl, headshot: { href: portrait },
    links: [{ href: 'https://www.espn.com/nba/player/_/id/3146557/jock-landale' }] },
  details: { type: 'Hip', location: 'Hip' },
})
const snapshot = (row = report('Out')) => ({ status: 'success', injuries: [{ id: '1', injuries: [row] }] })

test('player identity is returned only for system injury and roster notifications', () => {
  assert.equal(nativePlayerNewsName('injury_update', null, '  Alex  Santos  '), 'Alex Santos')
  assert.equal(nativePlayerNewsName('roster_move', null, 'José Peña'), 'José Peña')
  assert.equal(nativePlayerNewsName('follow', null, 'Alex Santos'), null)
  assert.equal(nativePlayerNewsName('injury_update', 'member', 'Alex Santos'), null)
  assert.equal(nativePlayerNewsName('injury_update', null, 'Alex\nSantos'), null)
  assert.equal(nativePlayerNewsName('injury_update', null, 'a'.repeat(101)), null)
})

test('injury reports retain actual athlete identity, team and status, leaving unverified players out', () => {
  const [item] = espnInjuryNews('nba', snapshot())
  assert.equal(item.kind, 'injury_update')
  assert.equal(item.player?.id, '3146557')
  assert.equal(item.player?.headshot, portrait)
  assert.equal(item.team.logo, 'https://a.espncdn.com/i/teamlogos/nba/500/atl.png')
  const [next] = espnInjuryNews('nba', snapshot(report('Active', '2026-11-26T22:10:00Z')))
  assert.equal(next.subject, item.subject)
  assert.match(next.status!, /^Active:/)
  assert.notEqual(next.key, item.key)
  assert.deepEqual(espnInjuryNews('nba', snapshot({ ...report('Rumor') })), [])
  assert.deepEqual(espnInjuryNews('nba', { status: 'success', injuries: [{ id: '2', injuries: [report('Out')] }] }), [])
  assert.throws(() => espnInjuryNews('nba', { status: 'failure' }), /unavailable/)
})

test('NBA and NFL transactions retain the source copy and named players in multi-player and multi-action rows', () => {
  const nfl = espnRosterNews('nfl', [{
    date: '2026-11-25T08:00Z', team: chicago,
    description: 'Elevated RB Salvon Ahmed and DB Elijah Jones from the practice squad to the active roster. Placed WR Rome Odunze on injured reserve.',
  }])
  assert.deepEqual(nfl.map(item => [item.kind, item.player?.name]), [
    ['roster_move', 'Salvon Ahmed'], ['roster_move', 'Elijah Jones'], ['injury_update', 'Rome Odunze'],
  ])
  assert.equal(new Set(nfl.map(item => item.key)).size, 3)
  const [move] = espnRosterNews('nba', [{ date: '2026-11-26T08:00Z', description: 'Waived C Orlando Robinson.', team: nba }])
  assert.equal(move.player?.name, 'Orlando Robinson')
  assert.equal(move.team.abbr, 'NYK')
  assert.equal(move.team.logo, 'https://a.espncdn.com/i/teamlogos/nba/500/ny.png')
  assert.deepEqual(espnRosterNews('nba', [{ date: '2026-11-26T08:00Z', description: 'Player rumored to sign.', team: nba }]), [])
})

test('MLB trades match either club or the exact saved athlete, and render both team marks', () => {
  const row = {
    id: 105, date: '2026-11-26', person: { id: 605141, fullName: 'Mookie Betts' },
    fromTeam: { id: 111, name: 'Boston Red Sox' }, toTeam: { id: 119, name: 'Los Angeles Dodgers' },
    description: 'Boston Red Sox traded Mookie Betts to Los Angeles Dodgers.',
  }
  const [item] = mlbTransactionNews([row])
  const [il] = mlbTransactionNews([{ ...row, id: 106, description: 'Los Angeles Dodgers placed Mookie Betts on the 10-day injured list.' }])
  const catalog: FavoriteTeam[] = [
    { key: 'MLB:BOS', sport: 'mlb', id: '111', abbr: 'BOS', name: 'Boston Red Sox', logo: null, href: '/mlb/teams/111' },
    { key: 'MLB:LAD', sport: 'mlb', id: '119', abbr: 'LAD', name: 'Los Angeles Dodgers', logo: null, href: '/mlb/teams/119' },
    { key: 'NBA:2', sport: 'nba', id: '2', abbr: 'BOS', name: 'Boston Celtics', logo: null, href: '/nba/teams/2' },
  ]
  assert.equal(item.kind, 'roster_move')
  assert.equal(il.kind, 'injury_update')
  assert.equal(playerNewsLink(item, catalog), '/players/605141')
  const recipient = { favorite_teams: ['MLB:BOS'], favorite_players: [], favorite_sports: [] }
  assert.equal(matchesPlayerNews(item, recipient, catalog), true)
  assert.equal(matchesPlayerNews(item, { ...recipient, favorite_teams: ['NBA:2'] }, catalog), false)
  assert.equal(matchesPlayerNews(item, { ...recipient, favorite_teams: [], favorite_players: [{ mlb_id: 605141, name: 'Mookie Betts', team: 'LAD' }] }, catalog), true)
  const art = playerNewsArtwork(item)!
  assert.match(art.image, /\/people\/605141\//)
  assert.match(art.badge!, /\/lad\.png$/)
  assert.match(art.secondaryBadge!, /\/bos\.png$/)
})

test('player news keeps the APNs payload small and validates portrait, badge and actor provenance', () => {
  const [item] = espnInjuryNews('nba', snapshot())
  const art = playerNewsArtwork(item)!
  const message = { hasActor: false, message: item.text,
    data: { player_news_artwork: art, sport: item.sport, player_name: item.player?.name, team: item.team.abbr } }
  const payload = appleNotificationPayload('delivery', item.kind, message)
  assert.equal(payload.aps.alert.title, 'Injury update')
  assert.equal(payload.aps.alert.subtitle, 'Jock Landale · ATL')
  assert.equal(payload.aps['mutable-content'], 1)
  assert.equal(payload.artwork?.badge, art.badge)
  assert.equal(nativeNotificationArtwork(item.kind, null, art.image), portrait)
  assert.equal(appleNotificationPayload('delivery', item.kind, { ...message, hasActor: true }).artwork, undefined)
  assert.equal(appleNotificationPayload('delivery', item.kind, {
    ...message, data: { ...message.data, player_news_artwork: { ...art, image: 'https://example.com/fake.png' } },
  }).artwork, undefined)
  assert.ok(Buffer.byteLength(JSON.stringify(payload)) <= 4096)
})
