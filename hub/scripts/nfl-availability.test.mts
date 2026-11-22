import { test } from 'node:test'
import assert from 'node:assert/strict'
import { filterNflMarkets, nflAvailability, nflAvailabilityIsFresh, nflAvailabilityWindowOpen, nflHasCurrentMarket, nflMarketExclusions, withGameAvailability, withoutNflCurrentMarkets } from '../src/lib/nflAvailability'
import { attachNflDesignations } from '../src/lib/nflDesignations'
import type { NflBdlDesignation } from '../src/lib/nflOdds'
import { teamMmHighlights } from '../src/app/the-sideline/teamHighlights'
import { EMPTY_SIDELINE_ODDS, type NflOddsPlayer } from '../src/lib/nflOddsTypes'

const availability = (status: string | null, active: boolean | null = null) => ({ gameStatus: status, active, injury: 'Knee', starter: false, didNotPlay: false, updatedAt: null })
test('confirmed unavailable designations are ineligible even with a posted price', () => {
  for (const status of ['Out', 'O', 'IR', 'Reserve/PUP', 'Inactive', 'Suspended', 'DNP']) {
    assert.equal(nflAvailability({ availability: availability(status) }).eligible, false, status)
  }
})
test('questionable, doubtful and injury description alone are not confirmed out', () => {
  for (const status of ['Questionable', 'Doubtful', null]) assert.equal(nflAvailability({ availability: availability(status) }).eligible, true)
})
test('today roster injury cannot rewrite a prior game', () => {
  assert.equal(nflAvailability({ rosterStatus: 'IR' }, '2026-09-20', '2026-09-30').eligible, true)
  assert.equal(nflAvailability({ rosterStatus: 'IR' }, '2026-10-04', '2026-09-30').eligible, false)
  assert.equal(nflAvailability({ rosterStatus: 'IR', availability: availability(null, true) }, '2026-10-04', '2026-09-30').eligible, true)
})
test('a cut player stays ineligible even if a price or an old active designation is present', () => {
  for (const rosterStatus of ['CUT', 'RLS', 'Waived', 'Released']) {
    const player = { rosterStatus, availability: availability(null, true) }
    assert.equal(nflAvailability(player, '2026-11-16', '2026-11-16').eligible, false)
    assert.equal(nflAvailability(player, '2026-10-16', '2026-11-16').eligible, true)
  }
})
test('saved game designations remove unavailable players from every market without excluding questionable players', () => {
  const player: NflOddsPlayer = { id: 1, name: 'Ladd McConkey', team: 'LAC', position: 'WR', rosterStatus: 'ACT', markets: [] }
  const players = [
    { ...player, availability: availability('out') },
    { ...player, id: 2, name: 'Inactive player', availability: availability('questionable', false) },
    { ...player, id: 3, name: 'Questionable player', availability: availability('questionable') },
    { ...player, id: 4, name: 'Same name on other team', team: 'BAL' },
    { ...player, id: 5, name: player.name, team: 'BAL' },
  ]
  const board = { ...EMPTY_SIDELINE_ODDS, players }
  const visible = filterNflMarkets(board, nflMarketExclusions(players, 2026))
  assert.deepEqual(visible.players.map(row => row.id), [3, 4, 5])
  assert.equal(board.players.length, 5)
})
test('roster eligibility removes sidecar prices and checks team aliases, season and game elevations', () => {
  const released: NflOddsPlayer = { id: 1, name: 'Hayden Rucci', team: 'LAC', position: 'TE', gsisId: '00-0039489', latestTeam: 'LAC', lastSeason: 2026, rosterStatus: 'CUT', markets: [] }
  const elsewhere = { ...released, id: 2, name: 'Traded player', latestTeam: 'BAL', rosterStatus: 'ACT' }
  const alias = { ...released, id: 3, name: 'Rams receiver', team: 'LAR', latestTeam: 'LA', rosterStatus: 'ACT' }
  const historical = { ...released, id: 4, name: 'Earlier season', lastSeason: 2027 }
  const elevated = { ...released, id: 5, name: 'Elevated player', rosterStatus: 'DEV', availability: availability(null, true) }
  const practice = { ...released, id: 6, name: 'Practice player', rosterStatus: 'DEV' }
  const prices = [released, elsewhere, alias].map(player => ({
    playerId: player.id, name: player.name, team: player.team, label: 'Anytime TD', propType: 'anytime_td',
    offer: { vendor: 'fanduel', type: 'milestone' as const, line: 0.5, openingLine: 0.5, current: { odds: 1900 }, opening: null, updatedAt: null },
  }))
  const board = { ...EMPTY_SIDELINE_ODDS, players: [released, elsewhere, alias, historical, elevated, practice], lastSeen: { offers: prices, lines: [] }, openingOnly: { offers: prices, lines: [] } }
  const visible = filterNflMarkets(board, nflMarketExclusions(board.players, 2026))
  assert.deepEqual(visible.players.map(player => player.id), [3, 4, 5])
  assert.deepEqual(visible.lastSeen?.offers.map(quote => quote.playerId), [3])
  assert.deepEqual(visible.openingOnly?.offers.map(quote => quote.playerId), [3])
  assert.equal(board.lastSeen.offers.length, 3)
})
test('unavailable extremes cannot lead MM highlights', () => {
  const result = teamMmHighlights([{ name: 'Out', mm: 99, eligible: false }, { name: 'Active', mm: 2, eligible: true }])
  assert.equal(result.hidden?.name, 'Active')
})
test('slider retains game availability without changing prices or mutating frames', () => {
  const player: NflOddsPlayer = { id: 1, name: 'Test', team: 'PHI', position: 'WR', markets: [] }
  const frame = { ...EMPTY_SIDELINE_ODDS, players: [player] }
  const current = { ...frame, players: [{ ...player, availability: availability('Out') }] }
  const merged = withGameAvailability(frame, current)
  assert.equal(merged.players.length, 0)
  assert.equal(nflAvailability(merged.availabilityPlayers![0]).eligible, false)
  assert.equal(frame.players[0].availability, undefined)
  assert.equal(frame.players[0].markets, player.markets)
})

