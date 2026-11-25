import 'server-only'
import { mlbHeadshot } from '@slipsurge/core/mlb-api'
import { getTeamLogoPngUrl, MLB_TEAM_COLORS, MLB_TEAM_SECONDARY_COLORS } from '@slipsurge/core/mlbTeamColors'
import { loadMlbComposerGames } from '@/lib/mlbComposerGames'
import { supportsMlbPick } from '@/lib/pickGrading'
import { PROP_META } from '@/lib/watchlist'

type Properties = Record<string, Record<string, number> | undefined>
type Market = { key: string; prop_type: string; label: string; line: number | null;
  offers: { vendor: string; odds: number; side: 'over' | 'milestone' }[] }

export function nativeMlbMarkets(props: Properties | null): Market[] {
  if (!props) return []
  const markets = new Map<string, Market>()
  for (const [key, meta] of Object.entries(PROP_META)) {
    for (const [vendor, odds] of Object.entries(props[key] ?? {})) {
      if (!/^[a-z0-9_]{1,35}$/.test(vendor) || !Number.isSafeInteger(odds) || Math.abs(odds) < 100) continue
      const recordedLine = props[`${key}_line`]?.[vendor]
      const pitcher = key === 'pitcher_strikeouts'
      if (key === 'hrr' && recordedLine !== 0.5) continue
      // This capture retains the over price. Half-number thresholds have the
      // same winning outcome for whole-number strikeouts across book formats.
      if (pitcher && (recordedLine == null || recordedLine < 0 || recordedLine % 1 !== 0.5)) continue
      const line = pitcher ? recordedLine ?? null : null
      const side = pitcher ? 'over' : 'milestone'
      if (!supportsMlbPick({ pick_type: meta.pickType, market_side: side, numeric_line: line })) continue
      const identity = `${key}:${line ?? ''}`
      const market = markets.get(identity) ?? { key, prop_type: key, label: meta.label, line, offers: [] }
      market.offers.push({ vendor, odds, side })
      markets.set(identity, market)
    }
  }
  return [...markets.values()]
}

export async function nativeMlbPickSlate(date: string) {
  const { games } = await loadMlbComposerGames(date, true)
  return games.map(game => ({
    gameKey: game.gameKey,
    gamePk: String(game.gamePk),
    gameDate: date,
    gameTime: game.gameDate,
    homeAbbr: game.homeAbbr,
    awayAbbr: game.awayAbbr,
    homeTeam: game.homeTeam,
    awayTeam: game.awayTeam,
    homeLogo: getTeamLogoPngUrl(game.homeAbbr),
    awayLogo: getTeamLogoPngUrl(game.awayAbbr),
    status: game.status,
    players: [...game.awayLineup, ...game.homeLineup, ...('pitchers' in game ? game.pitchers ?? [] : [])].flatMap(player => {
      const markets = nativeMlbMarkets(player.props)
      return markets.length ? [{ player_id: `mlb:${player.mlb_id}`, mlb_id: player.mlb_id, name: player.name,
        team: player.team, position: player.position, headshot_url: mlbHeadshot(player.mlb_id),
        teamLogo: getTeamLogoPngUrl(player.team), colors: [MLB_TEAM_COLORS[player.team], MLB_TEAM_SECONDARY_COLORS[player.team]].filter(Boolean),
        markets }] : []
    }),
  }))
}

export function findNativeMlbPick(games: Awaited<ReturnType<typeof nativeMlbPickSlate>>, leg: {
  game_pk: string | null; mlb_id?: number | null; player_id?: string | null; player_name: string; team: string | null;
  prop_key: string; numeric_line?: number | null; market_side?: string | null; book: string | null; odds: number | null;
}) {
  const game = games.find(item => item.gamePk === leg.game_pk)
  if (!game || !(Date.parse(game.gameTime) > Date.now())) return null
  const player = game.players.find(item => item.mlb_id === leg.mlb_id && item.player_id === leg.player_id
    && item.name === leg.player_name && item.team === leg.team)
  const market = player?.markets.find(item => item.prop_type === leg.prop_key && item.line === (leg.numeric_line ?? null))
  const offer = market?.offers.find(item => item.vendor === leg.book && item.side === leg.market_side && item.odds === leg.odds)
  return player && market && offer ? { game, player, market, offer } : null
}
