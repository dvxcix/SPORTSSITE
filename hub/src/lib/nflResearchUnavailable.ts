import { nflSampleReference, type NflSample } from './nflSample'
import type { SidelineGame, SidelineLens, SidelineTeamProfile } from '@/app/the-sideline/types'
import type { SidelineLens as FilmLens } from '@/app/the-sideline/SidelineClient'

const detail = 'No verified pregame research snapshot is available for this game and sample.'
const team = (value: SidelineGame['home']): SidelineTeamProfile => ({ team: value, plays: 0, passRate: 0, neutralPassRate: 0, shotgunRate: 0, noHuddleRate: 0, successRate: 0, explosiveRate: 0, redZoneTdRate: 0, thirdDownRate: 0, defenseSuccessAllowed: 0, defenseExplosiveAllowed: 0 })
export function unavailableNflBoardLens(game: SidelineGame, sample: NflSample): SidelineLens {
  const reference = nflSampleReference(game.season, sample)
  const empty = { plays: 0, weeks: [], teams: [team(game.away), team(game.home)], players: [] }
  return { season: reference.season, status: 'awaiting-data', headline: 'Pregame research unavailable', headlineDetail: detail, aggressor: game.away.abbr,
    coverage: { sampleSeason: reference.season, scheduleStart: 1999, trackingStart: 2016, playByPlayStart: 2022, usesPriorSeason: reference.season < game.season, label: reference.label, detail },
    windows: { season: empty, l1: empty, l3: empty, l5: empty, l10: empty } }
}
export function unavailableNflFilmLens(game: SidelineGame, sample: NflSample): FilmLens {
  return { season: nflSampleReference(game.season, sample).season, plays: 0, status: 'awaiting-data', headline: 'Pregame research unavailable', headlineDetail: detail, aggressor: game.away.abbr,
    teams: [team(game.away), team(game.home)], players: [], historicalGames: [], historicalPlays: [], targets: [], runGaps: [], dvp: [], coverage: { pbpPlays: 0, trackedPlayers: 0, rosterPlayers: 0, advanced: 'unavailable' } }
}
