'use client'
import { useEffect, useState } from 'react'
import type { PaintBoard } from '@/lib/nbaPaint'
import type { nbaFirstBasketResearch } from '@/lib/nbaFirstBasket'
import { watchNbaRefresh } from '@/lib/nbaRefresh'
import { PlayerAvatar } from './PaintVisuals'
import styles from './paint.module.css'
import { PaintFirstBasketOdds } from './PaintFirstBasketOdds'

type Research = ReturnType<typeof nbaFirstBasketResearch>
export function PaintFirstBasket({board,open}:{board:PaintBoard;open:(id:number)=>void}) {
  const [state,setState]=useState<{game:number;data:Research}|null>(null),[error,setError]=useState(''),[retry,setRetry]=useState(0)
  useEffect(()=>{
    const controller=new AbortController();let pending=false
    const update=async()=>{if(pending)return;pending=true;try{
      const response=await fetch(`/the-paint/first-basket?game=${board.game.id}`,{cache:'no-store',signal:AbortSignal.any([controller.signal,AbortSignal.timeout(115000)])})
      if(!response.ok)throw new Error('First-basket research could not load.')
      const data=await response.json() as Research
      if(!controller.signal.aborted){setState({game:board.game.id,data});setError('')}
    }catch{if(!controller.signal.aborted)setError('First-basket research could not refresh.')}finally{pending=false}}
    void update();const stop=watchNbaRefresh(update);return()=>{controller.abort();stop()}
  },[board.game.id,retry])
  const data=state?.game===board.game.id?state.data:null
  const rows=(data?.rows??[]).filter(row=>row.games>0).sort((a,b)=>b.firstFieldGoals-a.firstFieldGoals||b.firstAttempts-a.firstAttempts)
  return <section className={styles.movement} aria-label="NBA first-basket research">
    <PaintFirstBasketOdds date={board.game.date}/>
    <div className={styles.sectionHeading}><h3>First basket</h3><span>Opening tip · First shot · First field goal</span></div>
    <p className={styles.finePrint}>First field goal excludes free throws. First score includes them. Counts use verified opening sequences and each player’s observed appearances for their current team; they are not rates per start.</p>
    {error&&<p role="status" className={styles.notice}>{error} <button onClick={()=>setRetry(n=>n+1)}>Retry</button></p>}
    {!data&&!error&&<p role="status" className={styles.panelEmpty}>Loading opening-play research…</p>}
    {data&&<><p className={styles.finePrint}>{data.coveredGames} of {data.requestedGames} recent team games have verified opening coverage. Missing games are excluded.</p>
      <div className={styles.advancedGrid}>{data.teams.map(row=><span key={row.teamId}><small>{[board.game.home_team,board.game.visitor_team].find(t=>t.id===row.teamId)?.full_name} · Opening tip wins</small><b>{row.tips?`${row.tipWins}/${row.tips}`:'No verified tip sample'}</b></span>)}</div>
      {rows.length?<div className={styles.tableScroll} role="region" aria-label="First-basket player research table" tabIndex={0}><table className={styles.table}><thead><tr><th>Player</th><th>Appearances</th><th>Game first FG</th><th>Game first score</th><th>Game first FG attempt</th><th>Team first FG</th></tr></thead><tbody>{rows.map(row=>{const p=board.players.find(p=>p.id===row.playerId)!;return <tr key={p.id}><td><button className={styles.playerButton} onClick={()=>open(p.id)}><PlayerAvatar player={p}/><span>{p.first_name} {p.last_name}</span></button></td><td>{row.games}</td><td>{row.firstFieldGoals}</td><td>{row.firstScores}</td><td>{row.firstAttempts}</td><td>{row.teamFirstFieldGoals}</td></tr>})}</tbody></table></div>:<p className={styles.panelEmpty}>Opening-play coverage is not available for this matchup’s recent games yet.</p>}</>}
  </section>
}
