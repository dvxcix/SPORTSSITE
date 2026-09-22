import type { createAdminClient } from '@/lib/supabase/admin'
import { bdlHeaders } from '@/lib/balldontlie'
import { parseCsv } from '@/lib/nflverseSync'

type Admin = ReturnType<typeof createAdminClient>
export type FeedRow = Record<string, unknown>
export type FeedGame = {
 id: number; date: string; status_state?: string; season: number; week: number
 visitor_team: { abbreviation: string }; home_team: { abbreviation: string }
 visitor_team_score?: number; home_team_score?: number
}
export type FeedPlay = FeedRow & {
 id: string | number; game: FeedGame; type_slug?: string
 away_score?: number; home_score?: number; period?: number; clock_display?: string
 text?: string; short_text?: string; wallclock?: string
}
const canonical = (t: string) => ({ LA:'LAR', STL:'LAR', JAC:'JAX', WAS:'WSH', SD:'LAC', OAK:'LV' }[t] ?? t)
export function matchingFeedGame(games: FeedGame[], row: { season: number; week: number; gameday: string; away_team: string; home_team: string }) {
 const matches = games.filter(g => g.season === row.season && g.week === row.week
  && canonical(g.visitor_team.abbreviation) === canonical(row.away_team)
  && canonical(g.home_team.abbreviation) === canonical(row.home_team)
  && new Date(g.date).toLocaleDateString('en-CA', {timeZone:'America/New_York'}) === row.gameday)
 if (matches.length > 1) throw new Error('Ambiguous NFL game identity')
 return matches[0] ?? null
}
export async function fetchAllBdl<T>(path: string, request: typeof fetch = fetch): Promise<T[]> {
 const rows: T[] = []; const seen = new Set<string>(); let cursor: string | null = null
 for (let page=0; page<30; page++) {
  const response = await request('https://api.balldontlie.io/nfl/v1/'+path+(cursor == null ? '' : '&cursor='+encodeURIComponent(cursor)),
   { headers:bdlHeaders, cache:'no-store', signal:AbortSignal.timeout(15000) })
  if (!response.ok) throw new Error('BDL NFL feed HTTP '+response.status)
  const body = await response.json() as { data?: T[]; meta?: { next_cursor?: string | number | null } }
  if (!Array.isArray(body.data)) throw new Error('BDL NFL feed missing data array')
  rows.push(...body.data)
  if (body.meta?.next_cursor == null) return rows
  cursor = String(body.meta.next_cursor)
  if (seen.has(cursor)) throw new Error('BDL NFL pagination repeated cursor')
  seen.add(cursor)
 }
 throw new Error('BDL NFL pagination incomplete')
}
export function reconcileFeed(game: FeedGame, plays: FeedPlay[]) {
 if (!plays.length) throw new Error('Empty NFL game feed')
 const ids = new Set<string>()
 for (const play of plays) {
  if (!play.id || play.game?.id !== game.id) throw new Error('NFL play/game identity mismatch')
  if (ids.has(String(play.id))) throw new Error('Duplicate NFL play ID')
  ids.add(String(play.id))
 }
 const end = plays.find(p => p.type_slug === 'end-of-game')
 return game.status_state === 'final' && !!end && (end.period ?? 0) >= 4
  && end.away_score === game.visitor_team_score && end.home_score === game.home_team_score
}
export async function syncNflGameEvents(admin: Admin, season: number, gameIds?: string[]) {
 let query = admin.from('nfl_schedule').select('game_id,season,week,gameday,away_team,home_team,away_score,home_score')
  .eq('season',season).lte('gameday',new Date().toLocaleDateString('en-CA',{timeZone:'America/New_York'}))
 if (gameIds?.length) query = query.in('game_id',gameIds)
 const {data:schedule,error} = await query.order('gameday',{ascending:false})
 if(error) throw error
 const {data:existing,error:existingError} = await admin.from('nfl_game_feeds').select('game_id,fetched_at,reconciled')
  .eq('season',season).eq('source','bdl_plays')
 if(existingError) throw existingError
 const prior = new Map((existing ?? []).map(r=>[r.game_id,r]))
 // Keep final feeds refreshable for official corrections; bounded work per invocation.
 const now = Date.now()
 const due = (schedule ?? []).filter(s => {
  const e=prior.get(s.game_id)
  return !e || !e.reconciled || now-Date.parse(e.fetched_at)>24*3600*1000
 }).sort((a,b) => {
  // Missing recent games first; then least recently polled feeds. This rotates
  // every live game instead of starving the second half of a Sunday slate.
  const at=prior.get(a.game_id)?.fetched_at, bt=prior.get(b.game_id)?.fetched_at
  if(!at && !bt) return b.gameday.localeCompare(a.gameday)
  return (at?Date.parse(at):0)-(bt?Date.parse(bt):0)
 })
 const weeks = new Map<number,FeedGame[]>()
 const results: {gameId:string; events:number; reconciled:boolean}[]=[]
 for (const row of due) {
  if(results.length>=8 || Date.now()-now>220000) break
  if (!weeks.has(row.week)) weeks.set(row.week,await fetchAllBdl<FeedGame>('games?seasons[]='+season+'&weeks[]='+row.week+'&per_page=100'))
  const game = matchingFeedGame(weeks.get(row.week)!,row)
  if (!game || !['final','in_progress'].includes(game.status_state ?? '')) continue
  const plays=await fetchAllBdl<FeedPlay>('plays?game_id='+game.id+'&per_page=100')
  const reconciled=reconcileFeed(game,plays)
  // Final scoreboard mismatch must never be published as reconciled.
  const scheduleAgrees=(row.away_score == null || row.away_score===game.visitor_team_score)
   && (row.home_score == null || row.home_score===game.home_team_score)
  if(prior.get(row.game_id)?.reconciled && !(reconciled&&scheduleAgrees)) {
   throw new Error('Refusing to replace a verified final feed with incomplete data')
  }
  const {error:writeError}=await admin.from('nfl_game_feeds').upsert({
   game_id:row.game_id,season,source:'bdl_plays',row_count:plays.length,
   payload:{game,plays},reconciled:reconciled&&scheduleAgrees,
   source_updated_at:plays.map(p=>p.wallclock).filter((s):s is string=>!!s).sort().at(-1) ?? null,
   fetched_at:new Date().toISOString(),
  },{onConflict:'game_id,source'})
  if(writeError) throw writeError
  results.push({gameId:row.game_id,events:plays.length,reconciled:reconciled&&scheduleAgrees})
 }
 return results
}
const auxiliary = {
 snap_counts: { path:'snap_counts/snap_counts_', game:'game_id', key:'pfr_player_id' },
 ftn_charting: { path:'ftn_charting/ftn_charting_', game:'nflverse_game_id', key:'nflverse_play_id' },
} as const
export function groupAuxiliary(rows: Record<string,string>[], source: keyof typeof auxiliary, season: number) {
 const spec=auxiliary[source]; const groups=new Map<string,Record<string,string>[]>(); const seen=new Set<string>()
 for(const row of rows) {
  if(Number(row.season)!==season) throw new Error('Auxiliary NFL season mismatch')
  const game=row[spec.game], id=row[spec.key]
  if(!game?.startsWith(season+'_') || !id) throw new Error('Auxiliary NFL identity missing')
  const key=game+':'+id
  if(seen.has(key)) throw new Error('Duplicate auxiliary NFL identity')
  seen.add(key); const group=groups.get(game) ?? []; group.push(row); groups.set(game,group)
 }
 return groups
}
export async function syncNflAuxiliary(admin: Admin, season: number) {
 const report: Record<string,unknown>={}
 for(const [source,spec] of Object.entries(auxiliary)) {
  const response=await fetch('https://github.com/nflverse/nflverse-data/releases/download/'+spec.path+season+'.csv',
   {cache:'no-store',signal:AbortSignal.timeout(30000)})
  if(response.status===404) {report[source]={status:'not_published',games:0};continue}
  if(!response.ok) throw new Error(source+' HTTP '+response.status)
  const groups=groupAuxiliary(parseCsv(await response.text()),source as keyof typeof auxiliary,season)
  if(!groups.size) throw new Error('Empty '+source+' publication')
  let count=0
  for(const [gameId,rows] of groups) {
   const stamp=response.headers.get('last-modified')
   const {error}=await admin.from('nfl_game_feeds').upsert({
    game_id:gameId,season,source,row_count:rows.length,payload:rows,
    source_updated_at:stamp&&Number.isFinite(Date.parse(stamp))?new Date(stamp).toISOString():null,
    fetched_at:new Date().toISOString(),reconciled:false,
   },{onConflict:'game_id,source'})
   if(error) throw error
   count+=rows.length
  }
  report[source]={status:'imported',games:groups.size,rows:count}
 }
 return report
}
