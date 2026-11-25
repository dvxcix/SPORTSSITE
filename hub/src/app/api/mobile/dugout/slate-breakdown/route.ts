import { unstable_cache } from 'next/cache'
import { NextResponse } from 'next/server'
import { mlbHeadshot, PITCH_COLORS, pitchLabel } from '@slipsurge/core/mlb-api'
import { fetchTeamPitcherIds, getTodaysMatchups, type TodayGame } from '@slipsurge/core/mlbSchedule'
import { getTeamLogoPngUrl, MLB_TEAM_COLORS, MLB_TEAM_SECONDARY_COLORS } from '@slipsurge/core/mlbTeamColors'
import { hasTierAccess } from '@slipsurge/core/tiers'
import { getMlbResearchGame, loadDugoutData } from '@/lib/dugoutData'
import { getFeaturedGameKey } from '@/lib/featuredGame'
import { isArchiveDate } from '@/lib/mlbArchiveView'
import { MLB_HIBERNATING } from '@/lib/mlbOffseason'
import { mlbPregameResearch, mlbPregameResearchOpen, MlbPregameResearchUnavailable, readMlbPregameResearch, type MlbResearchGame, type MlbResearchSnapshot } from '@/lib/mlbPregameResearchData'
import { canViewMlb } from '@/lib/mlbViewerAccess'
import { fetchPlayerPitchRows } from '@/lib/pitchLogFetch'
import { getEffectiveTier } from '@/lib/requireTier'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireNativeAccount } from '@/lib/supabase/nativeAccount'

export const maxDuration = 90
const headers = { 'Cache-Control': 'private, no-store' }
const reply = (value: unknown, status = 200) => NextResponse.json(value, { status, headers })
const pitchKinds = Object.fromEntries(Object.entries(PITCH_COLORS).map(([code, color]) => [code, { label: pitchLabel(code), color }]))
const formatBatter = (batter: TodayGame['awayLineup'][number]) => ({
  id: batter.mlb_id, name: batter.name, position: batter.position, bats: batter.bats, order: batter.batting_order,
  projected: batter.projected, headshot: mlbHeadshot(batter.mlb_id),
})
const formatStarter = (starter: TodayGame['awayPitcher']) => starter && { ...starter, headshot: mlbHeadshot(starter.id) }
function team(code: string, name: string, score: number | null) {
  return { code, name, score, logo: getTeamLogoPngUrl(code), primary: MLB_TEAM_COLORS[code], secondary: MLB_TEAM_SECONDARY_COLORS[code] }
}

type Roster = Pick<TodayGame, 'awayPitcher' | 'homePitcher' | 'awayLineup' | 'homeLineup' | 'awayLineupConfirmed' | 'homeLineupConfirmed'>
const rosterLoads = new Map<number, Promise<MlbResearchSnapshot<Roster> | null>>()

async function matchupRoster(game: MlbResearchGame, date: string, gamePk: number, allowCapture: boolean) {
  const saved = await readMlbPregameResearch<Roster>(game)
  if (saved || !allowCapture || !mlbPregameResearchOpen(game)) return saved
  let request = rosterLoads.get(gamePk)
  if (!request) {
    request = (async () => {
      const query = new URLSearchParams({ date, research: '1' })
      // Use the existing one-game warmer with no member context. Only the
      // dated roster is read back through this route's own access check.
      await loadDugoutData(new Request(`https://internal.slipsurge/dugout?${query}`), { tier: 'ultimate', warmGameIds: [gamePk] })
      return readMlbPregameResearch<Roster>(game)
    })()
    rosterLoads.set(gamePk, request)
  }
  try { return await request }
  finally { if (rosterLoads.get(gamePk) === request) rosterLoads.delete(gamePk) }
}

function slateCard(game: TodayGame, locked: boolean) {
  return { id: game.gamePk, key: game.gameKey, startsAt: game.gameDate, status: game.status, bucket: game.abstractStatus,
    venue: game.venueName ?? null, locked, away: team(game.awayAbbr, game.awayTeam, game.awayScore),
    home: team(game.homeAbbr, game.homeTeam, game.homeScore) }
}

function archiveInfo(snapshot: MlbResearchSnapshot<unknown> | null, live: boolean) {
  return { live, unavailable: !live && !snapshot, frozen: snapshot?.frozen ?? null,
    observedAt: snapshot?.observedAt ?? null, startAt: snapshot?.startAt ?? null }
}

const loadLog = unstable_cache(async (id: number, role: 'batter' | 'pitcher', date: string, live: boolean) => {
  const rows = await fetchPlayerPitchRows(createAdminClient(), id, role)
  // The game-level archive never ingests even same-date rows. A logger may
  // publish those late or correct them after this matchup has already begun.
  return rows.filter(row => typeof row.game_date === 'string' && row.game_date.startsWith(date.slice(0, 4)) &&
    (live || row.game_date < date)).map(row => ({
    game_pk: row.game_pk, game_date: row.game_date, opponent_id: role === 'pitcher' ? row.batter_id : row.pitcher_id,
    opponent_name: '', pitch_type: row.pitch_type, zone: row.zone, plate_x: row.plate_x, plate_z: row.plate_z,
    inning: row.inning, balls: row.balls, strikes: row.strikes, events: row.events, description: row.description,
    is_in_play: row.is_in_play, is_swing: row.is_swing, is_whiff: row.is_whiff, is_home_run: row.is_home_run,
    launch_speed: row.launch_speed, launch_angle: row.launch_angle, hit_distance: row.hit_distance,
    xwoba: row.xwoba, run_value: row.run_value, stand: row.stand, p_throws: row.p_throws,
    bat_speed: row.bat_speed, velocity: row.velocity, spin_rate: row.spin_rate, attack_angle: row.attack_angle,
    swing_length: row.swing_length, swing_path_tilt: row.swing_path_tilt, attack_direction: row.attack_direction,
    launch_speed_angle: row.launch_speed_angle,
  }))
}, ['native-mlb-slate-pitch-log-v1'], { revalidate: 86400, tags: ['player-pitch-log'] })

