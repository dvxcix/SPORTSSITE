import type { NflOddsPlayer, SidelineOddsBoard } from '@/lib/nflOddsTypes'

export type NflPikkitPick = {
  playerName: string
  playerKey: string
  team: string | null
  position: string | null
  picks: number
}

export type NflPikkitMarket = {
  propType: string
  label: string
  rawKey: string
  rawLabel: string
  players: NflPikkitPick[]
}

export type NflPikkitSnapshot = {
  gameId: string
  gameDate: string
  season: number
  week: number
  awayTeam: string
  homeTeam: string
  capturedAt: string
  sourceUrl: string | null
  markets: NflPikkitMarket[]
}

export function normalizeNflPikkitName(value: string) {
  return value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '')
}

function slug(value: string) {
  return value.toLowerCase().replace(/&/g, ' and ').replace(/\+/g, ' plus ').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 80)
}

export function canonicalizeNflPikkitMarket(rawKey: string, rawLabel = '') {
  const source = `${rawKey} ${rawLabel}`.toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim()
  const has = (...words: string[]) => words.every(word => source.includes(word))

  if (has('first', 'touchdown')) return 'first_td'
  if ((has('first half') || has('1st half')) && has('touchdown')) return 'anytime_td_1h'
  if ((has('2+') || has('two plus') || has('2 or more')) && has('touchdown')) return 'two_plus_td'
  if ((has('3+') || has('three plus') || has('3 or more')) && has('touchdown')) return 'three_plus_td'
  if (has('anytime', 'touchdown') || has('touchdown scorer') || source === 'touchdowns' || source === 'touchdown') return 'anytime_td'
  if ((has('rush') || has('rushing')) && has('receiv') && has('yard')) return 'rushing_receiving_yards'
  if (has('passing', 'yard')) return 'passing_yards'
  if (has('passing', 'touchdown') || has('pass', 'touchdown')) return 'passing_tds'
  if (has('passing', 'attempt') || has('pass', 'attempt')) return 'passing_attempts'
  if (has('passing', 'completion') || has('pass', 'completion')) return 'passing_completions'
  if (has('interception')) return 'interceptions'
  if ((has('longest', 'rush') || has('long', 'rush'))) return 'longest_rush'
  if (has('rushing', 'attempt') || has('rush', 'attempt') || has('carries')) return 'rushing_attempts'
  if (has('rushing', 'yard') || has('rush', 'yard')) return 'rushing_yards'
  if ((has('longest', 'reception') || has('long', 'reception'))) return 'longest_reception'
  if (has('receiving', 'yard') || has('receiver', 'yard')) return 'receiving_yards'
  if (has('reception') || has('catches')) return 'receptions'
  if (has('field', 'goal', 'made')) return 'field_goals_made'
  if (has('kicking', 'point')) return 'kicking_points'
  if (has('extra', 'point')) return 'extra_points'
  if (has('defensive', 'touchdown') || has('defense', 'touchdown')) return 'defensive_td'
  return slug(rawLabel || rawKey) || 'unknown'
}

export function attachNflPikkitSnapshot(board: SidelineOddsBoard, snapshot: NflPikkitSnapshot | null): SidelineOddsBoard {
  if (!snapshot) return { ...board, pikkitCapturedAt: null, players: board.players.map(player => ({ ...player, publicPicks: [] })) }
  const picksByPlayer = new Map<string, NonNullable<NflOddsPlayer['publicPicks']>>()
  for (const market of snapshot.markets) {
    for (const player of market.players) {
      const key = `${normalizeNflPikkitName(player.team ?? '')}:${player.playerKey}`
      const fallback = `:${player.playerKey}`
      const pick = { propType: market.propType, label: market.label, rawMarket: market.rawLabel, picks: player.picks, capturedAt: snapshot.capturedAt }
      picksByPlayer.set(key, [...(picksByPlayer.get(key) ?? []), pick])
      if (fallback !== key) picksByPlayer.set(fallback, [...(picksByPlayer.get(fallback) ?? []), pick])
    }
  }
  return {
    ...board,
    pikkitCapturedAt: snapshot.capturedAt,
    players: board.players.map(player => {
      const name = normalizeNflPikkitName(player.name)
      const exact = picksByPlayer.get(`${normalizeNflPikkitName(player.team)}:${name}`)
      return { ...player, publicPicks: exact ?? picksByPlayer.get(`:${name}`) ?? [] }
    }),
  }
}
