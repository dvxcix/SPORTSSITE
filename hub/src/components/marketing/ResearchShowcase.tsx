'use client'

import { SlipSurgeLogo } from '@/components/brand/SlipSurgeLogo'
import { useState } from 'react'
import { ArrowRight, ChevronDown, ChevronRight, Layers3, LockKeyhole, Minus, Star, TrendingDown, TrendingUp, X } from 'lucide-react'
import { BookLogo } from '@/components/BookLogo'
import { SafeImage } from '@/components/ui/SafeImage'
import { ModalSurface } from '@/components/ui/ModalSurface'
import { nflOddsBoardMove } from '@/lib/nflOddsBoard'
import { sportLogoUrl } from '@/lib/sportLogos'
import { PREVIEW_CONFIG, previewPagePath, type PreviewSport, type ResearchPreview } from '@/lib/publicResearchPreview'
import { PUBLIC_PREVIEW_EXAMPLES } from '@/lib/publicResearchPreviewExamples'
import { trackProductEvent } from '@/lib/productAnalytics'
import { DiscoveryLink } from './DiscoveryLink'
import { PreviewPlayerIdentity, PreviewTeamMark, type PreviewIdentityPlayer } from './PreviewIdentity'
import { PreviewPlayerChart } from './PreviewPlayerChart'
import styles from './ResearchShowcase.module.css'

const day = new Intl.DateTimeFormat('en-US',{month:'short',day:'numeric',year:'numeric',timeZone:'UTC'})
const savedTime = new Intl.DateTimeFormat('en-US',{month:'short',day:'numeric',hour:'numeric',minute:'2-digit',timeZone:'America/New_York'})
const odds = (value:number|null|undefined) => value==null?'–':value>0?'+'+value:'−'+Math.abs(value)
const displayDay = (value:string) => Number.isFinite(Date.parse(value))?day.format(new Date(value)):'Date unavailable'
const displayTime = (value:string) => Number.isFinite(Date.parse(value))?savedTime.format(new Date(value))+' ET':'Saved time unavailable'

function Movement({current,opening}:{current:number;opening:number|null}) {
  const delta=nflOddsBoardMove(current,opening)
  if(delta==null)return <span className={styles.muted} aria-label="Opening unavailable">–</span>
  if(delta===0)return <span className={styles.muted} aria-label="Odds unchanged"><Minus size={13} aria-hidden="true"/> 0.0 pp</span>
  const Icon=delta>0?TrendingUp:TrendingDown
  return <span className={delta>0?styles.shortened:styles.lengthened} aria-label={`Odds ${delta>0?'shortened':'lengthened'} by ${Math.abs(delta).toFixed(1)} probability points`}><Icon size={14} aria-hidden="true"/>{delta>0?'+':'−'}{Math.abs(delta)<.05?'<0.1':Math.abs(delta).toFixed(1)}<small>pp</small></span>
}

function RecentSpark({player,line}:{player:PreviewIdentityPlayer;line:number}) {
  const recent=(player.recent??[]).filter(value=>Number.isFinite(value)&&value>=0).slice(-10)
  if(!recent.length)return <span className={styles.lineCount}>{player.prices.length} priced lines</span>
  const maximum=Math.max(1,...recent)
  return <span className={styles.spark} role="img" aria-label={`${recent.length} recent games, oldest to newest: ${recent.join(', ')}`}>
    {recent.map((value,index)=><i key={index} data-hit={value>=line} style={{height:`${Math.max(2,value/maximum*100)}%`}}/>)}
  </span>
}

const restrictions={
  books:{title:'Compare more sportsbooks',body:'Open the full one-game preview to compare the available sportsbooks.'},
  markets:{title:'Research more markets',body:'Open the full one-game preview to switch markets on the actual research board.'},
  tools:{title:'Keep researching the matchup',body:'Open this matchup in the actual workspace, with its research tabs and player drawers.'},
  save:{title:'Make room for your picks',body:'Create an account to follow people, save picks and join the community. You can keep browsing this preview first.'},
} as const
type Restriction=keyof typeof restrictions

