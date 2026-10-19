'use client'
import { useEffect, useMemo, useState } from 'react'
import { Activity, ArrowDown, ArrowUpRight, ClipboardList, HeartPulse, Layers3, Shield, Target } from 'lucide-react'
import { BookLogo, bookName } from '@/components/BookLogo'
import { nbaBinary, nbaPrice, nbaTarget, nbaMarketLogs, nbaAverage, nbaSample, nbaSeason, type PaintBoard, type PaintMarket, type PaintPlayer } from '@/lib/nbaPaint'
import { nbaRosterHistory } from '@/lib/nbaRosterHistory'
import { nbaCheatsheet, nbaRole, type PaintScouting } from '@/lib/nbaResearch'
import { PaintPickActions } from './PaintPickActions'
import { marketNumber, number, PlayerAvatar, TeamLogo } from './PaintVisuals'
import { PaintGamePrice, PaintPrice } from './PaintPrice'
import { PaintHeatCell, PaintHeatLegend } from './PaintHeatCell'
import { nbaCenteredHeat } from './paintHeat'
import { PaintBookSelect } from './PaintEntitySelect'
import styles from './paint.module.css'
import heatmap from './heatmap.module.css'

export const PAINT_TOOLS = [
  {key:'research',label:'ThePaint',icon:Layers3},
  {key:'cheatsheets',label:'Cheatsheets',icon:ClipboardList},
  {key:'usage',label:'Player trends',icon:Activity},
  {key:'score',label:'SlipSurge Score',icon:Target},
  {key:'slate',label:'Slate Edge',icon:Layers3},
  {key:'dvp',label:'Defense × position',icon:Shield},
  {key:'divergence',label:'Cross-market',icon:Activity},
  {key:'matchup',label:'Matchup Lab',icon:Target},
  {key:'availability',label:'Availability',icon:HeartPulse},
  {key:'game-markets',label:'Game markets',icon:Shield},
] as const
export type PaintTool = typeof PAINT_TOOLS[number]['key']

function Identity({player,open}:{player:PaintPlayer;open:(id:number,market?:PaintMarket)=>void}) {
  return <button className={styles.playerButton} aria-label={`Analyze ${player.first_name} ${player.last_name}, ${player.team.full_name}`} onClick={()=>open(player.id)}><PlayerAvatar player={player}/><span><strong>{player.first_name} {player.last_name}</strong><small>{player.position || '—'}</small></span></button>
}

