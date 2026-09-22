import { NextResponse } from 'next/server'
import { revalidateTag } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireCronAuth } from '@/lib/cron-auth'
import { withPipelineHealth } from '@/lib/pipelineHealth'
import { safeApiError } from '@/lib/safeApiError'
import { syncNflGameEvents } from '@/lib/nflGameFeeds'
import { currentNflSeason } from '@/lib/nflProduction'
export const maxDuration = 300
async function run(req: Request) {
 const denied=requireCronAuth(req); if(denied) return denied
 try {
  const results=await syncNflGameEvents(createAdminClient(),currentNflSeason())
  revalidateTag('sideline:nfl-live',{expire:0})
  revalidateTag('sideline:nfl-data',{expire:0})
  return NextResponse.json({synced:results.reduce((n,r)=>n+r.events,0),coverage:{results}})
 } catch(error) { return safeApiError('nfl-sync-game-events',error) }
}
export const GET=withPipelineHealth('nfl-sync-game-events',run)
