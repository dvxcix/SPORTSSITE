import type { HrFeedEvent } from './hrFeed.ts'
import type { HrIntelGameResult, HrIntelRealizedOutcome } from './hrIntelligence.ts'
import type { MlbBatterOutcome } from './mlbBoxscoreOutcomes.ts'

function marketOutcomes(outcome: MlbBatterOutcome, firstHr: boolean) {
  const cash = new Set<string>(['Anytime HR', '1+ Hit', '1+ Run', '1+ RBI', '2+ TB', '3+ TB', '4+ TB', '3+ H+R+RBI'])
  const miss = new Set<string>()
  if (firstHr) cash.add('First HR')
  if (outcome.hr >= 2) cash.add('2+ HR'); else miss.add('2+ HR')
  if (outcome.h >= 2) cash.add('2+ Hits'); else miss.add('2+ Hits')
  if (outcome.runs >= 2) cash.add('2+ Runs'); else miss.add('2+ Runs')
  if (outcome.rbi >= 2) cash.add('2+ RBI'); else miss.add('2+ RBI')
  if (outcome.rbi >= 3) cash.add('3+ RBI'); else miss.add('3+ RBI')
  if (outcome.tb >= 5) cash.add('5+ TB'); else miss.add('5+ TB')
  if (outcome.hrr >= 4) cash.add('4+ H+R+RBI'); else miss.add('4+ H+R+RBI')
  if (outcome.singles >= 1) cash.add('Single'); else miss.add('Single')
  if (outcome.doubles >= 1) cash.add('Double'); else miss.add('Double')
  if (outcome.triples >= 1) cash.add('Triple'); else miss.add('Triple')
  if (outcome.sb >= 1) cash.add('1+ SB'); else miss.add('1+ SB')
  if (outcome.sb >= 2) cash.add('2+ SB'); else miss.add('2+ SB')
  return { cashedMarkets: [...cash], missedMarkets: [...miss] }
}

export function buildRealizedHrOutcomes(
  game: HrIntelGameResult,
  events: HrFeedEvent[],
  boxscoreByMlbId: Record<number, MlbBatterOutcome>,
): HrIntelRealizedOutcome[] {
  const grouped = new Map<number, HrFeedEvent[]>()
  for (const event of events) {
    if (event.mlb_id == null) continue
    const current = grouped.get(event.mlb_id) ?? []
    current.push(event)
    grouped.set(event.mlb_id, current)
  }
  return [...grouped.entries()].map(([mlbId, playerEvents]) => {
    const player = game.players.find(candidate => candidate.mlbId === mlbId)
    const box = boxscoreByMlbId[mlbId] ?? null
    const firstHr = playerEvents.some(event => event.is_first_hr_of_game)
    const hrSwingRbiTotal = playerEvents.reduce((sum, event) => sum + event.rbi_on_play, 0)
    const maxHrSwingRbi = Math.max(0, ...playerEvents.map(event => event.rbi_on_play))
    const markets = box ? marketOutcomes(box, firstHr) : { cashedMarkets: firstHr ? ['First HR', 'Anytime HR'] : ['Anytime HR'], missedMarkets: [] }
    return {
      mlbId,
      name: player?.name ?? playerEvents[0]?.player_name ?? 'Unknown',
      team: player?.team ?? '',
      firstHr,
      hits: box?.h ?? null,
      homeRuns: box?.hr ?? null,
      singles: box?.singles ?? null,
      doubles: box?.doubles ?? null,
      triples: box?.triples ?? null,
      totalBases: box?.tb ?? null,
      runs: box?.runs ?? null,
      rbi: box?.rbi ?? null,
      stolenBases: box?.sb ?? null,
      hrr: box?.hrr ?? null,
      hrSwingRbiTotal,
      maxHrSwingRbi,
      grandSlam: playerEvents.some(event => event.is_grand_slam || event.rbi_on_play === 4),
      onlyHitWasHr: box ? box.h === 1 && box.hr === 1 : null,
      additionalHit: box ? box.h > box.hr : null,
      ...markets,
    }
  }).sort((left, right) => Number(right.firstHr) - Number(left.firstHr))
}