function parseOptions(query: URLSearchParams) {
  const date = query.get('date') ?? ''
  const mode = query.get('mode') ?? 'pregame'
  const view = query.get('view') ?? 'games'
  const game = query.get('game') ?? ''
  const side = query.get('side')
  const batter = query.get('batter') ?? ''
  if (!isArchiveDate(date) || !['pregame', 'live'].includes(mode) || !['games', 'matchup', 'starter', 'batter', 'team'].includes(view)) return null
  if (view !== 'games' && !/^[1-9][0-9]{0,9}$/.test(game)) return null
  if (['starter', 'batter', 'team'].includes(view) && side !== 'away' && side !== 'home') return null
  if (view === 'batter' && !/^[1-9][0-9]{0,6}$/.test(batter)) return null
  return { live: mode === 'live', date, view, game: Number(game), side, batter: Number(batter) }
}

export async function GET(request: Request) {
  const account = await requireNativeAccount(request)
  if (account.error) return account.error
  const choice = parseOptions(new URL(request.url).searchParams)
  if (!choice) return reply({ error: 'Choose an exact date, matchup and sample' }, 400)
  if (!await canViewMlb(account.supabase, account.userId)) return reply({ error: 'MLB research is unavailable for this account' }, 403)
  const gate = await getEffectiveTier()
  if (gate.error) return gate.error
  if (gate.userId !== account.userId || !gate.tier) return reply({ error: 'Sign in required' }, 401)

  const { date, live, view } = choice
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
  const advanced = hasTierAccess(gate.tier, 'advanced')
  if (live && (MLB_HIBERNATING || date !== today)) return reply({ date, paused: MLB_HIBERNATING, liveUnavailable: true, games: [] })
  if (MLB_HIBERNATING && date >= today) return reply({ date, paused: true, games: [] })

  try {
    const [slate, featured] = await Promise.all([getTodaysMatchups(date), advanced ? null : getFeaturedGameKey(date)])
    const visible = (game: TodayGame) => advanced || game.gameKey === featured
    if (view === 'games') return reply({ date, games: slate.map(game => slateCard(game, !visible(game))) })

    const game = slate.find(game => game.gamePk === choice.game)
    if (!game) return reply({ error: 'Game not found on this slate' }, 404)
    if (!visible(game)) return reply({ error: 'Advanced access required for this matchup' }, 403)
    const exactGame = await getMlbResearchGame(date, game.gamePk)
    if (!exactGame) return reply({ error: 'The dated MLB matchup could not be confirmed' }, 404)
    const board = live ? null : await matchupRoster(exactGame, date, game.gamePk, view === 'matchup' && !MLB_HIBERNATING)
    const roster = live ? game : board?.value
    if (view === 'matchup') {
      return reply({ game: slateCard(game, false), archive: archiveInfo(board, live), pitches: pitchKinds, roster: roster ? {
        awayStarter: formatStarter(roster.awayPitcher), homeStarter: formatStarter(roster.homePitcher),
        awayLineupConfirmed: roster.awayLineupConfirmed, homeLineupConfirmed: roster.homeLineupConfirmed,
        awayLineup: roster.awayLineup.map(formatBatter), homeLineup: roster.homeLineup.map(formatBatter),
      } : null })
    }
    if (!roster) return reply({ archive: archiveInfo(null, false), sample: null })

    const useAway = choice.side === 'away'
    const starter = useAway ? roster.awayPitcher : roster.homePitcher
    const lineup = useAway ? roster.homeLineup : roster.awayLineup
    const teamId = useAway ? game.awayTeamId : game.homeTeamId
    if (view === 'team') {
      if (!advanced) return reply({ error: 'Advanced access required for the full pitching staff' }, 403)
      if (!teamId) return reply({ error: 'The selected team could not be confirmed' }, 404)
      const load = async () => {
        const pitchers = await fetchTeamPitcherIds(teamId)
        if (!pitchers.length) throw new MlbPregameResearchUnavailable()
        return { pitcherIds: pitchers.map(pitcher => pitcher.id) }
      }
      if (live) return reply({ archive: archiveInfo(null, true), sample: await load() })
      const snapshot = await mlbPregameResearch(exactGame, async () => ({ value: await load(), observedAt: new Date().toISOString() }), `slate-team:${teamId}`)
      return reply({ archive: archiveInfo(snapshot, false), sample: snapshot.value })
    }

    if (!hasTierAccess(gate.tier, 'basic')) return reply({ error: 'Basic access required for recorded pitch data' }, 403)
    const id = view === 'starter' ? starter?.id : lineup.find(batter => batter.mlb_id === choice.batter)?.mlb_id
    if (!id) return reply({ error: 'Player not found in this lineup or rotation' }, 404)
    const load = async () => ({ rows: await loadLog(id, view === 'starter' ? 'pitcher' : 'batter', date, live) })
    if (live) return reply({ archive: archiveInfo(null, true), sample: await load() })
    const snapshot = await mlbPregameResearch(exactGame, async () => ({ value: await load(), observedAt: new Date().toISOString() }),
      `slate-${view}:${id}`)
    return reply({ archive: archiveInfo(snapshot, false), sample: snapshot.value })
  } catch (error) {
    if (error instanceof MlbPregameResearchUnavailable) return reply({ archive: archiveInfo(null, false), sample: null })
    return reply({ error: 'The selected slate research is temporarily unavailable' }, 503)
  }
}
