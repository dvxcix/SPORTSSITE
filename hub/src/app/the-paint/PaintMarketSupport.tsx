'use client'
import { useState } from 'react'
import { ArrowDownRight, ArrowUpRight, ChevronDown } from 'lucide-react'
import { BookLogo } from '@/components/BookLogo'
import { nbaBinary, PAINT_MARKETS, type PaintMarket } from '@/lib/nbaPaint'
import type { NbaMarketSignal } from '@/lib/nbaMarketSignal'
import { PaintPriceValue } from './PaintPrice'
import polish from './research-polish.module.css'

type Signal = Pick<NbaMarketSignal, 'playerId' | 'book' | 'target' | 'related' | 'targetPicks' | 'relatedPicks'>
type Support = { status: string; reason?: string; signal: Signal | null; publicCapturedAt: string | null; marketCapturedAt: string | null }
type OpenQuote = (market: PaintMarket, book: string, quote: NbaMarketSignal['target']) => void
type QuoteHref = (market: PaintMarket, book: string, quote: NbaMarketSignal['target']) => string
const label = (market: PaintMarket) => PAINT_MARKETS.find(item => item.key === market)?.label ?? market
export function PaintMarketPair({ signal, publicAt, onOpen, href }: { signal: Signal; publicAt?: string | null; onOpen?: OpenQuote; href?: QuoteHref }) {
  return <div className={polish.signalDetails}>
    <div className={polish.signalHeader}><BookLogo vendor={signal.book} size={20}/></div>
    <div className={polish.signalPair}>{[{ quote: signal.target, picks: signal.targetPicks }, { quote: signal.related, picks: signal.relatedPicks }].map(({ quote, picks }) => {
      const content = <><strong>{label(quote.market)} · {nbaBinary(quote.market) ? 'Yes' : quote.type === 'milestone' ? `${quote.line}+` : `O ${quote.line}`}</strong><span className={polish.signalDirection} data-direction={quote.changePp < 0 ? 'longer' : 'shorter'}>{quote.changePp < 0 ? <ArrowUpRight size={13}/> : <ArrowDownRight size={13}/>} {quote.changePp < 0 ? 'Lengthening' : 'Shortening'}</span><PaintPriceValue current={quote.now} opening={quote.open} at={quote.openedAt} compact/><small>{picks.toLocaleString()} category picks</small></>
      return href ? <a key={quote.market} className={polish.signalQuote} href={href(quote.market, signal.book, quote)}>{content}</a> : <button key={quote.market} className={polish.signalQuote} onClick={() => onOpen?.(quote.market, signal.book, quote)}>{content}</button>
    })}</div>
    {publicAt && <div className={polish.signalFoot}><time dateTime={publicAt}>{new Date(publicAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' })} ET</time></div>}
  </div>
}
export function PaintMarketSupport({ support, onOpen, href }: { support?: Support | null; onOpen?: OpenQuote; href?: QuoteHref }) {
  const [expanded, setExpanded] = useState(false)
  if (!support?.signal || support.status !== 'confirmed') {
    const state = !support ? 'Loading…' : support.status === 'stale' || support.status === 'quote_changed' ? 'Updating' : support.status === 'under_unsupported' ? 'Over-side only' : support.status === 'none' ? 'No opposing moves' : support.reason === 'No market quote available' ? 'No market' : 'Awaiting data'
    return <span className={polish.signalEmpty}>{state}</span>
  }
  const quote = support.signal.target
  const target = nbaBinary(quote.market) ? 'Yes' : quote.type === 'milestone' ? `${quote.line}+` : `O ${quote.line}`
  return <div className={polish.signalCell}><button className={polish.signalButton} aria-expanded={expanded} onClick={() => setExpanded(value => !value)}><BookLogo vendor={support.signal.book} size={16}/><ArrowUpRight size={14}/><span>Opposing moves<small className={polish.subtle}>{label(quote.market)} · {target}</small></span><ChevronDown size={13} style={{ transform: expanded ? 'rotate(180deg)' : undefined }}/></button>{expanded && <PaintMarketPair signal={support.signal} publicAt={support.publicCapturedAt} onOpen={onOpen} href={href}/>}</div>
}
