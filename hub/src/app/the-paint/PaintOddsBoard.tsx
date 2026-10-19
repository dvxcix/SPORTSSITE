'use client'
import { useState } from 'react'
import { BookLogo } from '@/components/BookLogo'
import { nbaPrice, nbaTarget, nbaReference, type PaintBoard, type PaintMarket, type PaintPlayer, type PaintProp } from '@/lib/nbaPaint'
import type { PaintRanks } from '@/lib/nbaMarketMetrics'
import { PaintPickActions } from './PaintPickActions'
import { PlayerAvatar } from './PaintVisuals'
import { PaintPrice } from './PaintPrice'
import { PaintSortHeader } from './PaintSortHeader'
import styles from './paint.module.css'

export function PaintOddsBoard({ players, board, market, side, vendors, ranks, open }: { players: PaintPlayer[]; board: PaintBoard; market: PaintMarket; side: 'over' | 'under'; vendors: string[]; ranks: Map<number, PaintRanks>; open: (id: number, offer?: PaintProp) => void }) {
  const [sort,setSort]=useState('initial'),[ascending,setAscending]=useState(false)
  const sortBy=(column:string)=>{setAscending(sort===column?!ascending:column==='name');setSort(column)}
  const activeSort=sort==='name'||sort==='mm'||vendors.includes(sort)?sort:'initial'
  const rows=players.map(player=>({player,offers:new Map(vendors.map(v=>[v,nbaReference(player.props,market,v,side)]))})).sort((a,b)=>{
    if(activeSort==='initial')return 0
    if(activeSort==='name')return `${a.player.first_name} ${a.player.last_name}`.localeCompare(`${b.player.first_name} ${b.player.last_name}`)*(ascending?1:-1)
    const first=a.offers.get(activeSort),second=b.offers.get(activeSort)
    const av=activeSort==='mm'?ranks.get(a.player.id)?.mm:first?nbaPrice(first,side):null,bv=activeSort==='mm'?ranks.get(b.player.id)?.mm:second?nbaPrice(second,side):null
    if(av==null||bv==null)return av==null?bv==null?a.player.id-b.player.id:1:-1
    return (av-bv)*(ascending?1:-1)||a.player.id-b.player.id
  })
  return <div className={styles.oddsScroll} role="region" aria-label="NBA sportsbook comparison" tabIndex={0}><table className={styles.oddsTable}><caption className={styles.srOnly}>NBA sportsbook comparison. Each book cell shows its own line and price.</caption><thead><tr><PaintSortHeader label="Player" column="name" active={activeSort} ascending={ascending} onSort={sortBy}/><PaintSortHeader label="MM" column="mm" active={activeSort} ascending={ascending} onSort={sortBy}/>{vendors.map(v => <PaintSortHeader key={v} label={`Sort ${v} odds`} column={v} active={activeSort} ascending={ascending} onSort={sortBy}><BookLogo vendor={v} size={23}/><span>{v}</span></PaintSortHeader>)}</tr></thead><tbody>{rows.map(({player,offers}) => { const rank = ranks.get(player.id); return <tr key={player.id}><th><button className={styles.playerButton} onClick={() => open(player.id)}><PlayerAvatar player={player}/><span><strong>{player.first_name} {player.last_name}</strong><small>{player.team.name}</small></span></button></th><td><b className={rank?.mm == null ? styles.muted : rank.mm > 0 ? styles.hit : rank.mm < 0 ? styles.miss : styles.muted}>{rank ? `${rank.mm > 0 ? '+' : ''}${rank.mm}` : '—'}</b></td>{vendors.map(v => { const offer = offers.get(v); return <td key={v}>{offer ? <div className={styles.bookQuote}><button aria-label={`Analyze ${player.first_name} ${player.last_name}, ${nbaTarget(offer, side)}, ${offer.vendor}`} onClick={() => open(player.id, offer)}><small>{nbaTarget(offer, side)}</small><PaintPrice offer={offer} side={side} compact/></button><PaintPickActions player={player} offer={offer} side={side} game={board.game}/></div> : <span className={styles.muted}>—</span>}</td> })}</tr> })}</tbody></table></div>
}
