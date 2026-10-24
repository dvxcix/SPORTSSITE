import 'server-only'
import { randomUUID } from 'node:crypto'
import { createAdminClient } from './supabase/admin'
import { nbaSharedCache } from './nbaSharedCache'
import type { PikkitCoverage } from './pikkitCoverage'

export type MlbPublicRow = { playerName: string; market: string; picks: number }
export type MlbPublicMovementRow = { gameKey: string; playerName: string; market: string; current: number; previous: number | null; delta: number | null; capturedAt: string; previousAt: string | null }
type Capture = { game_id: number; game_key: string; starts_at: string; captured_at: string; observed_at: string; rows: MlbPublicRow[] }
type ScheduleGame = { gamePk: number; gameDate: string; gameNumber?: number; status?: { abstractGameState?: string; detailedState?: string }; teams?: { away?: { team?: { name?: string; abbreviation?: string } }; home?: { team?: { name?: string; abbreviation?: string } } } }
type ImportIdentity = { gameDate: string; gameKey: string; awayTeam: string; homeTeam: string; capturedAt: string }
const datePattern = /^\d{4}-\d{2}-\d{2}$/
const aliases: Record<string, string> = { ARI: 'AZ', TBR: 'TB', SDP: 'SD', SFG: 'SF', KCR: 'KC', CHW: 'CWS', WSN: 'WSH' }
const abbreviation = (value?: string) => value ? aliases[value.toUpperCase()] ?? value.toUpperCase() : ''
const rowKey = (row: Pick<MlbPublicRow, 'playerName' | 'market'>) => JSON.stringify([row.playerName, row.market])

export function normalizeMlbPublicRows(rows: MlbPublicRow[]): MlbPublicRow[] {
  if (!Array.isArray(rows) || !rows.length || rows.length > 10000) throw new Error('Invalid public capture rows')
  const keys = new Set<string>()
  const result = rows.map(row => {
    if (typeof row.playerName !== 'string' || !row.playerName.trim() || row.playerName.length > 120
      || typeof row.market !== 'string' || !/^[a-z0-9_]{1,80}$/.test(row.market)
      || !Number.isSafeInteger(row.picks) || row.picks < 0 || row.picks > 1_000_000 || keys.has(rowKey(row))) throw new Error('Invalid or duplicate public capture row')
    keys.add(rowKey(row))
    return { playerName: row.playerName, market: row.market, picks: row.picks }
  })
  return result.sort((a, b) => rowKey(a) < rowKey(b) ? -1 : rowKey(a) > rowKey(b) ? 1 : 0)
}

async function verifiedGame(input: ImportIdentity): Promise<ScheduleGame> {
  const observed = Date.parse(input.capturedAt), now = Date.now()
  if (!datePattern.test(input.gameDate) || typeof input.capturedAt !== 'string' || !Number.isFinite(observed) || observed > now + 60_000 || observed < now - 600_000) throw new Error('Public capture observation unavailable')
  const schedule = (await nbaSharedCache(`mlb-public-schedule:v1:${input.gameDate}`, 15, 0, async () => {
    const response = await fetch(`https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=${input.gameDate}&hydrate=team`, { cache: 'no-store', signal: AbortSignal.timeout(10000), headers: { 'User-Agent': 'SlipSurge/1.0' } })
    if (!response.ok) throw new Error('MLB schedule unavailable')
    const body = await response.json()
    if (!Array.isArray(body.dates)) throw new Error('MLB schedule unavailable')
    return body.dates.flatMap((date: { date?: string; games?: ScheduleGame[] }) => date.date === input.gameDate && Array.isArray(date.games) ? date.games : []) as ScheduleGame[]
  }, 25)).value
  const matches = schedule.filter(game => {
    const away = game.teams?.away?.team, home = game.teams?.home?.team
    const key = `${abbreviation(away?.abbreviation)}@${abbreviation(home?.abbreviation)}${(game.gameNumber ?? 1) > 1 ? `-G${game.gameNumber}` : ''}`
    const awayMatches = away?.name === input.awayTeam || abbreviation(away?.abbreviation) === input.awayTeam
    const homeMatches = home?.name === input.homeTeam || abbreviation(home?.abbreviation) === input.homeTeam
    return key === input.gameKey && awayMatches && homeMatches
  })
  const game = matches[0], tip = Date.parse(game?.gameDate ?? '')
  if (matches.length !== 1 || !Number.isSafeInteger(game.gamePk) || game.gamePk <= 0 || !Number.isFinite(tip)
    || game.status?.abstractGameState !== 'Preview' || /in progress|final|postpon|cancel|suspend/i.test(game.status?.detailedState ?? '')
    || Date.now() >= tip || observed >= tip) throw new Error('Game is not verified pregame')
  return game
}