export function PaintCheatsheets({board,players,vendor,side,location,open}:{board:PaintBoard;players:PaintPlayer[];vendor:string;side:'over'|'under';location:'all'|'home'|'away';open:(id:number,market?:PaintMarket)=>void}){
  const [focus,setFocus]=useState('all'),[sort,setSort]=useState<'name'|'mm'|'line'|'price'|'l5'|'hit'|'gap'>('mm'),[ascending,setAscending]=useState(false)
  // Rank against the complete priced matchup pool; filtering never changes a player's MM.
  const scan=useMemo(()=>nbaCheatsheet(board.players,vendor,side,location,{statsComplete:board.statsComplete,periodStatsComplete:board.periodStatsComplete}).map(row=>({...row,l5:nbaAverage(nbaSample(nbaMarketLogs(row.player,row.market.key),5,location),row.market.key)})),[board.players,board.statsComplete,board.periodStatsComplete,vendor,side,location])
  const heatPools=useMemo(()=>{
    const pools=new Map<string,{mm:(number|null)[];l5:(number|null)[];gap:(number|null)[]}>()
    for(const row of scan){const pool=pools.get(row.market.key)??{mm:[],l5:[],gap:[]};pool.mm.push(row.mm);pool.l5.push(row.l5);pool.gap.push(row.gap);pools.set(row.market.key,pool)}
    return pools
  },[scan])
  const rows=useMemo(()=>scan.filter(r=>players.some(p=>p.id===r.player.id)&&(focus==='all'||focus==='positive'&&r.mm!=null&&r.mm>0||focus==='negative'&&r.mm!=null&&r.mm<0||focus===r.market.key)).sort((a,b)=>{
    if(sort==='name')return(ascending?1:-1)*(`${a.player.last_name} ${a.player.first_name}`.localeCompare(`${b.player.last_name} ${b.player.first_name}`))||a.market.key.localeCompare(b.market.key)
    const value=(row:typeof a)=>sort==='hit'?row.hit.rate:sort==='gap'?row.gap:sort==='line'?Number(row.offer.line_value):sort==='price'?nbaPrice(row.offer,side):sort==='l5'?row.l5:row.mm
    const av=value(a),bv=value(b)
    if(av==null||bv==null)return av===bv?0:av==null?1:-1
    return (ascending?1:-1)*(av-bv)||a.player.id-b.player.id||a.market.key.localeCompare(b.market.key)
  }),[scan,players,side,focus,sort,ascending])
  function order(key:typeof sort){if(sort===key)setAscending(v=>!v);else{setSort(key);setAscending(key==='name')}}
  return <div className={`${styles.researchTool} ${heatmap.controls}`}><div className={styles.toolHeading}><div><h3>Player markets</h3><span>{rows.length} priced player markets · L10 · {side}</span></div><select aria-label="Cheatsheet focus" value={focus} onChange={e=>setFocus(e.target.value)}><option value="all">Every market</option><option value="positive">Positive MM</option><option value="negative">Negative MM</option>{[...new Map(scan.map(r=>[r.market.key,r.market])).values()].map(m=><option value={m.key} key={m.key}>{m.label}</option>)}</select></div><div className={heatmap.legendRow}><PaintHeatLegend low="Lower form" high="Higher form"/><PaintHeatLegend low="Lower hit / form edge" high="Higher hit / form edge" tone="performance"/></div><div className={styles.researchScroll} role="region" aria-label="NBA player market heatmap" tabIndex={0}><table className={`${styles.researchTable} ${heatmap.table}`}><thead><tr><th aria-sort={sort==='name'?ascending?'ascending':'descending':'none'}><button onClick={()=>order('name')}>Player / market<ArrowDown size={12}/></button></th><th aria-sort={sort==='mm'?ascending?'ascending':'descending':'none'}><button onClick={()=>order('mm')}>MM<ArrowDown size={12}/></button></th><th aria-sort={sort==='line'||sort==='price'?ascending?'ascending':'descending':'none'}><div className={styles.quoteSort}><button aria-pressed={sort==='line'} onClick={()=>order('line')}>Line</button><button aria-pressed={sort==='price'} onClick={()=>order('price')}>Price<ArrowDown size={12}/></button></div></th><th aria-sort={sort==='l5'?ascending?'ascending':'descending':'none'}><button onClick={()=>order('l5')}>L5<ArrowDown size={12}/></button></th><th aria-sort={sort==='hit'?ascending?'ascending':'descending':'none'}><button onClick={()=>order('hit')}>L10 hit rate<ArrowDown size={12}/></button></th><th aria-sort={sort==='gap'?ascending?'ascending':'descending':'none'}><button onClick={()=>order('gap')}>Form vs line<ArrowDown size={12}/></button></th><th>Save</th></tr></thead><tbody>{rows.map(r=><tr key={`${r.player.id}:${r.market.key}`}><th><Identity player={r.player} open={id=>open(id,r.market.key)}/><button className={styles.marketLink} onClick={()=>open(r.player.id,r.market.key)}>{r.market.label}<ArrowUpRight size={12}/></button></th><td><PaintHeatCell value={r.mm} heat={nbaCenteredHeat(r.mm,heatPools.get(r.market.key)!.mm)} tone="performance" label={`MM: ${r.mm??"unavailable"}`}>{r.mm==null?"—":`${r.mm>0?"+":""}${r.mm}`}</PaintHeatCell></td><td><div className={styles.scanQuote}><BookLogo vendor={r.offer.vendor} size={21}/><span>{nbaTarget(r.offer, side)}<PaintPrice offer={r.offer} side={side} compact/></span></div></td><td><PaintHeatCell value={r.l5} pool={heatPools.get(r.market.key)!.l5} label={`L5 ${r.market.label}: ${marketNumber(r.l5,r.market.key)}`}>{marketNumber(r.l5,r.market.key)}</PaintHeatCell></td><td><PaintHeatCell value={r.hit.rate} heat={r.hit.rate} tone="performance" label={`L10 ${side} hit rate: ${r.hit.rate==null?"unavailable":Math.round(r.hit.rate)+"%"}`}>{r.hit.rate==null?'—':`${Math.round(r.hit.rate)}%`}<small>{r.hit.wins}/{r.hit.games-r.hit.pushes}{r.hit.pushes?` · ${r.hit.pushes}P`:''}</small></PaintHeatCell></td><td><PaintHeatCell value={r.gap} heat={nbaCenteredHeat(r.gap,heatPools.get(r.market.key)!.gap)} tone="performance" label={`Form vs line: ${r.gap??"unavailable"}`}>{r.gap==null?"—":`${r.gap>0?"+":""}${number(r.gap)}${nbaBinary(r.market.key)?" pp":""}`}</PaintHeatCell></td><td><PaintPickActions player={r.player} offer={r.offer} side={side} game={board.game}/></td></tr>)}</tbody></table></div>{!rows.length&&<div className={styles.panelEmpty}>No qualifying markets. Try another book, market, or player filter.</div>}</div>
}

