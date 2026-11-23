'use client'
import { useEffect, useState } from 'react'
import { publicWorkspaceFetch as fetch } from '@/lib/publicWorkspaceClient'
import type { NflPublicResult } from '@/lib/nflPublicResults'
import { startNflPolling } from '@/lib/nflPolling'

export function useSidelineFinals(gameId:string, finished:boolean, initial:NflPublicResult|null) {
  const [saved,setSaved] = useState({ gameId, result:initial })
  useEffect(()=>{
    if (!finished) return
    let active=true
    const stop=startNflPolling(async signal=>{
      const response=await fetch('/the-sideline/market?results=only&game='+encodeURIComponent(gameId),{signal,cache:'no-store'})
      if (!response.ok) throw new Error('Final results unavailable')
      const data=await response.json() as {gameId?:string;results?:NflPublicResult|null}
      if (data.gameId!==gameId || data.results && (data.results.status!=='final' || !Array.isArray(data.results.players))) throw new Error('Final result mismatch')
      if (active) setSaved(current=>data.results ? {gameId,result:data.results} : current)
    },{immediate:!initial})
    return ()=>{active=false;stop()}
  },[gameId,finished,initial])
  return saved.gameId===gameId ? saved.result : null
}