/** Serializes legacy current-row writes and primary history commits for one exact game. */
export async function beginMlbPublicCapture(input: ImportIdentity, rows: MlbPublicRow[]) {
  const normalized = normalizeMlbPublicRows(rows), game = await verifiedGame(input), token = randomUUID(), admin = createAdminClient()
  const { data, error } = await admin.rpc('begin_mlb_public_capture', { p_game_id: game.gamePk, p_game_date: input.gameDate, p_game_key: input.gameKey, p_starts_at: game.gameDate, p_observed_at: new Date(Date.parse(input.capturedAt)).toISOString(), p_token: token }).abortSignal(AbortSignal.timeout(12000))
  if (error || data !== true) throw new Error('Public capture could not reserve its game')
  return {
    assertWritable() {
      // Do not begin a 30-second current-row request inside that same window
      // before first pitch. The archive RPC independently rechecks its clock.
      if (Date.now() + 30_000 >= Date.parse(game.gameDate)) throw new Error('Pregame import window closed')
    },
    async finish() {
      const { data: result, error: failure } = await admin.rpc('finish_mlb_public_capture', { p_game_id: game.gamePk, p_token: token, p_rows: normalized }).abortSignal(AbortSignal.timeout(12000))
      if (failure || !result || typeof result.changed !== 'boolean' || result.rows !== normalized.length) throw new Error('Public capture history could not save')
      return result as { changed: boolean; observedAt: string; rows: number }
    },
    async cancel() {
      const { error: failure } = await admin.rpc('cancel_mlb_public_capture', { p_game_id: game.gamePk, p_token: token }).abortSignal(AbortSignal.timeout(5000))
      if (failure) throw new Error('Public capture reservation could not release')
    },
  }
}

/** Freshness comes from verified primary commits, including real unchanged observations. */
export async function getMlbPublicReceipts(date: string): Promise<Map<string, PikkitCoverage & { capturedAt: number | null }>> {
  if (!datePattern.test(date)) throw new Error('Invalid capture date')
  const { data, error } = await createAdminClient().from('mlb_public_capture_state').select('game_key,starts_at,observed_at,coverage').eq('game_date', date).not('observed_at', 'is', null).limit(40).abortSignal(AbortSignal.timeout(12000))
  if (error) throw new Error('Public capture freshness unavailable')
  return new Map((data ?? []).flatMap(row => {
    const observed = Date.parse(row.observed_at), tip = Date.parse(row.starts_at)
    if (!Number.isFinite(observed) || !Number.isFinite(tip) || observed >= tip || observed > Date.now() + 60000) return []
    return [[row.game_key as string, { ...(row.coverage as PikkitCoverage), capturedAt: observed }]]
  }))
}

export function mlbPublicMovement(captures: Capture[]): { rows: MlbPublicMovementRow[] } {
  const games = new Map<number, Capture[]>()
  for (const capture of captures) {
    const observed = Date.parse(capture.captured_at), tip = Date.parse(capture.starts_at)
    if (!Number.isFinite(observed) || !Number.isFinite(tip) || observed >= tip || observed > Date.now()) continue
    const rows = games.get(capture.game_id) ?? []; rows.push(capture); games.set(capture.game_id, rows)
  }
  const rows: MlbPublicMovementRow[] = []
  for (const group of games.values()) {
    group.sort((a, b) => Date.parse(b.captured_at) - Date.parse(a.captured_at))
    const [latest, prior] = group
    const previous = new Map((prior?.game_key === latest.game_key ? prior.rows : []).map(row => [rowKey(row), row]))
    for (const row of latest.rows) {
      const before = previous.get(rowKey(row))
      rows.push({ gameKey: latest.game_key, playerName: row.playerName, market: row.market, current: row.picks, previous: before?.picks ?? null,
        delta: before ? row.picks - before.picks : null, capturedAt: latest.captured_at, previousAt: before ? prior.captured_at : null })
    }
  }
  return { rows }
}

export async function getMlbPublicMovement(date: string): Promise<{ rows: MlbPublicMovementRow[] }> {
  if (!datePattern.test(date)) throw new Error('Invalid capture date')
  return (await nbaSharedCache(`mlb-public-movement:v1:${date}`, 30, 0, async () => {
    const { data, error } = await createAdminClient().rpc('read_mlb_public_captures', { p_game_date: date }).abortSignal(AbortSignal.timeout(12000))
    if (error) throw new Error('Public movement unavailable')
    return mlbPublicMovement((data ?? []) as Capture[])
  }, 25)).value
}
