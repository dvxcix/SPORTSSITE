'use client'
import { useEffect, useMemo, useState } from 'react'
import { nbaGameFinal } from '@/lib/nbaOddsMode'
import type { PaintGame } from '@/lib/nbaPaint'
import type { NbaFinalOutcome } from '@/lib/nbaFinalOutcomes'

/** Final results are independently loaded; they never replace pregame research. */
export function useNbaFinalOutcomes(date:string, market:string, mode:string, games:PaintGame[], selected?:PaintGame, enabled=true) {
  const finals=[...new Map([...games,...(selected?[selected]:[])].filter(game=>game.date===date&&nbaGameFinal(game)).map(game=>[game.id,game])).values()].sort((a,b)=>a.id-b.id)
  const identity=JSON.stringify(finals.map(game=>[game.id,game.date,game.season,game.home_team.id,game.visitor_team.id,game.datetime,game.status,game.status_state]))
  const key=enabled&&mode==='pregame'&&finals.length?`${date}:${market}:${identity}`:''
  const [data,setData]=useState<{key:string;rows:NbaFinalOutcome[]}|null>(null)
  useEffect(()=>{
    if(!key)return
    const controller=new AbortController()
    const load=async()=>{
      try {
        const response=await fetch(`/the-paint/final-results?${new URLSearchParams({date,market})}`,{signal:controller.signal})
        if(!response.ok)return
        const json=await response.json()
        if(!controller.signal.aborted&&json.date===date&&json.market===market&&Array.isArray(json.rows)&&json.rows.length<=2560)setData({key,rows:json.rows})
      }catch{/* Outcomes are optional and do not delay the board. */}
    }
    void load()
    const recent=Date.now()-Date.parse(`${date}T00:00:00Z`)<172800000
    const timer=recent?window.setInterval(()=>{if(document.visibilityState==='visible')void load()},300000):null
    return()=>{controller.abort();if(timer!=null)window.clearInterval(timer)}
  },[date,market,key])
  return useMemo(()=>{
    const results=new Map<string,NbaFinalOutcome>(),duplicates=new Set<string>()
    if(!key||data?.key!==key)return results
    for(const row of data.rows){
      if(!row||typeof row!=='object'||!Number.isSafeInteger(row.gameId)||!Number.isSafeInteger(row.playerId)||!Number.isSafeInteger(row.teamId)||!Number.isFinite(row.value)||row.value<0||row.value>1000)continue
      const id=`${row.gameId}:${row.playerId}`
      if(results.has(id)){results.delete(id);duplicates.add(id)}else if(!duplicates.has(id))results.set(id,row)
    }
    return results
  },[data,key])
}
export function nbaFinalValue(outcomes:ReadonlyMap<string,NbaFinalOutcome>|undefined,gameId:number,playerId:number,teamId:number){
  const outcome=outcomes?.get(`${gameId}:${playerId}`)
  return outcome?.teamId===teamId?outcome.value:null
}
