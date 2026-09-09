import type { NflOddsPlayer, NflMarketOffer } from './nflOddsTypes'
import { americanImpliedProbability, impliedProbabilityRatio } from './nflMarketMath'
import { nflPrimaryMarket } from './nflPrimaryMarket'
import type { NflMatrixFactor } from './nflMatrix'

export type LadderSide = 'over' | 'under'
export const PICK_MODEL = 'ladder-v1'
export function ladderPrice(offer: NflMarketOffer, side: LadderSide, opening = false) {
  const value = opening ? offer.opening : offer.current
  return (offer.type === 'milestone' ? side === 'over' ? value?.odds : null : value?.[side]) ?? null
}
export function ladderOffers(player: NflOddsPlayer, prop: string, vendor: string, side: LadderSide = 'over') {
  return player.markets.filter(m => m.propType === prop).flatMap(m => m.offers
    .filter(o => o.vendor === vendor && ladderPrice(o, side) != null)
    .map(offer => ({ market: m, offer, line: offer.line ?? m.line })))
    .sort((a, b) => (a.line ?? 0) - (b.line ?? 0) || a.offer.type.localeCompare(b.offer.type))
}
export function observedPropPicks(player: NflOddsPlayer, prop: string) {
  const values = (player.publicPicks ?? []).filter(p => p.propType === prop && p.line == null).map(p => p.picks).filter(n => Number.isFinite(n) && n >= 0)
  return values.length ? Math.max(...values) : null
}
/** Assumed allocation, not observed wagering: 60% on primary, 30% on lower
 * contracts and 10% on higher contracts, with exponential tail decay. Missing
 * sides redistribute their weight. Largest remainders conserve the input total.
 * This models OVER / milestone interest only; no inferred UNDER counts. */
export function estimateLadderPicks(player: NflOddsPlayer, prop: string, vendor: string) {
  const total = observedPropPicks(player, prop)
  const entries = ladderOffers(player, prop, vendor).filter(e => e.line != null)
  const primary = nflPrimaryMarket(player, prop, vendor)
  if (total == null || !entries.length || !primary) return new Map<string, number>()
  const anchor = entries.findIndex(e => e.market.key === primary.key)
  if (anchor < 0) return new Map<string, number>()
  const known = entries.map(e=>contractPicks(player,prop,e.line!,'over',e.offer.type))
  const knownTotal=known.reduce<number>((sum,n)=>sum+(n??0),0)
  if(knownTotal>total)return new Map<string,number>()
  const weights = entries.map((_, i) => i === anchor ? .6 : (i < anchor ? .3 : .1) * Math.exp(-.7 * Math.abs(i - anchor)))
  for (const indices of [entries.map((_, i) => i).filter(i => i < anchor), entries.map((_, i) => i).filter(i => i > anchor)]) {
    const sum = indices.reduce((n, i) => n + weights[i], 0)
    const mass = indices[0] < anchor ? .3 : .1
    if (sum) indices.forEach(i => { weights[i] = weights[i] / sum * mass })
  }
  known.forEach((n,i)=>{if(n!=null)weights[i]=0})
  const sum = weights.reduce((a,b) => a+b, 0)
  if(!sum)return new Map<string,number>()
  const remaining=Math.floor(total)-knownTotal
  const exact = weights.map(w => remaining * w / sum)
  const counts = exact.map(Math.floor)
  const remainder = remaining - counts.reduce((a,b)=>a+b,0)
  exact.map((v,i)=>({i,f:v-counts[i]})).sort((a,b)=>b.f-a.f||a.i-b.i).slice(0,remainder).forEach(({i})=>counts[i]++)
  return new Map(entries.flatMap((e,i)=>known[i]==null?[[e.market.key,counts[i]] as [string,number]]:[]))
}
export function contractPicks(player: NflOddsPlayer, prop: string, line: number, side: LadderSide, kind: NflMarketOffer['type']) {
  return player.publicPicks?.find(p => p.propType === prop && p.line === line && p.side === side && p.kind === kind)?.picks ?? null
}
export function ladderMatrixValue(player: NflOddsPlayer | null, factor: NflMatrixFactor) {
  if (!player) return null
  const prop = factor.propType ?? 'anytime_td', vendor = factor.vendor ?? 'fanduel', side = factor.marketSide ?? 'over'
  const matches = ladderOffers(player, prop, vendor, side).filter(e => e.line === factor.marketLine && (!factor.marketKind || e.offer.type === factor.marketKind))
  const target = factor.marketLine == null ? nflPrimaryMarket(player, prop, vendor) : matches.length === 1 ? matches[0].market : null
  if (factor.category === 'picks') return factor.marketLine == null ? observedPropPicks(player, prop) : target ? contractPicks(player, prop, factor.marketLine, side, matches[0].offer.type) : null
  const offer = target?.offers.find(o => o.vendor === vendor && (!factor.marketKind || o.type === factor.marketKind))
  if (!target || !offer) return null
  const now = ladderPrice(offer, side), open = ladderPrice(offer, side, true)
  if (factor.marketValue === 'estimated_picks') return side === 'over' ? estimateLadderPicks(player, prop, vendor).get(target.key) ?? null : null
  if (factor.marketValue === 'line') return offer.line
  if (factor.marketValue === 'opening') return open
  if (factor.marketValue === 'move') return now != null && open != null && offer.line === offer.openingLine ? now-open : null
  if (factor.marketValue === 'probability_move') { const a=americanImpliedProbability(now), b=americanImpliedProbability(open); return a!=null && b!=null && offer.line===offer.openingLine ? Math.round((a-b)*10000)/100 : null }
  if (factor.marketValue === 'ratio' || factor.marketValue === 'ratio_move') {
    const td = nflPrimaryMarket(player, 'anytime_td', vendor)?.offers.find(o=>o.vendor===vendor)
    if (!td) return null
    const ratio = impliedProbabilityRatio(ladderPrice(td,'over'),now)
    if (factor.marketValue === 'ratio') return ratio
    const opening = impliedProbabilityRatio(ladderPrice(td,'over',true),open)
    return ratio!=null && opening!=null && offer.line===offer.openingLine ? Math.round((ratio-opening)*100)/100 : null
  }
  return now
}
