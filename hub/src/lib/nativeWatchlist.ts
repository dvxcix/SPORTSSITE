import 'server-only'
import { getSidelineGames, getSidelineOddsBundle } from '@/app/the-sideline/data'
import { findNflPickOffer } from '@/lib/nflPickOffer'
import { nflWatchlistPrice, nflWatchlistSelection } from '@/lib/nflWatchlist'
import { validatePaintPickLegs, type PaintPickLeg } from '@/lib/nbaPickValidation'
import { requirePaintAccess } from '@/lib/paintAccess'
import { MLB_HIBERNATING } from '@/lib/mlbOffseason'
import { findNativeMlbPick, nativeMlbPickSlate } from '@/lib/nativeMlbPickMarkets'

type Input = PaintPickLeg & { sport: 'NFL' | 'NBA' | 'MLB'; headshot_url?: string | null; mlb_id?: number | null }

function savedInput(raw: unknown): Input | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const item = raw as Input
  if ((item.sport !== 'NFL' && item.sport !== 'NBA' && item.sport !== 'MLB') || typeof item.player_name !== 'string' || item.player_name.length > 100 ||
    typeof item.player_id !== 'string' || !/^[A-Za-z0-9:.-]{1,50}$/.test(item.player_id) || typeof item.game_pk !== 'string' ||
    !/^[a-zA-Z0-9_]{1,45}$/.test(item.game_pk) || typeof item.game_date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(item.game_date) ||
    typeof item.prop_key !== 'string' || !/^[a-z0-9_]{1,60}$/.test(item.prop_key) || typeof item.book !== 'string' ||
    !/^[a-z0-9_]{1,35}$/.test(item.book) || !Number.isInteger(item.odds) || !['over','under','milestone'].includes(item.market_side ?? '') ||
    (item.numeric_line != null && (typeof item.numeric_line !== 'number' || !Number.isFinite(item.numeric_line)))) return null
  return item
}

function safeHeadshot(value: unknown) {
  if (typeof value !== 'string') return null
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && !url.username && !url.password && !url.port &&
      ['a.espncdn.com','cdn.nba.com','static.www.nfl.com'].includes(url.hostname) ? url.href : null
  } catch { return null }
}

export async function nativeSavedMarket(raw: unknown) {
  const item = savedInput(raw)
  if (!item || item.odds == null || !item.book || !item.game_pk || !item.game_date) return { error: 'Check your market selection', status: 400 } as const
  if (item.sport === 'MLB') {
    if (MLB_HIBERNATING) return { error: 'MLB picks are paused for the off-season', status: 409 } as const
    if (!Number.isFinite(Date.parse(item.game_date)) || new Date(item.game_date).toISOString().slice(0, 10) !== item.game_date) {
      return { error: 'Choose a valid MLB slate date', status: 400 } as const
    }
    const verified = findNativeMlbPick(await nativeMlbPickSlate(item.game_date), item)
    if (!verified) return { error: 'That MLB price or line changed. Refresh the market and try again.', status: 409 } as const
    const { player, market, offer } = verified
    return { value: { sport: 'mlb', game_pk: item.game_pk, game_date: item.game_date, mlb_id: player.mlb_id,
      player_name: player.name, team: player.team, position: player.position, headshot_url: player.headshot_url,
      prop_key: market.prop_type, prop_label: market.label, line: market.line == null ? market.label : `Over ${market.line} ${market.label}`,
      book: offer.vendor, odds: offer.odds, odds_by_book: { [offer.vendor]: offer.odds } } } as const
  }
  if (item.sport === 'NBA') {
    const gate = await requirePaintAccess()
    if (gate.error) return { response: gate.error } as const
    const validation = await validatePaintPickLegs([item])
    if ('error' in validation || validation.cutoff <= Date.now()) return { error: 'That NBA line could not be confirmed. Refresh the market.', status: 409 } as const
    const kind = item.market_side === 'milestone' ? 'milestone' : 'over_under'
    const prop = `nba:${item.player_id?.replace(/^bdl:/,'')}:${item.prop_key}:${kind}:${item.numeric_line}:${item.market_side}`
    return { value: { sport: 'nba', game_pk: item.game_pk, game_date: item.game_date, mlb_id: null, player_name: item.player_name,
      team: item.team, headshot_url: safeHeadshot(item.headshot_url), prop_key: prop, prop_label: item.prop_label, line: item.line,
      book: item.book, odds: item.odds, odds_by_book: { [item.book]: item.odds } } } as const
  }

  const slate = await getSidelineGames(item.game_date, item.game_pk)
  const game = slate.games.find(candidate => candidate.id === item.game_pk)
  if (!game) return { error: 'Matchup unavailable', status: 404 } as const
  const { odds, pickCutoff } = await getSidelineOddsBundle(game)
  if (pickCutoff == null || pickCutoff <= Date.now()) return { error: 'This game has already started', status: 409 } as const
  const player = odds.players.find(candidate => (candidate.gsisId ?? `bdl:${candidate.id}`) === item.player_id)
  const found = player ? findNflPickOffer(player, item, game.season) : null
  const side = item.market_side === 'under' ? 'under' : 'over'
  if (!player || !found || nflWatchlistPrice(found.offer, side) !== item.odds) {
    return { error: 'That NFL line changed. Refresh the market and try again.', status: 409 } as const
  }
  return { value: nflWatchlistSelection(player, found.market, found.offer, side, game) } as const
}
