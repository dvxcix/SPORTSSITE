import 'server-only'
import { randomUUID } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { easternKickoff } from './browserbaseRefresh'
import { nflCaptureIsIncomplete } from './nflCaptureDispatch'
import { nflBrowserDecision, nflBrowserReservationKey, type NflBrowserAttempt, type NflBrowserSource } from './nflBrowserCapturePolicy'

export type NflBrowserScope = { gameId: string; kickoff: number; observed: number | null }
type Scope = NflBrowserScope
type Game = {gameId:string;gameDate:string;gameTime:string|null}
type Stored = { key: string; fetched_at: string | null; payload: unknown }
export type NflBrowserReservation = { key: string; fetchedAt: string; reservationId: string }

/** Resolve the same monotonic cutoff used by NFL research before any paid
 * browser launch. A failed or ambiguous cutoff/observation is unavailable. */
export async function getNflBrowserScope(admin:SupabaseClient,source:NflBrowserSource,game:Game):Promise<Scope> {
  if(!/^\d{4}-\d{2}-\d{2}$/.test(game.gameDate) || !/^(?:[01]?\d|2[0-3]):[0-5]\d$/.test(game.gameTime??'')
    || new Date(`${game.gameDate}T00:00:00Z`).toISOString().slice(0,10)!==game.gameDate) throw new Error('NFL game time unavailable')
  const scheduled=easternKickoff(game.gameDate,game.gameTime)?.getTime()
  if(scheduled===undefined||!Number.isFinite(scheduled)) throw new Error('NFL game time unavailable')
  const parts=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(scheduled)).map(part=>[part.type,part.value]))
  if(`${parts.year}-${parts.month}-${parts.day}`!==game.gameDate || `${parts.hour}:${parts.minute}`!==game.gameTime?.padStart(5,'0')) throw new Error('NFL game time unavailable')
  const [clock,result]=await Promise.all([
    admin.rpc('nfl_research_kickoff',{p_game_id:game.gameId,p_kickoff:new Date(scheduled).toISOString()}).abortSignal(AbortSignal.timeout(12_000)),
    source==='fanduel'
      ? admin.from('nfl_fanduel_capture_history').select('captured_at,raw_tabs').eq('game_id',game.gameId).order('captured_at',{ascending:false}).limit(1).abortSignal(AbortSignal.timeout(12_000)).maybeSingle()
      : admin.from('nfl_pikkit_picks_current').select('captured_at').eq('game_id',game.gameId).abortSignal(AbortSignal.timeout(12_000)).maybeSingle(),
  ])
  const kickoff=typeof clock.data==='string'?Date.parse(clock.data):NaN
  if(clock.error || !Number.isFinite(kickoff) || kickoff>scheduled || result.error) throw new Error('NFL capture state unavailable')
  const entry=result.data as {captured_at?:unknown;raw_tabs?:unknown}|null
  const value=entry && (source!=='fanduel'||!nflCaptureIsIncomplete(entry.raw_tabs)) ? entry.captured_at : null
  const observed=value===null||value===undefined?null:typeof value==='string'?Date.parse(value):NaN
  if(observed!==null && !Number.isFinite(observed)) throw new Error('NFL capture observation unavailable')
  return {gameId:game.gameId,kickoff,observed}
}

/** This uses the existing service-only durable cache as an append-only launch
 * ledger, not its freshness API. A unique insert consumes an attempt while the
 * marker is retained; an uncertain insert never dispatches. Only an exact,
 * confirmed pre-create denial may remove its own marker. The shared cache
 * cleanup can eventually remove markers, so this is not a lifetime game cap. */