export function ResearchShowcase({previews}:{previews?:Record<PreviewSport,ResearchPreview>}={}) {
  const [sport,setSport]=useState<PreviewSport>('nba')
  const [selectedLine,setSelectedLine]=useState<number|null>(null)
  const [selectedPlayer,setSelectedPlayer]=useState<number|null>(null)
  const [view,setView]=useState<'players'|'ladders'>('players')
  const [details,setDetails]=useState(false)
  const [detailView,setDetailView]=useState<'overview'|'odds'>('overview')
  const [restriction,setRestriction]=useState<Restriction|null>(null)
  const config=PREVIEW_CONFIG[sport]
  // Production supplies the server-selected board. The omitted-prop path is
  // only the existing, explicitly dated public archive used in isolated renders.
  const board=previews?.[sport]?.board??PUBLIC_PREVIEW_EXAMPLES[sport]
  const players=board.players as PreviewIdentityPlayer[]
  const defaultLine=config.lines.find(rung=>rung===(sport==='nba'?20:25)&&players.some(player=>player.prices.some(quote=>quote.line===rung)))
    ?? config.lines.find(rung=>players.some(player=>player.prices.some(quote=>quote.line===rung)))??config.lines[0]
  const line=selectedLine??defaultLine
  const selected=players.find(player=>player.id===selectedPlayer)??players.find(player=>player.prices.some(quote=>quote.line===line))??players[0]
  const quote=selected?.prices.find(item=>item.line===line)
  const visible=[...players].sort((a,b)=>Number(b.prices.some(item=>item.line===line))-Number(a.prices.some(item=>item.line===line))).slice(0,6)
  const context={sport,game:board.game.id,date:board.game.date,player:selected?.id,line}
  const fullPreview=previewPagePath(context)
  const registration='/auth/register?next='+encodeURIComponent(fullPreview)
  const recentAvailable=players.some(player=>player.recent?.length)

  function selectSport(next:PreviewSport){
    if(next===sport)return
    setSport(next);setSelectedLine(null);setSelectedPlayer(null);setDetails(false);setRestriction(null)
    trackProductEvent('public_preview_interacted',{sport:next,action:'sport'})
  }
  function selectLine(value:number){setSelectedLine(value);trackProductEvent('public_preview_interacted',{sport,action:'milestone'})}
  function inspect(player:PreviewIdentityPlayer){setSelectedPlayer(player.id);setDetailView('overview');setDetails(true);trackProductEvent('public_preview_interacted',{sport,action:'player'})}

  const selectionPrices=<dl className={styles.selectionPrices}><div><dt>Last seen</dt><dd>{odds(quote?.price)}</dd></div><div><dt>Opening</dt><dd>{odds(quote?.opening)}</dd></div><div><dt>Move</dt><dd>{quote?<Movement current={quote.price} opening={quote.opening}/>:<span>–</span>}</dd></div></dl>

  return <div className={styles.workspace} data-preview-sport={sport}>
    <div className={styles.frameTop}>
      <span className={styles.frameBrand}><SlipSurgeLogo width={120} decorative/><span>Research preview</span></span>
      <DiscoveryLink href={fullPreview} destination={sport+'_preview'} className={styles.frameOpen}>Full preview <ArrowRight size={14} aria-hidden="true"/></DiscoveryLink>
    </div>
    <div className={styles.frameBody}>
      <nav className={styles.workspaceNav} aria-label="Example sport">
        {(['nba','nfl'] as const).map(next=><button key={next} type="button" aria-label={PREVIEW_CONFIG[next].label} aria-pressed={sport===next} onClick={()=>selectSport(next)}>
          <SafeImage src={sportLogoUrl(next)} alt="" width={22} height={26}/><span><strong>{PREVIEW_CONFIG[next].workspace}</strong><small>{PREVIEW_CONFIG[next].label}</small></span>
        </button>)}
        <div className={styles.navFooter}><span>Free preview</span><span>No account needed</span></div>
      </nav>
      <div className={styles.desk} key={sport+':'+board.game.id}>
        <div className={styles.deskHeading}><div><SafeImage src={sportLogoUrl(sport)} alt="" width={22} height={26}/><h2>{config.workspace}</h2><span>{config.label}</span></div><span className={styles.archive}>{board.example?'Archived example':'Saved pregame board'}</span></div>
        <div className={styles.gameStrip}>
          <div className={styles.matchup}><PreviewTeamMark sport={sport} team={board.game.away} size={30}/><strong>{board.game.away}</strong><span>{board.game.state==='final'&&board.game.awayScore!=null&&board.game.homeScore!=null?`${board.game.awayScore} – ${board.game.homeScore}`:'vs'}</span><strong>{board.game.home}</strong><PreviewTeamMark sport={sport} team={board.game.home} size={30}/></div>
          <span>{displayDay(board.game.date)}{board.game.state==='final'?' · Final':''}</span>
        </div>
        <div className={styles.toolbar}>
          <div className={styles.views} role="group" aria-label="Preview board view"><button type="button" aria-pressed={view==='players'} onClick={()=>setView('players')}>Players</button><button type="button" aria-pressed={view==='ladders'} onClick={()=>setView('ladders')}>Ladders</button><button type="button" onClick={()=>setRestriction('tools')} aria-haspopup="dialog"><Layers3 size={14} aria-hidden="true"/><span>More tools</span></button></div>
          <div className={styles.filters}><button type="button" onClick={()=>setRestriction('markets')} aria-label="See more markets" aria-haspopup="dialog">{config.title}<ChevronDown size={13} aria-hidden="true"/></button><button type="button" onClick={()=>setRestriction('books')} aria-label="See more sportsbooks" aria-haspopup="dialog"><BookLogo vendor="fanduel" size={18}/><span>{board.book}</span><ChevronDown size={13} aria-hidden="true"/></button></div>
        </div>
        <div className={styles.milestoneRow}><span>Milestone</span><div className={styles.milestones} role="group" aria-label={config.title+' milestones'}>{config.lines.map(rung=><button key={rung} type="button" aria-pressed={line===rung} onClick={()=>selectLine(rung)}>{rung}+</button>)}</div></div>
        <div className={styles.content}>
          <section className={styles.playerBoard} aria-label={view==='players'?'Player board':'Milestone ladders'}>
            <div className={styles.boardMeta}><span>{visible.length} players · {config.title}</span><span><BookLogo vendor="fanduel" size={13}/> {board.book}</span></div>
            <div className={styles.tableScroll} role="region" aria-label={config.title+' board'} tabIndex={0}>
              {view==='players'?<table className={styles.playerTable}><caption className={styles.srOnly}>{config.workspace}, {line}+ {config.title.toLowerCase()}, {displayDay(board.game.date)}. Saved prices.</caption><thead><tr><th scope="col">Player</th><th scope="col">Line / odds</th><th scope="col">Move</th><th scope="col" className={styles.recentColumn}>{recentAvailable?'Recent games':'Ladder'}</th></tr></thead><tbody>
                {visible.map(player=>{const current=player.prices.find(item=>item.line===line);return <tr key={player.id} data-selected={selected?.id===player.id} data-unlisted={!current||undefined}>
                  <th scope="row"><button type="button" className={styles.playerButton} aria-label={`Inspect ${player.name}`} onClick={()=>inspect(player)}><PreviewPlayerIdentity player={player} sport={sport} size={42} compact/><ChevronRight size={13} aria-hidden="true"/></button></th>
                  <td><div className={styles.priceCell}><strong>{line}+</strong><span><BookLogo vendor="fanduel" size={13}/>{odds(current?.price)}</span><small>Open {odds(current?.opening)}</small></div></td>
                  <td>{current?<Movement current={current.price} opening={current.opening}/>:<span className={styles.muted}>–</span>}</td>
                  <td className={styles.recentColumn}><RecentSpark player={player} line={line}/></td>
                </tr>})}
              </tbody></table>:<table className={styles.ladderTable}><caption className={styles.srOnly}>{config.workspace} {config.title.toLowerCase()} ladder, {displayDay(board.game.date)}</caption><thead><tr><th scope="col">Player</th>{config.lines.map(rung=><th key={rung} scope="col">{rung}+</th>)}</tr></thead><tbody>{visible.map(player=><tr key={player.id}><th scope="row"><button type="button" className={styles.playerButton} aria-label={`Inspect ${player.name}`} onClick={()=>inspect(player)}><PreviewPlayerIdentity player={player} sport={sport} size={36} compact/></button></th>{config.lines.map(rung=>{const current=player.prices.find(item=>item.line===rung);return <td key={rung}>{current?<button type="button" aria-label={`${player.name}, ${rung}+ at ${odds(current.price)}`} data-current={line===rung&&selected?.id===player.id} onClick={()=>{setSelectedLine(rung);inspect(player)}}>{odds(current.price)}</button>:<span className={styles.muted}>–</span>}</td>})}</tr>)}</tbody></table>}
            </div>
            {!visible.length&&<div className={styles.empty}>The selected board has no public prices to show. Try the other sport or open its free preview.</div>}
            <div className={styles.observation}>{board.example?'Archived prices':'Saved pregame prices'} · <time dateTime={board.capturedAt}>{displayTime(board.capturedAt)}</time></div>
          </section>
          {selected&&<aside className={styles.inspector} aria-label="Selected player"><div className={styles.inspectorHeading}><span>Player view</span><button type="button" aria-label={`Save ${selected.name} research`} aria-haspopup="dialog" onClick={()=>setRestriction('save')}><Star size={17} aria-hidden="true"/></button></div><PreviewPlayerIdentity player={selected} sport={sport} size={62}/><div className={styles.contract}><span>{line}+ {config.title.toLowerCase()}</span><BookLogo vendor="fanduel" size={18}/></div>{selectionPrices}{!quote&&<p className={styles.unavailable}>No saved price for this milestone.</p>}<PreviewPlayerChart key={sport+':'+selected.id} player={selected} sport={sport} line={line} onLineChange={selectLine}/><button type="button" className={styles.detailButton} onClick={()=>inspect(selected)}>Player details<ChevronRight size={14} aria-hidden="true"/></button></aside>}
        </div>
      </div>
    </div>
    <div className={styles.frameFooter}><span>One matchup. One market. Real saved prices.</span><DiscoveryLink href={fullPreview} destination={sport+'_preview'}>Open {config.label} preview <ArrowRight size={14} aria-hidden="true"/></DiscoveryLink></div>

    <ModalSurface open={details&&!!selected} onClose={()=>setDetails(false)} label={selected?.name+' preview details'} backdropClassName={styles.drawerBackdrop} panelClassName={styles.drawer}>
      {selected&&<><div className={styles.drawerHeader}><PreviewPlayerIdentity player={selected} sport={sport} size={64}/><button type="button" aria-label="Close player preview" onClick={()=>setDetails(false)}><X size={19} aria-hidden="true"/></button></div><div className={styles.drawerBody}><p className={styles.drawerContext}><PreviewTeamMark sport={sport} team={board.game.away} size={19}/>{board.game.away} at {board.game.home}<PreviewTeamMark sport={sport} team={board.game.home} size={19}/><span>{displayDay(board.game.date)}</span></p><div className={styles.views} role="group" aria-label="Player preview view"><button type="button" aria-pressed={detailView==='overview'} onClick={()=>setDetailView('overview')}>Overview</button><button type="button" aria-pressed={detailView==='odds'} onClick={()=>setDetailView('odds')}>All odds</button></div>{detailView==='overview'?<><div className={styles.contract}><h3>{line}+ {config.title.toLowerCase()}</h3><BookLogo vendor="fanduel" size={22}/></div>{selectionPrices}{!quote&&<p className={styles.unavailable}>No saved price for this milestone. Choose another line.</p>}<PreviewPlayerChart key={selected.id} player={selected} sport={sport} line={line} onLineChange={selectLine}/></>:<div className={styles.drawerOdds}><h3>{board.book} · {config.title}</h3>{selected.prices.map(current=><button type="button" key={current.line} aria-pressed={current.line===line} onClick={()=>{selectLine(current.line);setDetailView('overview')}}><span>{current.line}+</span><BookLogo vendor="fanduel" size={17}/><strong>{odds(current.price)}</strong><small>Open {odds(current.opening)}</small></button>)}</div>}<p className={styles.observation}>{board.example?'Archived example':'Saved pregame board'} · {displayTime(board.capturedAt)}</p></div><div className={styles.drawerFooter}><DiscoveryLink href={fullPreview} destination={sport+'_preview'}>Open the full free preview<ArrowRight size={15} aria-hidden="true"/></DiscoveryLink><button type="button" onClick={()=>{setDetails(false);setRestriction('tools')}}>More research tools<LockKeyhole size={13} aria-hidden="true"/></button></div></>}
    </ModalSurface>
    <ModalSurface open={!!restriction} onClose={()=>setRestriction(null)} label={restriction?restrictions[restriction].title:'More research'} backdropClassName={styles.gateBackdrop} panelClassName={styles.gate}>
      {restriction&&<><button type="button" className={styles.gateClose} aria-label="Close preview access details" onClick={()=>setRestriction(null)}><X size={19} aria-hidden="true"/></button><h2>{restrictions[restriction].title}</h2><p>{restrictions[restriction].body}</p><DiscoveryLink href={restriction==='save'?registration:fullPreview} destination={restriction==='save'?'registration':sport+'_preview'} className={styles.gatePrimary}>{restriction==='save'?'Create a free account':'Open full game preview'}</DiscoveryLink><button type="button" className={styles.gateContinue} onClick={()=>setRestriction(null)}>Keep browsing</button></>}
    </ModalSurface>
  </div>
}
