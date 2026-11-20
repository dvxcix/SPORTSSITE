import type { NflMarketOffer } from '@/lib/nflOddsTypes'
import { americanImpliedProbability } from '@/lib/nflMarketMath'
import { MarketMovement } from '@/components/research/ResearchMetrics'
import styles from './nflQuote.module.css'

export type NflQuoteSide = 'odds'|'over'|'under'
const price=(value:number|null|undefined)=>americanImpliedProbability(value??null)==null?'—':value!>0?'+'+value:String(value)

/** Presentation only: movement compares the same observed line and side. */
export function NflQuote({offer,side,neutralLine=false}:{offer:NflMarketOffer;side:NflQuoteSide;neutralLine?:boolean}) {
  const current=offer.isOpeningOnly?null:offer.current[side], opening=offer.opening?.[side]??(offer.isOpeningOnly?offer.current[side]:null)
  const now=americanImpliedProbability(current??null), before=americanImpliedProbability(opening??null)
  const comparable=offer.line===offer.openingLine&&offer.line!=null
  const movement=comparable&&now!=null&&before!=null?(now-before)*100:null
  const line=offer.line==null?'':neutralLine?`Line ${offer.line}`:offer.type==='milestone'?`${offer.line}+`:`${side==='under'?'U':'O'} ${offer.line}`
  const openingLine=offer.openingLine!=null&&offer.openingLine!==offer.line?neutralLine?`line ${offer.openingLine} · `:offer.type==='milestone'?`${offer.openingLine}+ `:`${side==='under'?'U':'O'} ${offer.openingLine} `:''
  return <span className={styles.quote}>
    <span className={styles.current}><span>{line}</span><b>{price(current)}</b></span>
    <span className={styles.reference}><span aria-label={offer.openingLine==null?'Opening price; opening line unavailable':undefined}>Open {openingLine}{price(opening)}</span><MarketMovement value={movement}/></span>
  </span>
}