test('injury text is explicitly unconfirmed; game-day active is distinct from an injury note', () => {
  assert.equal(nflAvailability({ availability: availability(null) }).label, 'Status unconfirmed')
  assert.equal(nflAvailability({ availability: availability(null, true) }).label, 'Active')
  assert.equal(nflAvailability({ availability: availability('Q') }).label, 'Questionable')
  assert.equal(nflAvailability({ availability: availability('D') }).label, 'Doubtful')
  assert.equal(nflAvailability({ availability: availability('Q', true) }).label, 'Active')
  assert.equal(nflAvailability({ availability: availability('out', true) }).eligible, false)
  assert.equal(nflAvailability({ availability: availability('out') }).label, 'Out')
})

test('withdrawn player remains in quote-free status metadata and cannot return through a slider', () => {
  const player: NflOddsPlayer = {id: 1, name: 'Test', team: 'PHI', position: 'WR', markets: [{key:'receiving_yards',propType:'receiving_yards',label:'Receiving',category:'receiving',line:25,offers:[{vendor:'fanduel',type:'milestone',line:25,openingLine:25,current:{odds:150},opening:null,updatedAt:null}]}], publicPicks:[{propType:'receiving_yards',label:'Receiving',rawMarket:'private',picks:2,capturedAt:'2026-11-22'}]}
  const frame = {...EMPTY_SIDELINE_ODDS,players:[player]}
  const current = filterNflMarkets({...frame,players:[{...player,availability:availability('out')}]},new Set([JSON.stringify(['PHI','test'])]))
  assert.equal(current.players.length,0)
  assert.equal(current.availabilityPlayers?.[0].name,'Test')
  assert.deepEqual(current.availabilityPlayers?.[0].markets,[])
  assert.equal(current.availabilityPlayers?.[0].publicPicks,undefined)
  assert.equal(withGameAvailability(frame,current).players.length,0)
  assert.equal(frame.players[0].markets.length,1)
})

test('missing or opening-only quotes do not qualify for current-market ranks', () => {
  const player: NflOddsPlayer = {id:1,name:'Test',team:'PHI',position:'WR',markets:[]}
  assert.equal(nflHasCurrentMarket(player),false)
  const offer={vendor:'fanduel',type:'milestone' as const,line:25,openingLine:25,current:{odds:150},opening:null,updatedAt:null}
  player.markets=[{key:'receiving_yards',propType:'receiving_yards',label:'Receiving',category:'receiving',line:25,offers:[{...offer,isOpeningOnly:true}]}]
  assert.equal(nflHasCurrentMarket(player),false)
  player.markets[0].offers=[offer]
  assert.equal(nflHasCurrentMarket(player,'receiving_yards'),true)
  assert.equal(nflHasCurrentMarket(player,'rushing_yards'),false)
  player.markets[0].offers=[{...offer,current:{odds:NaN}}]
  assert.equal(nflHasCurrentMarket(player),false)
})

