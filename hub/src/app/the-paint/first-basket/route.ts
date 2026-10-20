import { NextRequest, NextResponse } from 'next/server'
import { requirePaintAccess } from '@/lib/paintAccess'
import { getPaintBoard, getPaintGame } from '@/lib/nbaPaintData'
import { createAdminClient } from '@/lib/supabase/admin'
import { nbaFirstBasketResearch, nbaOpeningSequence } from '@/lib/nbaFirstBasket'
import { bdlHeaders } from '@/lib/balldontlie'
import type { NbaPlay } from '@/lib/nbaShots'
export const maxDuration = 120
export async function GET(request: NextRequest) {
  const gate = await requirePaintAccess(); if (gate.error) return gate.error
  const id = request.nextUrl.searchParams.get('game')
  if (!id || !/^\d{1,10}$/.test(id)) return NextResponse.json({error:'Choose a valid NBA game'},{status:400})
  try {
    const board = await getPaintBoard(await getPaintGame(Number(id)))
    const gameIds = [...new Set([board.game.home_team.id,board.game.visitor_team.id].flatMap(teamId => {
      const games = board.players.flatMap(p => p.logs).filter(l => l.team.id === teamId && l.game.date.slice(0,10) < board.game.date && l.game.postseason !== true && (l.game.status_state === 'final' || l.game.status === 'Final'))
      return [...new Map(games.sort((a,b) => b.game.date.localeCompare(a.game.date)).map(l => [l.game.id,l])).keys()].slice(0,10)
    }))]
    const { data, error } = gameIds.length ? await createAdminClient().from('nba_game_plays').select('game_id,payload').in('game_id',gameIds).eq('payload->>period','1').order('game_id').order('play_order').limit(5000) : {data:[],error:null}
    if (error) throw new Error('Opening plays unavailable')
    const plays = (data ?? []).flatMap(row => { const play=row.payload as NbaPlay; return play.game_id === row.game_id ? [play] : [] })
    // Read missing opening sequences on demand in the cloud. This is bounded
    // page research, not a collector replay or historical database backfill.
    const missing=gameIds.filter(game=>!nbaOpeningSequence(plays,game).firstFieldGoal)
    const started=Date.now();let failed=0
    for(let offset=0;offset<missing.length;offset+=4){
      if(Date.now()-started>55000){failed+=missing.length-offset;break}
      await Promise.all(missing.slice(offset,offset+4).map(async game=>{try{
        const response=await fetch(`https://api.balldontlie.io/v1/plays?game_id=${game}`,{headers:bdlHeaders,next:{revalidate:3600},signal:AbortSignal.timeout(12000)})
        if(!response.ok)throw new Error('Opening plays unavailable')
        const body=await response.json() as {data:NbaPlay[];meta?:{next_cursor?:number|null}}
        if(!Array.isArray(body.data)||body.meta?.next_cursor!=null||body.data.some(p=>p.game_id!==game||!Array.isArray(p.participants)||!Number.isSafeInteger(p.order)))throw new Error('Opening play coverage invalid')
        plays.push(...body.data)
      }catch{failed++}}))
    }
    return NextResponse.json({...nbaFirstBasketResearch(board,plays,gameIds),failed,fetchedAt:new Date().toISOString()},{headers:{'Cache-Control':'private, no-store'}})
  } catch { return NextResponse.json({error:'First-basket research could not load. Try again.'},{status:503}) }
}