export function PaintUsage({board,players,open}:{board:PaintBoard;players:PaintPlayer[];open:(id:number)=>void}){
  const [window,setWindow]=useState(10),[sort,setSort]=useState('minutes'),[ascending,setAscending]=useState(false),[data,setData]=useState<PaintScouting|null>(null),[error,setError]=useState(false),[retry,setRetry]=useState(0)
  useEffect(()=>{const controller=new AbortController();fetch(`/the-paint/scouting?game=${board.game.id}`,{signal:controller.signal,cache:'no-store'}).then(async r=>{if(!r.ok)throw new Error('tracking');return await r.json() as PaintScouting}).then(d=>{setData(d);setError(false)}).catch(()=>{if(!controller.signal.aborted)setError(true)});return()=>controller.abort()},[board.game.id,retry])
  const columns=[{key:'minutes',label:'Minutes'},{key:'minutesChange',label:'Δ Minutes'},{key:'fga',label:'FGA'},{key:'fg3a',label:'3PA'},{key:'fta',label:'FTA'},{key:'per36',label:'PTS / 36'},{key:'usage',label:'Usage %'},{key:'potential',label:'Potential AST'},{key:'chances',label:'REB chances'},{key:'drives',label:'Drives'}]
  const pool=useMemo(()=>board.players.map(player=>{const role=nbaRole(player,window),scout=data?.players.find(p=>p.id===player.id);return {player,values:{...role,per36:role.per36('points'),usage:scout?.advanced.usg_pct==null?null:scout.advanced.usg_pct*100,potential:scout?.passing.potential_ast??null,chances:scout?.rebounding.reb_chances??null,drives:scout?.drives.drives??null} as Record<string,number|null>}}),[board.players,window,data])
  const heatPools=useMemo(()=>{const values:Record<string,(number|null)[]>={};for(const row of pool)for(const [key,value]of Object.entries(row.values))(values[key]??=[]).push(value);return values},[pool])
  const rows=pool.filter(row=>players.some(player=>player.id===row.player.id)).sort((a,b)=>{if(sort==='name')return (ascending?1:-1)*(`${a.player.last_name} ${a.player.first_name}`.localeCompare(`${b.player.last_name} ${b.player.first_name}`));const av=a.values[sort],bv=b.values[sort];return av==null||bv==null?av===bv?0:av==null?1:-1:(ascending?1:-1)*(av-bv)||a.player.id-b.player.id})
  const order=(key:string)=>{if(sort===key)setAscending(v=>!v);else{setSort(key);setAscending(key==='name')}}
  return <div className={`${styles.researchTool} ${heatmap.controls}`}>
    <div className={styles.toolHeading}><div><h3>Role & minutes</h3><span>Game logs · L{window}{data?` · Tracking ${nbaSeason(data.season)}`:''}</span></div><div className={styles.segment}>{[5,10,20].map(n=><button key={n} aria-pressed={window===n} onClick={()=>setWindow(n)}>L{n}</button>)}</div></div>
    <div className={heatmap.legendRow}><PaintHeatLegend low="Lower role / volume" high="Higher role / volume"/><small className={styles.muted}>Compared within each column · full matchup</small></div>
    {error?<div className={styles.notice} role="status">Season tracking unavailable. Game logs are ready.<button onClick={()=>setRetry(v=>v+1)}>Retry</button></div>:!data?<p className={styles.finePrint} role="status">Loading season tracking…</p>:data.issues.length>0?<p className={styles.finePrint} role="status">{data.issues.join(' · ')}</p>:null}
    <div className={styles.researchScroll} role="region" aria-label="NBA role and minutes heatmap" tabIndex={0}><table className={`${styles.researchTable} ${heatmap.table}`}><thead><tr><th aria-sort={sort==='name'?ascending?'ascending':'descending':'none'}><button onClick={()=>order('name')}>Player<ArrowDown size={12}/></button></th>{columns.map(c=><th key={c.key} aria-sort={sort===c.key?ascending?'ascending':'descending':'none'}><button onClick={()=>order(c.key)}>{c.label}<ArrowDown size={12}/></button></th>)}</tr></thead><tbody>{rows.map(({player,values})=><tr key={player.id}><th><Identity player={player} open={open}/><small className={styles.sampleCount}>{values.games} appearances</small></th>{columns.map(c=>{const value=values[c.key],comparison=heatPools[c.key]??[],formatted=value==null?'—':`${c.key==='minutesChange'&&value>0?'+':''}${number(value)}${c.key==='usage'?'%':''}`;return <td key={c.key}><PaintHeatCell value={value} pool={comparison} heat={c.key==='minutesChange'?nbaCenteredHeat(value,comparison):undefined} label={`${c.label}: ${formatted}`}>{formatted}</PaintHeatCell></td>})}</tr>)}</tbody></table></div>
    <p className={styles.finePrint}>Usage, assists, rebound chances and drives use full-season tracking; L5/L10/L20 changes game-log columns only. Minutes Δ requires five appearances in each window.</p>
  </div>
}

