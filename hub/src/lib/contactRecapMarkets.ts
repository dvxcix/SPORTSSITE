import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import { getTodaysMatchups } from '@slipsurge/core/mlbSchedule'
import { canonGameKey } from '@slipsurge/core/teamAbbr'
import { normName, resolveNameEntry } from '@slipsurge/core/nameNorm'
import type { ContactMarketContext, ContactMarketQuote, DailyContactEvent } from '@/lib/contactRecapTypes'

type PriceBook = Record<string, number | string | null | undefined>
type PropEntry = { name?: string; [market: string]: string | PriceBook | undefined }

const BOOK_LABELS: Record<string, string> = {
  fanduel: 'FanDuel', draftkings: 'DraftKings', williamhill_us: 'Caesars', caesars: 'Caesars',
  fanatics: 'Fanatics', betmgm: 'BetMGM', betrivers: 'BetRivers', pinnacle: 'Pinnacle',
}

const BOOK_ORDER = ['fanduel', 'draftkings', 'williamhill_us', 'caesars', 'fanatics', 'betmgm', 'betrivers', 'pinnacle']

const FD_COLUMNS: Record<string, string> = {
  fhr_fd: 'fhr', sa_fd: 'sa', hr2_fd: 'hr2', sng_fd: 'singles', dbl_fd: 'doubles', tri_fd: 'triples',
  rbi_fd: 'rbi', rbi2_fd: 'rbi2', rbi3_fd: 'rbi3', tb_fd: 'tb', tb3_fd: 'tb3', tb4_fd: 'tb4',
  tb5_fd: 'tb5', hrr_fd: 'hrr', laser105_fd: 'laser105', laser110_fd: 'laser110', moonshot_fd: 'moonshot',
  pa1_fd: 'pa1', hr_ml_fd: 'hrMl',
}

const FD_SELECT = `game_key,name_norm,player_name,updated_at,${Object.keys(FD_COLUMNS).join(',')}`

function normalizedBook(book: string) {
  return book === 'caesars' ? 'williamhill_us' : book
}

function quoteList(entry: PropEntry | null, marketKey: string, marketLabel: string): ContactMarketQuote[] {
  const raw = entry?.[marketKey]
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return []
  return Object.entries(raw)
    .flatMap(([rawBook, value]) => {
      const book = normalizedBook(rawBook)
      const odds = Number(value)
      if (!Number.isFinite(odds) || !BOOK_LABELS[book]) return []
      return [{ marketKey, marketLabel, book, bookLabel: BOOK_LABELS[book], odds }]
    })
    .sort((a, b) => BOOK_ORDER.indexOf(a.book) - BOOK_ORDER.indexOf(b.book))
}

function actualMarket(event: DailyContactEvent) {
  if (event.kind === 'home_run') return { key: 'sa', label: 'Anytime Home Run' }
  const result = event.result.toLowerCase()
  if (result.includes('double')) return { key: 'doubles', label: 'To Hit a Double' }
  if (result.includes('triple')) return { key: 'triples', label: 'To Hit a Triple' }
  if (result.includes('single')) return { key: 'singles', label: 'To Hit a Single' }
  return { key: '', label: 'Near Home Run' }
}

function specialMarkets(event: DailyContactEvent, homeRunCount: number, hrMlWon: boolean) {
  if (event.kind !== 'home_run') return [] as Array<{ key: string; label: string }>
  const markets: Array<{ key: string; label: string }> = []
  if (event.isFirstHr) markets.push({ key: 'fhr', label: 'First Home Run' })
  if (event.plateAppearanceNumber === 1) markets.push({ key: 'pa1', label: '1st PA Home Run' })
  if (homeRunCount >= 2) markets.push({ key: 'hr2', label: '2+ Home Runs' })
  if (hrMlWon) markets.push({ key: 'hrMl', label: 'HR + Team Win' })
  if (Number(event.exitVelocity) >= 105) markets.push({ key: 'laser105', label: 'Laser 105+' })
  if (Number(event.exitVelocity) >= 110) markets.push({ key: 'laser110', label: 'Laser 110+' })
  if (Number(event.distance) >= 420) markets.push({ key: 'moonshot', label: 'Moonshot 420+' })
  markets.push({ key: 'rbi', label: '1+ RBI' })
  if (event.rbi >= 2) markets.push({ key: 'rbi2', label: '2+ RBI' })
  if (event.rbi >= 3) markets.push({ key: 'rbi3', label: '3+ RBI' })
  markets.push(
    { key: 'hrr', label: '1+ Hit + Run + RBI' },
    { key: 'tb', label: '2+ Total Bases' },
    { key: 'tb3', label: '3+ Total Bases' },
    { key: 'tb4', label: '4+ Total Bases' },
  )
  return markets
}