export async function readNflBrowserAttempts(admin: SupabaseClient, source: NflBrowserSource, scopes: readonly Scope[], now: number) {
  if (!Number.isFinite(now) || scopes.length > 40 || new Set(scopes.map(scope=>scope.gameId)).size !== scopes.length) throw new Error('Invalid NFL capture scope')
  const requested = scopes.flatMap(scope => (['day-before','two-hours'] as const).flatMap(slot => ([0,1] as const).map(attempt => nflBrowserReservationKey(source,scope.gameId,slot,attempt))))
  if (!requested.length) return new Map<string, NflBrowserAttempt[]>()
  const {data,error}=await admin.from('nba_source_cache').select('key,fetched_at,payload').in('key',requested).limit(requested.length).abortSignal(AbortSignal.timeout(12_000))
  if(error || !Array.isArray(data) || data.length>requested.length) throw new Error('NFL browser reservation history unavailable')
  const unique=new Set<string>(), rows=new Map<string,NflBrowserAttempt[]>()
  for(const raw of data as Stored[]){
    if(!raw || !requested.includes(raw.key) || unique.has(raw.key) || typeof raw.fetched_at!=='string') throw new Error('Invalid NFL browser reservation')
    unique.add(raw.key)
    const payload=raw.payload as {version?:unknown;slot?:unknown;attempt?:unknown;gameId?:unknown;source?:unknown}|null
    if(!payload || payload.version!==1 || payload.source!==source || typeof payload.gameId!=='string'
      || !['day-before','two-hours'].includes(String(payload.slot)) || ![0,1].includes(Number(payload.attempt))
      || raw.key!==nflBrowserReservationKey(source,payload.gameId,payload.slot as 'day-before'|'two-hours',payload.attempt as 0|1)) throw new Error('Invalid NFL browser reservation')
    const at=Date.parse(raw.fetched_at)
    if(!Number.isFinite(at)||at>now) throw new Error('Invalid NFL browser reservation time')
    const key=`${payload.gameId}:${payload.slot}`, items=rows.get(key)??[]
    items.push({attempt:payload.attempt as 0|1,at});rows.set(key,items)
  }
  return rows
}

export async function reserveNflBrowserAttempt(admin: SupabaseClient, source: NflBrowserSource, scope: Scope, now: number): Promise<NflBrowserReservation | null> {
  const priorDecision=nflBrowserDecision(scope.kickoff,scope.observed,[],now)
  if (!priorDecision.slot) return null
  const rows=await readNflBrowserAttempts(admin,source,[scope],now)
  const decision=nflBrowserDecision(scope.kickoff,scope.observed,rows.get(`${scope.gameId}:${priorDecision.slot}`)??[],now)
  if(!decision.due || decision.slot===null || decision.attempt===null) return null
  const key=nflBrowserReservationKey(source,scope.gameId,decision.slot,decision.attempt)
  const stamp=new Date(now).toISOString()
  const reservationId=randomUUID()
  const {data,error}=await admin.from('nba_source_cache').insert({key,payload:{version:1,source,gameId:scope.gameId,slot:decision.slot,attempt:decision.attempt,reservationId},fetched_at:stamp,expires_at:new Date(now+7*86_400_000).toISOString()}).select('key').abortSignal(AbortSignal.timeout(12_000)).maybeSingle()
  if(error?.code==='23505') return null
  if(error || !data || data.key!==key) throw new Error('NFL browser reservation could not be confirmed')
  return {key,fetchedAt:stamp,reservationId}
}

/** Remove only this caller's exact marker after its own verified no-create
 * denial. A stale cleanup cannot delete a newer writer's reservation. An
 * unknown delete result is never itself a reason to dispatch a browser. */
export async function releaseNflBrowserAttempt(admin: SupabaseClient, reservation: NflBrowserReservation): Promise<boolean> {
  if (!/^nfl:browser:v1:(?:public|fanduel):[A-Za-z0-9_-]{1,80}:(?:day-before|two-hours):[01]$/.test(reservation.key)
    || !Number.isFinite(Date.parse(reservation.fetchedAt))
    || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(reservation.reservationId)) throw new Error('Invalid NFL browser reservation')
  const {data,error}=await admin.from('nba_source_cache').delete().eq('key',reservation.key).eq('fetched_at',reservation.fetchedAt)
    .contains('payload',{reservationId:reservation.reservationId}).select('key').abortSignal(AbortSignal.timeout(12_000)).maybeSingle()
  if(error) throw new Error('NFL browser reservation release could not be confirmed')
  return data?.key===reservation.key
}