export function PaintAvailability({board,players,open}:{board:PaintBoard;players:PaintPlayer[];open:(id:number)=>void}){
  const [only,setOnly]=useState(false),[context,setContext]=useState('all')
  const newTeam=(player:PaintPlayer)=>nbaRosterHistory(player,board.game.date).newTeam
  const rows=[...players].filter(p=>(!only||p.injury)&&(context==='all'||context==='rookies'&&p.draft_year===board.game.season||context==='new-team'&&newTeam(p))).sort((a,b)=>Number(!!b.injury)-Number(!!a.injury)||(b.average.min??0)-(a.average.min??0))
  return <div className={styles.researchTool}><div className={styles.toolHeading}><div><h3>Availability & rotation</h3><span>{board.historical?'Historical roster · current injuries excluded':`${players.filter(p=>p.injury).length} injury listings · ${board.starters?.length??0} confirmed starters`}</span></div><select aria-label="NBA roster context" value={context} onChange={event=>setContext(event.target.value)}><option value="all">All players</option><option value="rookies">This year’s draft</option><option value="new-team">New team</option></select><button className={styles.filterToggle} aria-pressed={only} onClick={()=>setOnly(v=>!v)}>Injury listings only</button></div><div className={styles.availabilityGrid}>{rows.map(p=><article key={p.id}><Identity player={p} open={open}/>{(p.draft_year===board.game.season||newTeam(p))&&<span className={styles.draftContext}>{p.draft_year===board.game.season?'Draft class'+(p.draft_number!=null?' · #'+p.draft_number:''):'New team'}</span>}<div><span className={p.injury?styles.injuryStatus:styles.muted}>{p.injury?.status??'No injury listed'}</span>{board.starters?.includes(p.id)&&<b className={styles.hit}>Confirmed starter</b>}</div>{p.injury&&<p>{p.injury.description}</p>}<footer><span>{number(nbaRole(p).minutes)} L10 min</span><span>{p.injury?.return_date?`Return: ${p.injury.return_date}`:board.starters?.includes(p.id)?'Lineup confirmed':'Starter status pending'}</span></footer></article>)}</div>{!rows.length&&<div className={styles.panelEmpty}>No players match this filter.</div>}<p className={styles.finePrint}>Availability and starting lineups update as reports are confirmed.</p></div>
}

