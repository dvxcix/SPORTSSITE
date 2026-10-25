import test from 'node:test'
import assert from 'node:assert/strict'
import { gradeMlbPick, supportsMlbPick, checkEarlyWin, applyMlbPickResult, type MlbLiveFeed, type MlbPlay } from '../src/lib/pickGrading.ts'

const batter = (extra = {}) => ({ plateAppearances: 4, hits: 2, totalBases: 3, runs: 2, stolenBases: 2, homeRuns: 0, ...extra })
function feed(stats: Record<string, unknown> = batter(), plays: MlbPlay[] = []) {
  return { gamePk: 1, gameData: { status: { abstractGameState: 'Final' } }, liveData: { boxscore: { teams: { home: { players: { ID10: { stats: { batting: stats } } } }, away: { players: {} } } }, plays: { allPlays: plays }, linescore: { teams: { home: { runs: 5 }, away: { runs: 3 } } } } }
}
const pick = (pick_type: string, extra = {}) => ({ mlb_id: 10, game_pk: '1', pick_type, ...extra })
const play = (eventType: string, extra = {}) => ({ matchup: { batter: { id: 10 } }, atBatIndex: 3, about: { isComplete: true }, pitchIndex: [0], result: { eventType, description: 'Player homers to left field.' }, playEvents: [{ hitData: { launchSpeed: 105, totalDistance: 420 } }], ...extra })

test('all missing supported MLB milestones use inclusive exact boundaries', () => {
  for (const type of ['hits_2plus', 'total_bases_3plus', 'run_scored_2plus', 'stolen_base_2plus']) {
    assert.equal(supportsMlbPick(pick(type)), true)
    assert.equal(gradeMlbPick(pick(type), feed()).result, 'win')
    assert.equal(gradeMlbPick(pick(type), feed(batter({ hits: 1, totalBases: 2, runs: 1, stolenBases: 1 }))).result, 'loss')
    assert.equal(checkEarlyWin(type, 10, feed()), true)
  }
  assert.equal(supportsMlbPick(pick('hits_2plus', { numeric_line: 5 })), false)
  assert.equal(gradeMlbPick(pick('hits_2plus', { numeric_line: 5 }), feed()).result, null)
  assert.equal(supportsMlbPick(pick('hits_2plus', { numeric_line: 2 })), true)
  assert.equal(supportsMlbPick(pick('toString')), false)
})

test('missing player/stats/final identity never becomes zero, loss, or a DNP', () => {
  assert.equal(gradeMlbPick({ ...pick('hits_2plus'), mlb_id: 99 }, feed()).reason, 'missing-player')
  assert.equal(gradeMlbPick(pick('hits_2plus'), feed({})).reason, 'missing-stats')
  assert.equal(gradeMlbPick(pick('hits_2plus'), feed(batter({ hits: undefined }))).result, null)
  assert.equal(gradeMlbPick({ ...pick('hits_2plus'), game_pk: '2' }, feed()).result, null)
  const f = feed(); f.gameData.status.abstractGameState = 'Live'
  assert.equal(gradeMlbPick(pick('hits_2plus'), f).result, null)
  assert.equal(gradeMlbPick(pick('hits_2plus'), feed(batter({ plateAppearances: 0 }))).result, 'push')
  assert.equal(gradeMlbPick(pick('unknown'), feed(batter({ plateAppearances: 0 }))).result, null)
})

test('first-PA legacy alias uses the first completed appearance and no-pitch IBB void', () => {
  for (const type of ['pa1', 'first_pa_hr']) {
    assert.equal(gradeMlbPick(pick(type), feed(batter({ plateAppearances: 2 }), [play('home_run', { atBatIndex: 10 }), play('field_out')])).result, 'loss')
    assert.equal(gradeMlbPick(pick(type), feed(batter({ plateAppearances: 1 }), [play('home_run')])).result, 'win')
    assert.equal(gradeMlbPick(pick(type), feed(batter({ plateAppearances: 1 }), [play('intent_walk', { pitchIndex: [] })])).result, 'push')
    assert.equal(gradeMlbPick(pick(type), feed(batter({ plateAppearances: 4 }), [play('home_run')])).reason, 'missing-plays')
    assert.equal(gradeMlbPick(pick(type), feed(batter({ plateAppearances: 2 }), [play('home_run'), play('home_run')])).reason, 'missing-plays')
    assert.equal(gradeMlbPick(pick(type), feed(batter({ plateAppearances: 1 }), [play('home_run', { result: {} })])).reason, 'missing-plays')
    assert.equal(gradeMlbPick(pick(type), feed()).reason, 'missing-plays')
  }
})