export async function enrichContactRecapMarkets(date: string, events: DailyContactEvent[]) {
  if (!events.length) return events
  const hrCountByPlayerGame = new Map<string, number>()
  for (const event of events) {
    if (event.kind !== 'home_run') continue
    const key = `${event.gamePk}:${event.batterId}`
    hrCountByPlayerGame.set(key, (hrCountByPlayerGame.get(key) ?? 0) + 1)
  }
  const admin = createAdminClient()
  const gamePks = Array.from(new Set(events.map(event => String(event.gamePk))))
  const [matchups, snapshotResult, gapResult] = await Promise.all([
    getTodaysMatchups(date),
    admin.from('pregame_odds_snapshots')
      .select('game_pk,prop_map,frozen_at,home_abbr,away_abbr')
      .in('game_pk', gamePks),
    admin.from('fanduel_gap_odds').select(FD_SELECT).eq('game_date', date).range(0, 9999),
  ])
  if (snapshotResult.error) throw snapshotResult.error
  if (gapResult.error) throw gapResult.error

  const gameKeyByPk = new Map(matchups.map(game => [String(game.gamePk), canonGameKey(game.gameKey)]))
  const snapshots = new Map<string, { propMap: Record<string, PropEntry>; frozenAt: string | null }>()
  for (const row of snapshotResult.data ?? []) {
    snapshots.set(String(row.game_pk), {
      propMap: (row.prop_map ?? {}) as Record<string, PropEntry>,
      frozenAt: row.frozen_at ?? null,
    })
    if (!gameKeyByPk.has(String(row.game_pk)) && row.away_abbr && row.home_abbr) {
      gameKeyByPk.set(String(row.game_pk), canonGameKey(`${row.away_abbr}@${row.home_abbr}`))
    }
  }

  const gapByGame = new Map<string, Map<string, Record<string, unknown>>>()
  for (const row of (gapResult.data ?? []) as unknown as Array<Record<string, unknown>>) {
    const gameKey = canonGameKey(String(row.game_key))
    const byName = gapByGame.get(gameKey) ?? new Map<string, Record<string, unknown>>()
    byName.set(String(row.name_norm), row)
    gapByGame.set(gameKey, byName)
  }

  return events.map(event => {
    const snapshot = snapshots.get(String(event.gamePk))
    const propMap = snapshot?.propMap ?? {}
    const byName: Record<string, PropEntry> = {}
    for (const [key, value] of Object.entries(propMap)) {
      if (value && typeof value === 'object') byName[normName(value.name ?? key)] = { ...value }
    }
    const playerKey = normName(event.batterName)
    const entry = resolveNameEntry(byName, playerKey) ?? (byName[playerKey] = { name: event.batterName })
    const gameKey = gameKeyByPk.get(String(event.gamePk))
    const gap = gameKey ? resolveNameEntry(Object.fromEntries(gapByGame.get(gameKey) ?? []), playerKey) : null
    if (gap) {
      for (const [column, market] of Object.entries(FD_COLUMNS)) {
        const value = Number(gap[column])
        if (Number.isFinite(value)) entry[market] = { ...(typeof entry[market] === 'object' ? entry[market] as PriceBook : {}), fanduel: value }
      }
    }

    const actual = actualMarket(event)
    const primary = actual.key ? quoteList(entry, actual.key, actual.label) : []
    const winningTeam = event.game.status.toLowerCase().includes('final')
      && event.game.homeScore != null && event.game.awayScore != null && event.game.homeScore !== event.game.awayScore
      ? event.game.homeScore > event.game.awayScore ? event.game.homeTeam : event.game.awayTeam
      : null
    const homeRunCount = hrCountByPlayerGame.get(`${event.gamePk}:${event.batterId}`) ?? 0
    const specials = specialMarkets(event, homeRunCount, event.batterTeam === winningTeam)
      .flatMap(market => quoteList(entry, market.key, market.label))
    const context: ContactMarketContext = {
      primaryLabel: actual.label,
      primary,
      specials,
      frozenAt: snapshot?.frozenAt ?? null,
    }
    return { ...event, marketContext: context }
  })
}
