import { PAINT_MARKETS, nbaTeamLogo, type PaintGame, type PaintProp, type PaintRoster } from './nbaPaint'

/** Preserve the exact line, market type and player identity used by server validation. */
export function nbaComposerGame(game: PaintGame, roster: PaintRoster[], props: PaintProp[], now = Date.now()) {
  const starts = Date.parse(game.datetime ?? game.status)
  const open = Number.isFinite(starts) && starts > now && ['scheduled', 'unknown', undefined].includes(game.status_state)
  return {
    gameKey: String(game.id), gamePk: String(game.id), gameDate: game.date,
    gameTime: Number.isFinite(starts) ? new Date(starts).toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit' }) + ' ET' : null,
    homeAbbr: game.home_team.abbreviation, awayAbbr: game.visitor_team.abbreviation,
    homeTeam: game.home_team.full_name, awayTeam: game.visitor_team.full_name,
    homeLogo: nbaTeamLogo(game.home_team.abbreviation), awayLogo: nbaTeamLogo(game.visitor_team.abbreviation), status: open ? 'Preview' : 'Started',
    players: roster.filter(player => [game.home_team.id, game.visitor_team.id].includes(player.team.id)).map(player => {
      const markets = new Map<string, { key: string; prop_type: string; label: string; line: number; offers: { vendor: string; side: 'milestone' | 'over' | 'under'; odds: number }[] }>()
      for (const prop of props) {
        const definition = PAINT_MARKETS.find(market => market.key === prop.prop_type)
        const line = Number(prop.line_value)
        if (prop.game_id !== game.id || prop.player_id !== player.id || !definition || !Number.isFinite(line) || line < 0) continue
        const key = `${prop.prop_type}:${prop.market.type}`
        const identity = `${key}:${line}`
        const market = markets.get(identity) ?? { key, prop_type: prop.prop_type, label: definition.label, line, offers: [] }
        const offers = prop.market.type === 'milestone' ? [{ side: 'milestone' as const, odds: prop.market.odds }] : [{ side: 'over' as const, odds: prop.market.over_odds }, { side: 'under' as const, odds: prop.market.under_odds }]
        for (const offer of offers) if (offer.odds != null && Number.isFinite(offer.odds)) market.offers.push({ vendor: prop.vendor, side: offer.side, odds: offer.odds })
        if (market.offers.length) markets.set(identity, market)
      }
      return { player_id: `bdl:${player.id}`, mlb_id: null, name: `${player.first_name} ${player.last_name}`, team: player.team.abbreviation, team_logo_url: nbaTeamLogo(player.team.abbreviation), position: player.position, headshot_url: null, markets: [...markets.values()] }
    }).filter(player => player.markets.length > 0),
  }
}
