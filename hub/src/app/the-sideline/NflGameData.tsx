import { createAdminClient } from '@/lib/supabase/admin'
import type { FeedPlay } from '@/lib/nflGameFeeds'
import type { SidelineGame } from './types'

type Capture = { source:string; row_count:number; payload:unknown; fetched_at:string; source_updated_at:string|null; reconciled:boolean }
type AuxRow=Record<string,string>
const formatStamp=(stamp:string|null)=>stamp?new Date(stamp).toLocaleString('en-US',{timeZone:'America/New_York',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'})+' ET':'Not supplied'
const chartLabels:Record<string,string>={is_motion:'Motion',is_play_action:'Play action',is_screen_pass:'Screen',is_rpo:'RPO',is_trick_play:'Trick play',is_qb_out_of_pocket:'QB outside pocket',is_throw_away:'Throwaway',is_drop:'Drop'}
export async function NflGameData({game}:{game:SidelineGame}) {
 const db=createAdminClient()
 const [feeds,pbp,weekly]=await Promise.all([
  db.from('nfl_game_feeds').select('source,row_count,payload,fetched_at,source_updated_at,reconciled').eq('game_id',game.id).abortSignal(AbortSignal.timeout(8000)),
  db.from('nfl_pbp').select('play_id',{count:'exact',head:true}).eq('game_id',game.id).abortSignal(AbortSignal.timeout(8000)),
  db.from('nfl_player_stats').select('player_id',{count:'exact',head:true}).eq('game_id',game.id).abortSignal(AbortSignal.timeout(8000)),
 ])
 if(feeds.error||pbp.error||weekly.error) return <p role="status" className="mx-3 rounded-xl border border-amber-500/30 p-3 text-sm text-amber-200">Game-data coverage could not be verified. Existing board data is unchanged.</p>
 const captures=(feeds.data ?? []) as Capture[]
 const events=captures.find(r=>r.source==='bdl_plays'), snaps=captures.find(r=>r.source==='snap_counts'), charts=captures.find(r=>r.source==='ftn_charting')
 const plays=((events?.payload as {plays?:FeedPlay[]}|undefined)?.plays ?? [])
 const snapRows=(Array.isArray(snaps?.payload)?snaps.payload:[]) as AuxRow[]
 const chartRows=(Array.isArray(charts?.payload)?charts.payload:[]) as AuxRow[]
 const enriched=pbp.count ?? 0
 return <details className="mx-3 my-3 overflow-hidden rounded-xl border border-white/15 bg-[#10151b] text-sm text-slate-200">
  <summary className="cursor-pointer px-4 py-3 focus-visible:outline focus-visible:outline-lime-400">
   <span className="font-semibold">Game data · {game.away.abbr} / {game.home.abbr}</span>
   <span className="ml-3 inline-block text-xs text-slate-400">{plays.length} feed events · {enriched} enriched records · {snapRows.length? 'Snaps available':'Snaps pending'} · {chartRows.length?'Charting available':'Charting pending'}</span>
  </summary>
  <div className="space-y-4 border-t border-white/10 p-4">
   <p className="text-xs text-slate-400">Coverage for this game, not the historical sample used in pregame rankings. Feed events include penalties, timeouts and period markers—not just offensive snaps.</p>
   <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
    <section className="rounded-lg border border-white/10 p-3"><h3 className="font-semibold">Play feed · BDL</h3><p>{events?events.reconciled?'Final marker + score verified':'Provisional / final check pending':'Not imported yet'}</p><p className="mt-1 text-xs text-slate-400">Fetched {formatStamp(events?.fetched_at ?? null)}</p></section>
    <section className="rounded-lg border border-white/10 p-3"><h3 className="font-semibold">Enriched · nflverse</h3><p>{enriched?enriched+' records':'Awaiting enriched publication'}</p><p className="text-xs text-slate-400">{weekly.count ?? 0} weekly player records. Air yards/EPA are not inferred from basic events.</p></section>
    <section className="rounded-lg border border-white/10 p-3"><h3 className="font-semibold">Snap counts · PFR/nflverse</h3><p>{snapRows.length?snapRows.length+' player rows':'Not published / imported yet'}</p><p className="text-xs text-slate-400">Fetched {formatStamp(snaps?.fetched_at ?? null)}</p></section>
    <section className="rounded-lg border border-white/10 p-3"><h3 className="font-semibold">Charting · FTN/nflverse</h3><p>{chartRows.length?chartRows.length+' charted events':'Not published / imported yet'}</p><p className="text-xs text-slate-400">Fetched {formatStamp(charts?.fetched_at ?? null)}</p></section>
   </div>
   <p className="text-xs text-amber-200">Charting and Next Gen Stats have separate publication/qualification limits. Full route trees, coverage assignments and 22-player coordinates are not supplied by these feeds.</p>
   {chartRows.length>0?<details><summary className="cursor-pointer py-2 font-semibold">Charted play features</summary>
    <div className="flex flex-wrap gap-2">{Object.entries(chartLabels).map(([field,label])=>{
      const known=chartRows.filter(r=>['TRUE','FALSE','1','0'].includes(r[field]?.toUpperCase()))
      const yes=known.filter(r=>['TRUE','1'].includes(r[field]?.toUpperCase())).length
      return <span key={field} className="rounded-lg border border-white/10 px-3 py-2">{label}: {known.length?yes+' / '+known.length:'Unavailable'}</span>
    })}</div><p className="mt-2 text-xs text-slate-400">Counts are over supplied charted events, not route participation or eligible-play rates.</p>
   </details>:null}
   {snapRows.length>0?<details><summary className="cursor-pointer py-2 font-semibold">Player snap counts</summary>
    <div className="max-h-80 overflow-auto"><table className="w-full text-left"><thead><tr>{['Player','Team','Offense','Defense','Special teams'].map(h=><th className="px-2 py-2" key={h} scope="col">{h}</th>)}</tr></thead>
    <tbody>{snapRows.map(r=><tr key={r.pfr_player_id} className="border-t border-white/10"><td className="px-2 py-2">{r.player}</td><td className="px-2">{r.team}</td><td className="px-2">{r.offense_snaps || '—'}</td><td className="px-2">{r.defense_snaps || '—'}</td><td className="px-2">{r.st_snaps || '—'}</td></tr>)}</tbody></table></div>
   </details>:null}
   {plays.length>0?<details><summary className="cursor-pointer py-2 font-semibold">Full play feed ({plays.length} events)</summary>
    <ol className="max-h-96 space-y-2 overflow-y-auto">{plays.map(p=><li key={String(p.id)} className="rounded-lg border border-white/10 p-3">
     <span className="font-mono text-xs text-lime-300">Q{p.period} · {p.clock_display} · {p.away_score}–{p.home_score}</span>
     <p className="mt-1 break-words">{p.text || p.short_text || p.type_slug}</p>
    </li>)}</ol>
   </details>:null}
  </div>
 </details>
}
