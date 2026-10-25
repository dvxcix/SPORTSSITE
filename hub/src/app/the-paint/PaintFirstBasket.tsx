'use client'
import { nbaModeHref } from '@/lib/nbaModeHref'
import { nbaResearchRevision } from '@/lib/nbaResearchRevision'
import { useNbaOddsMode } from '@/components/nba/NbaOddsModeContext'
import { useEffect, useState } from 'react'
import type { PaintBoard } from '@/lib/nbaPaint'
import type { nbaFirstBasketResearch } from '@/lib/nbaFirstBasket'
import { watchNbaRefresh } from '@/lib/nbaRefresh'
import { PlayerAvatar } from './PaintVisuals'
import styles from './paint.module.css'
import { PaintFirstBasketOdds } from './PaintFirstBasketOdds'
import { PaintSortHeader } from './PaintSortHeader'

type Research = ReturnType<typeof nbaFirstBasketResearch>
export function PaintFirstBasket({board,open}:{board:PaintBoard;open:(id:number)=>void}) {
  const oddsMode = useNbaOddsMode()
  const dataKey=`${oddsMode}:${board.game.id}:${nbaResearchRevision(board)}`
  const [state,setState]=useState<{key:string;data:Research}|null>(null),[error,setError]=useState(''),[retry,setRetry]=useState(0)
  const [team,setTeam]=useState('all'),[query,setQuery]=useState(''),[sort,setSort]=useState('firstFieldGoals'),[ascending,setAscending]=useState(false)
  useEffect(()=>{
    const controller=new AbortController();let pending=false
    const update=async()=>{if(pending)return;pending=true;try{
      const response=await fetch(nbaModeHref(`/the-paint/first-basket?game=${board.game.id}`, oddsMode),{cache:'no-store',signal:AbortSignal.any([controller.signal,AbortSignal.timeout(115000)])})
      if(!response.ok)throw new Error('First-basket research could not load.')
      const data=await response.json() as Research
      if(!controller.signal.aborted){setState({key:dataKey,data});setError('')}
    }catch{if(!controller.signal.aborted)setError('First-basket research could not refresh.')}finally{pending=false}}
    void update();const stop=watchNbaRefresh(update);return()=>{controller.abort();stop()}
  },[oddsMode, board.game.id,dataKey,retry])
  const data=state?.key===dataKey?state.data:null
  const teams=[board.game.visitor_team,board.game.home_team],selectedTeam=teams.some(value=>String(value.id)===team)?team:'all'
  const rows=(data?.rows??[]).flatMap(row=>{const player=board.players.find(p=>p.id===row.playerId);return player&&row.games>0?[{...row,player}]:[]})
    .filter(row=>(selectedTeam==='all'||String(row.player.team.id)===selectedTeam)&&`${row.player.first_name} ${row.player.last_name}`.toLowerCase().includes(query.toLowerCase()))
    .sort((a,b)=>{const field=sort as 'games'|'firstFieldGoals'|'firstScores'|'firstAttempts'|'teamFirstFieldGoals';return (sort==='name'?`${a.player.last_name} ${a.player.first_name}`.localeCompare(`${b.player.last_name} ${b.player.first_name}`):a[field]-b[field])*(ascending?1:-1)||a.player.last_name.localeCompare(b.player.last_name)})
  const sortBy=(column:string)=>{if(column===sort)setAscending(value=>!value);else{setSort(column);setAscending(column==='name')}}
  return <section className={styles.movement} aria-label="NBA first-basket research">
    <PaintFirstBasketOdds key={board.game.date} date={board.game.date}/>
    <div className={styles.sectionHeading}><h3>First basket</h3><span>Opening tip · First shot · First field goal</span></div>
    {error&&<p role="status" className={styles.notice}>{error} <button onClick={()=>setRetry(n=>n+1)}>Retry</button></p>}
    {!data&&!error&&<p role="status" className={styles.panelEmpty}>Loading opening-play research…</p>}
    {data&&<><p className={styles.finePrint}>{data.coveredGames}/{data.requestedGames} games · Opening-play sample</p>
      <div className={styles.advancedGrid}>{data.teams.map(row=><span key={row.teamId}><small>{[board.game.home_team,board.game.visitor_team].find(t=>t.id===row.teamId)?.full_name} · Opening tip wins</small><b>{row.tips?`${row.tipWins}/${row.tips}`:'No verified tip sample'}</b></span>)}</div>
      <div className={styles.movementTools}><label>Team<select aria-label="First-basket history team" value={selectedTeam} onChange={event=>setTeam(event.target.value)}><option value="all">Both teams</option>{teams.map(value=><option key={value.id} value={value.id}>{value.full_name}</option>)}</select></label><input aria-label="Search first-basket history" placeholder="Find a player" value={query} onChange={event=>setQuery(event.target.value)}/></div>
      {rows.length?<div className={styles.researchScroll} role="region" aria-label="First-basket player research table" tabIndex={0}><table className={styles.researchTable}><thead><tr>{[{column:'name',label:'Player'},{column:'games',label:'Appearances'},{column:'firstFieldGoals',label:'Game first FG'},{column:'firstScores',label:'Game first score'},{column:'firstAttempts',label:'Game first FG attempt'},{column:'teamFirstFieldGoals',label:'Team first FG'}].map(item=><PaintSortHeader key={item.column} {...item} active={sort} ascending={ascending} onSort={sortBy}/>)}</tr></thead><tbody>{rows.map(row=>{const p=row.player;return <tr key={p.id}><th><button className={styles.playerButton} onClick={()=>open(p.id)}><PlayerAvatar player={p}/><span><strong>{p.first_name} {p.last_name}</strong><small>{p.position}</small></span></button></th><td>{row.games}</td><td>{row.firstFieldGoals}</td><td>{row.firstScores}</td><td>{row.firstAttempts}</td><td>{row.teamFirstFieldGoals}</td></tr>})}</tbody></table></div>:<p className={styles.panelEmpty}>No matching opening-play samples.</p>}</>}
  </section>
}
