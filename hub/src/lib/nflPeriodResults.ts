import type { NflResultPlayer } from './nflPublicResults'

type Row = Record<string, unknown>
type Totals = Record<string, number>
const number = (v: unknown) => v == null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v)
const yes = (v: unknown) => v === true || v === 1 || v === '1'
const SUMS = ['receptions', 'receiving_yards', 'rushing_attempts', 'rushing_yards', 'passing_attempts', 'passing_completions', 'passing_yards', 'passing_tds', 'interceptions', 'anytime_td']
const PERIODS = ['1q', '2q', '3q', '4q', '1h', '2h']

/** Reconcile whole-game totals before publishing any period split. A missing,
 * truncated or mismatched feed must never manufacture a losing result.
 * Second-half markets include OT; fourth-quarter markets do not. */
export function attachNflPeriodResults(players: NflResultPlayer[], plays: Row[], completeFeed: boolean) {
  if (!completeFeed || !plays.length || plays.length >= 1000) return
  const totals = new Map<string, Map<string, Totals>>()
  const invalid = new Map<string, Set<string>>()
  const invalidate = (id: string, field: string) => {
    const fields = invalid.get(id) ?? new Set<string>(); fields.add(field); invalid.set(id, fields)
  }
  const add = (id: unknown, field: string, value: unknown, q: number, maximum = false) => {
    if (typeof id !== 'string' || !id) return
    const n = number(value)
    if (n == null) { invalidate(id, field); return }
    const buckets = totals.get(id) ?? new Map<string, Totals>()
    for (const period of ['', q <= 4 ? `${q}q` : 'ot', q <= 2 ? '1h' : '2h']) {
      const bucket = buckets.get(period) ?? {}
      bucket[field] = maximum ? Math.max(bucket[field] ?? -Infinity, n) : (bucket[field] ?? 0) + n
      buckets.set(period, bucket)
    }
    totals.set(id, buckets)
  }
  for (const row of plays) {
    const r = { ...(row.raw as Row | null), ...row }
    if (yes(r.play_deleted) || yes(r.two_point_attempt) || r.play_type === 'no_play') continue
    const q = Number(r.qtr)
    if (!Number.isInteger(q) || q < 1) continue
    const passer = r.passer_player_id, receiver = r.receiver_player_id, rusher = r.rusher_player_id
    if (yes(r.pass_attempt) && !yes(r.sack)) {
      add(passer, 'passing_attempts', 1, q)
      add(passer, 'interceptions', yes(r.interception) ? 1 : 0, q)
      if (yes(r.complete_pass)) {
        add(passer, 'passing_completions', 1, q)
        add(passer, 'passing_yards', r.passing_yards, q)
        add(passer, 'longest_pass', r.passing_yards, q, true)
      }
      if (yes(r.pass_touchdown)) add(passer, 'passing_tds', 1, q)
    }
    if (yes(r.complete_pass)) {
      add(receiver, 'receptions', 1, q)
      add(receiver, 'receiving_yards', r.receiving_yards, q)
      add(receiver, 'longest_reception', r.receiving_yards, q, true)
      if (r.lateral_receiver_player_id) {
        add(r.lateral_receiver_player_id, 'receiving_yards', r.lateral_receiving_yards, q)
        add(r.lateral_receiver_player_id, 'longest_reception', r.lateral_receiving_yards, q, true)
      }
    }
    if (yes(r.rush_attempt)) {
      add(rusher, 'rushing_attempts', 1, q)
      add(rusher, 'rushing_yards', r.rushing_yards, q)
      add(rusher, 'longest_rush', r.rushing_yards, q, true)
      if (r.lateral_rusher_player_id) add(r.lateral_rusher_player_id, 'rushing_yards', r.lateral_rushing_yards, q)
    }
    if (yes(r.touchdown)) add(r.td_player_id, 'anytime_td', 1, q)
  }
  for (const player of players) {
    if (!player.gsisId) continue
    const buckets = totals.get(player.gsisId)
    const full = buckets?.get('') ?? {}
    const verified = new Set<string>()
    for (const field of SUMS) {
      const expected = player.stats[field]
      if (expected == null || invalid.get(player.gsisId)?.has(field) || expected !== (full[field] ?? 0)) continue
      verified.add(field)
      for (const period of PERIODS) player.stats[`${field}_${period}`] = buckets?.get(period)?.[field] ?? 0
    }
    if (verified.has('rushing_yards') && verified.has('receiving_yards')) {
      for (const period of PERIODS) player.stats[`rushing_receiving_yards_${period}`] = player.stats[`rushing_yards_${period}`]! + player.stats[`receiving_yards_${period}`]!
    }
    for (const [longest, yards, count] of [['longest_pass', 'passing_yards', 'passing_completions'], ['longest_reception', 'receiving_yards', 'receptions'], ['longest_rush', 'rushing_yards', 'rushing_attempts']]) {
      if (!verified.has(yards) || !verified.has(count) || invalid.get(player.gsisId)?.has(longest)) continue
      const actual = full[longest] ?? 0
      if (player.stats[longest] != null && player.stats[longest] !== actual) continue
      player.stats[longest] = actual
      for (const period of PERIODS) player.stats[`${longest}_${period}`] = buckets?.get(period)?.[longest] ?? 0
    }
  }
}