test('game-specific reports include unquoted players, ignore other games, and refresh exact status', () => {
  const player:NflOddsPlayer={id:1,name:'Test Player',team:'PHI',position:'WR',markets:[]}
  const board={...EMPTY_SIDELINE_ODDS,bdlGameId:10,players:[player]}
  const report:NflBdlDesignation={game_id:10,player:{id:1,first_name:'Test',last_name:'Player',position_abbreviation:'WR'},team:{id:2,abbreviation:'PHI'},game_status:'questionable',injury:'Knee',active:null}
  const omitted={...report,player:{...report.player,id:2,first_name:'Unlisted'},game_status:'out'}
  const enriched=attachNflDesignations(board,[report,omitted,{...report,game_id:9,active:false}])
  assert.equal(enriched.players[0].availability?.gameStatus,'questionable')
  assert.equal(enriched.availabilityPlayers?.[0].name,'Unlisted Player')
  assert.equal(nflAvailability(enriched.availabilityPlayers![0]).eligible,false)
  const active=attachNflDesignations(enriched,[{...report,game_status:null,active:true}])
  assert.equal(nflAvailability(active.players[0]).label,'Active')
  assert.equal(board.players[0].availability,undefined)
})

test('expiry blocks current markets without deleting status evidence or renewing old reports',()=>{
 const at=Date.parse('2026-11-22T17:00:00Z'),board={...EMPTY_SIDELINE_ODDS,availabilityObservedAt:new Date(at).toISOString(),players:[{id:1,name:'Test',team:'KC',position:'WR',availability:availability('questionable'),markets:[]}]}
 assert.equal(nflAvailabilityIsFresh(board,at+89999),true)
 assert.equal(nflAvailabilityIsFresh(board,at+90000),false)
 assert.equal(nflAvailabilityIsFresh(board,at-1),false)
 assert.equal(nflAvailabilityIsFresh(EMPTY_SIDELINE_ODDS,at),false)
 const withheld=withoutNflCurrentMarkets(board)
 assert.equal(withheld.availabilityStale,true)
 assert.equal(withheld.players.length,0)
 assert.equal(withheld.availabilityPlayers?.[0].availability?.gameStatus,'questionable')
 assert.equal(withheld.availabilityObservedAt,board.availabilityObservedAt)
 assert.equal(board.players.length,1)
})

test('JAX–NYG earlier durable cutoff keeps its valid archive available despite a later display time',()=>{
 const now=Date.parse('2026-11-22T18:50:00Z'),cutoffAt=Date.parse('2026-11-22T18:00:00Z')
 const stored={...EMPTY_SIDELINE_ODDS,status:'ready' as const,players:[{id:1,name:'Archived receiver',team:'JAX',position:'WR',markets:[]}]}
 assert.equal(nflAvailabilityIsFresh(stored,now),false,'legacy archives have no live report clock')
 assert.equal(nflAvailabilityWindowOpen({scheduledOpen:true,cutoffAt,started:false},now),false,'the earlier durable cutoff wins over the later displayed schedule')
 assert.equal(nflAvailabilityWindowOpen({scheduledOpen:true,cutoffAt,started:false},cutoffAt),false)
 assert.equal(nflAvailabilityWindowOpen({scheduledOpen:true,cutoffAt,started:false},cutoffAt-1),true)
 assert.equal(nflAvailabilityWindowOpen({scheduledOpen:true,cutoffAt:now+3600000,started:true},now),false)
 assert.equal(nflAvailabilityWindowOpen({scheduledOpen:false,cutoffAt:now+3600000,started:false},now),false)
 assert.equal(nflAvailabilityWindowOpen({scheduledOpen:true,cutoffAt:now+3600000,started:false},now),true,'open games still need fresh reports')
 assert.equal(nflAvailabilityWindowOpen({scheduledOpen:true,cutoffAt:NaN,started:false},now),true,'an unknown boundary does not waive the freshness check')
})
