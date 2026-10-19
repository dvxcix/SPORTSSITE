import { nbaMarketLogs, nbaAverage, nbaHitRate, nbaMinutes, nbaPeriod, nbaReference, nbaSample, nbaValue, PAINT_MARKETS, type PaintBoard, type PaintPlayer, type PaintMarket } from './nbaPaint'
import { nbaFormGap, nbaMarketRanks } from './nbaMarketMetrics'

export type PaintScouting = { season: number; fetchedAt: string; issues: string[]; players: { id: number; advanced: Record<string, number | null>; passing: Record<string, number | null>; rebounding: Record<string, number | null>; drives: Record<string, number | null> }[] }

export function nbaRole(player: PaintPlayer, count = 10) {
  const logs = nbaSample(player.logs, count)
  const mean = (field: string) => { const values = logs.map(l => field === 'min' ? nbaMinutes(l.min) : (l as unknown as Record<string, number | null>)[field]).filter((v): v is number => typeof v === 'number' && Number.isFinite(v)); return values.length ? values.reduce((a,b)=>a+b,0)/values.length : null }
  const minutes = mean('min'), fga = mean('fga'), fg3a = mean('fg3a'), fta = mean('fta')
  const previous = nbaSample(player.logs, count * 2).slice(count)
  const priorMinutes = previous.length ? previous.reduce((n,l)=>n+(nbaMinutes(l.min)??0),0)/previous.length : null
  return { games: logs.length, minutes, fga, fg3a, fta, minutesChange: minutes != null && priorMinutes != null && logs.length >= 5 && previous.length >= 5 ? minutes - priorMinutes : null, per36: (market: PaintMarket) => { const value=nbaAverage(logs,market); return value!=null && minutes!=null && minutes>0 ? value/minutes*36 : null } }
}

export function nbaCheatsheet(players: PaintPlayer[], vendor = 'all', side: 'over'|'under' = 'over', location: 'all'|'home'|'away' = 'all', coverage?: Pick<PaintBoard, 'statsComplete' | 'periodStatsComplete'>) {
  return PAINT_MARKETS.flatMap(m => {
    const ranks=nbaMarketRanks(players,m.key,vendor,location)
    const complete=coverage?.statsComplete!==false&&(!nbaPeriod(m.key)||coverage?.periodStatsComplete!==false)
    return players.flatMap(player=>{
      const offer=nbaReference(player.props,m.key,vendor,side), logs=nbaSample(nbaMarketLogs(player, m.key),10,location)
      if(!offer || logs.length<5)return []
      const line=Number(offer.line_value), hit=nbaHitRate(logs,m.key,line,side,offer.market.type==='milestone'), average=nbaAverage(logs,m.key)
      return [{ player, market:m, offer, hit, average, season:nbaValue(player.average,m.key), mm:complete?ranks.get(player.id)?.mm??null:null, gap:nbaFormGap(average,offer,side) }]
    })
  })
}