export function PaintGameMarkets({board,book,onBookChange}:{board:PaintBoard;book:string;onBookChange:(book:string)=>void}){
  const [sort,setSort]=useState<'moneyline'|'spread'|'total'>('moneyline')
  const quotes=(board.gameOdds??[]).filter(o=>book==='all'||o.vendor===book)
  const teams=[{team:board.game.visitor_team,side:'away' as const},{team:board.game.home_team,side:'home' as const}]
  return <div className={styles.researchTool}><div className={styles.toolHeading}><div><h3>Game lines</h3><span>Moneyline · spread · total</span></div><PaintBookSelect label="Game market sportsbook" value={book} onChange={onBookChange} books={[...new Set(board.gameOdds?.map(o=>o.vendor)??[])]}/></div><div className={styles.segment}>{(['moneyline','spread','total'] as const).map(m=><button aria-pressed={sort===m} key={m} onClick={()=>setSort(m)}>{m==='moneyline'?'Moneyline':m==='spread'?'Spread':'Game total'}</button>)}</div><div className={styles.gameMarketGrid}>{teams.map(({team,side})=><section key={team.id}><header><TeamLogo abbr={team.abbreviation} size={35}/><h3>{sort==='total'?(side==='away'?'Over':'Under'):team.full_name}</h3></header>{quotes.map(o=>{const line=sort==='spread'?o[`spread_${side}_value`]:sort==='total'?o.total_value:null;const field=sort==='total'?(side==='away'?'total_over':'total_under'):`${sort}_${side}` as const;return <div className={styles.gameMarketRow} key={o.id}><BookLogo vendor={o.vendor} size={22}/><span aria-label={bookName(o.vendor)}><small>{new Date(o.updated_at).toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit',timeZone:'America/New_York'})} ET</small></span><strong>{line==null?'':sort==='spread'&&Number(line)>0?`+${line}`:line}<PaintGamePrice quote={o} field={field} compact/></strong></div>})}</section>)}</div>{!quotes.length&&<div className={styles.panelEmpty}>No game prices posted for this selection.</div>}</div>
}

export function PaintMatchupLab({board,open}:{board:PaintBoard;open:(id:number)=>void}){
  const [metric,setMetric]=useState('pace')
  const metrics=[{key:'pace',label:'Pace',pct:false,invert:false},{key:'off_rating',label:'Offensive rating',pct:false,invert:false},{key:'def_rating',label:'Defensive rating',pct:false,invert:true},{key:'net_rating',label:'Net rating',pct:false,invert:false},{key:'reb_pct',label:'Rebound share',pct:true,invert:false},{key:'ts_pct',label:'True shooting',pct:true,invert:false}]
  const teams=[board.game.visitor_team,board.game.home_team]
  const comparison=(key:string)=>teams.map(team=>board.teamStats?.find(row=>row.team.id===team.id)?.stats[key])
  const rotationPool=board.players.map(player=>player.average.min)
  const displayMetric=(stats:Record<string,number|null>|undefined,item:typeof metrics[number])=>{
    const value=stats?.[item.key],formatted=number(value==null?null:item.pct?value*100:value)+(item.pct&&value!=null?'%':'')
    return <PaintHeatCell value={value} pool={comparison(item.key)} invert={item.invert} tone={item.key==='pace'?'volume':'performance'} label={`${item.label}: ${formatted}${item.invert?' · lower is stronger defense':''}`}>{formatted}</PaintHeatCell>
  }
  return <div className={`${styles.researchTool} ${heatmap.controls}`}>
    <div className={styles.toolHeading}><div><h3>Matchup Lab</h3><span>{nbaSeason(board.teamStatsSeason??board.sampleSeason)} · regular season</span></div><select aria-label="Compare team metric" value={metric} onChange={e=>setMetric(e.target.value)}>{metrics.map(m=><option value={m.key} key={m.key}>{m.label}</option>)}</select></div>
    <div className={heatmap.legendRow}><PaintHeatLegend low="Lower efficiency" high="Higher efficiency" tone="performance"/><small className={styles.muted}>This matchup · defensive rating reversed · pace shows volume</small></div>
    <div className={styles.matchupLab}>{teams.map(team=>{const stats=board.teamStats?.find(t=>t.team.id===team.id)?.stats,selected=metrics.find(m=>m.key===metric)!;return <section key={team.id}>
      <header><TeamLogo abbr={team.abbreviation} size={52}/><div><h3>{team.full_name}</h3><span>{team.id===board.game.home_team.id?'Home court':'Road game'}</span></div></header>
      <div className={`${heatmap.metric} ${heatmap.metricHero}`}><small>{selected.label}</small>{displayMetric(stats,selected)}</div>
      <div className={styles.labMetrics}>{metrics.filter(m=>m.key!==metric).map(m=><div className={heatmap.metric} key={m.key}><small>{m.label}</small>{displayMetric(stats,m)}</div>)}</div>
      <h4>Rotation · season minutes</h4>{board.players.filter(p=>p.team.id===team.id).sort((a,b)=>(b.average.min??0)-(a.average.min??0)).slice(0,8).map(p=><div className={styles.rotationRow} key={p.id}><Identity player={p} open={open}/><PaintHeatCell value={p.average.min} pool={rotationPool} label={`${p.first_name} ${p.last_name}: ${number(p.average.min)} season minutes`}>{number(p.average.min)}<small>MIN</small></PaintHeatCell></div>)}
    </section>})}</div>
    <p className={styles.finePrint}>Team rates compare both teams. Rotation heat compares season minutes across the full matchup roster.</p>
  </div>
}