export type NflBdlPeriodPlay = {
  id: string | number; game: { id: number }; period?: number; type_slug?: string
  text?: string; stat_yardage?: number | null; participants?: Array<{ type: string; player_id: number }> | null
}

/** BDL exposes explicit participants, not a complete stat ledger. Interpret only
 * unambiguous plays and accept a player's splits only when they reconcile with
 * their independently fetched box score. Ambiguous fumbles/penalties stay unknown. */
export function attachNflBdlPeriodResults(players: NflResultPlayer[], plays: NflBdlPeriodPlay[], gameId: number) {
  if (!plays.length || plays.some(p => p.game?.id !== gameId) || new Set(plays.map(p => p.id)).size !== plays.length) return
  const rows: Row[] = plays.flatMap(play => {
    if (/no play|two-point|two point/i.test(play.text ?? '')) return []
    const type = play.type_slug ?? ''
    const actor = (role: string) => {
      const matches = play.participants?.filter(p => p.type === role) ?? []
      return matches.length === 1 ? `bdl-${matches[0].player_id}` : null
    }
    const complete = type === 'pass-reception' || type === 'passing-touchdown'
    const intercepted = type === 'pass-interception-return' || type === 'interception-return-touchdown'
    const rush = type === 'rush' || type === 'rushing-touchdown'
    const scorer = type === 'passing-touchdown' ? actor('receiver') : type === 'rushing-touchdown' ? actor('rusher') : type === 'interception-return-touchdown' ? actor('interception_returner') : null
    return [{ play_id: play.id, qtr: play.period, play_type: type, pass_attempt: complete || intercepted || type === 'pass-incompletion', complete_pass: complete,
      interception: intercepted, rush_attempt: rush, passer_player_id: actor('passer'), receiver_player_id: actor('receiver'), rusher_player_id: actor('rusher'),
      passing_yards: complete ? play.stat_yardage : 0, receiving_yards: complete ? play.stat_yardage : 0, rushing_yards: rush ? play.stat_yardage : 0,
      pass_touchdown: type === 'passing-touchdown', touchdown: !!scorer, td_player_id: scorer }]
  })
  const copies = players.filter(p => p.id != null).map(p => ({ ...p, gsisId: `bdl-${p.id}`, stats: { ...p.stats } }))
  attachNflPeriodResults(copies, rows, true)
  for (const copy of copies) {
    const player = players.find(p => p.id === copy.id)!
    for (const [key, value] of Object.entries(copy.stats)) if (value != null && (key === 'longest_pass' || /_[1-4][qh]$/.test(key))) player.stats[key] ??= value
  }
}