test('Statcast specialty props preserve thresholds and unknown measurements', () => {
  const f = feed(batter({ homeRuns: 1 }), [play('home_run')])
  assert.equal(gradeMlbPick(pick('laser_105'), f).result, 'win')
  assert.equal(gradeMlbPick(pick('laser_110'), f).result, 'loss')
  assert.equal(gradeMlbPick(pick('moonshot', { numeric_line: 420 }), f).result, 'win')
  assert.equal(gradeMlbPick(pick('moonshot', { numeric_line: 425 }), f).result, 'loss')
  assert.equal(gradeMlbPick(pick('moonshot'), f).reason, 'missing-contract')
  assert.equal(supportsMlbPick(pick('moonshot')), false)
  assert.equal(gradeMlbPick(pick('moonshot'), feed()).result, 'loss', 'zero official HR is determinate at any distance')
  assert.equal(gradeMlbPick(pick('laser_105'), feed(batter({ homeRuns: 1 }), [play('home_run', { playEvents: [] })])).reason, 'missing-statcast')
  assert.equal(gradeMlbPick(pick('laser_105'), feed(batter({ homeRuns: 1 }), [play('home_run', { result: { eventType: 'home_run', description: 'inside-the-park home run' } })])).result, 'loss')
})

test('home-run/moneyline contract requires both verified conditions and never locks live', () => {
  const f = feed(batter({ homeRuns: 1 }))
  assert.equal(gradeMlbPick(pick('hr_moneyline_parlay'), f).result, 'win')
  assert.equal(gradeMlbPick(pick('hr_moneyline_parlay'), f, false).result, null)
  f.liveData.linescore.teams.home.runs = 2
  assert.equal(gradeMlbPick(pick('hr_moneyline_parlay'), f).result, 'loss')
})

test('pitcher strikeouts require exact side/line and verified starting pitcher', () => {
  assert.equal(supportsMlbPick(pick('pitcher_strikeouts')), false)
  const f: MlbLiveFeed = feed(); f.liveData!.boxscore!.teams!.home.players!.ID10.stats!.pitching = { gamesStarted: 1, strikeOuts: 6 }
  for (const [side, expected] of [['milestone', 'win'], ['over', 'push'], ['under', 'push']]) assert.equal(gradeMlbPick(pick('pitcher_strikeouts', { numeric_line: 6, market_side: side }), f).result, expected)
  assert.equal(gradeMlbPick(pick('pitcher_strikeouts', { numeric_line: 5.5, market_side: 'under' }), f, false).result, null)
})

test('new MLB results use one atomic RPC, never separate pick/post mutations or retry uncertain writes', async () => {
  const calls: { name: string; args: { p_prop_type_map: { pa1: string }; p_expected: Record<string, unknown> } }[] = []
  const admin = { rpc: (name: string, args: typeof calls[number]['args']) => { calls.push({ name, args }); return { abortSignal: async () => ({ data: [{ applied: true, leg_player_name: 'Player', overall_result: 'loss' }], error: null }) } } }
  const outcome = await applyMlbPickResult(admin as unknown as Parameters<typeof applyMlbPickResult>[0], { ...pick('pa1'), id: 'id', post_id: 'post' }, 'loss', { pa1: { pickType: 'first_pa_hr' } })
  assert.equal(outcome?.result, 'loss'); assert.equal(calls.length, 1)
  assert.equal(calls[0].name, 'settle_member_pick_exact'); assert.equal(calls[0].args.p_prop_type_map.pa1, 'first_pa_hr')
  assert.equal(calls[0].args.p_expected.pick_type, 'pa1'); assert.equal(calls[0].args.p_expected.game_pk, '1')
  const broken = { rpc: () => ({ abortSignal: async () => { throw Error('uncertain') } }) }
  await assert.rejects(applyMlbPickResult(broken as unknown as Parameters<typeof applyMlbPickResult>[0], { ...pick('hits'), id: 'id', post_id: null }, 'win', {}))
})

test('First HR requires reconciled official team totals and ignores incomplete plays', () => {
  const f: MlbLiveFeed = feed(batter({ homeRuns: 1 }), [play('home_run')])
  f.liveData!.boxscore!.teams!.home.teamStats = { batting: { homeRuns: 1 } }
  f.liveData!.boxscore!.teams!.away.teamStats = { batting: { homeRuns: 0 } }
  assert.equal(gradeMlbPick(pick('first_hr'), f).result, 'win')
  f.liveData!.plays!.allPlays!.unshift(play('home_run', { atBatIndex: 0, about: { isComplete: false }, matchup: { batter: { id: 11 } } }))
  assert.equal(gradeMlbPick(pick('first_hr'), f).result, 'win')
  f.liveData!.boxscore!.teams!.away.teamStats.batting!.homeRuns = 1
  assert.equal(gradeMlbPick(pick('first_hr'), f).reason, 'missing-plays')
})
