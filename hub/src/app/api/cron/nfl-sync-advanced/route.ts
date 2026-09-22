import { NextResponse } from 'next/server'
import { revalidateTag } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireCronAuth } from '@/lib/cron-auth'
import { withPipelineHealth } from '@/lib/pipelineHealth'
import { safeApiError } from '@/lib/safeApiError'
import { syncNflAuxiliary } from '@/lib/nflGameFeeds'
import { currentNflSeason } from '@/lib/nflProduction'
export const maxDuration = 300
async function run(req: Request) {
 const denied=requireCronAuth(req); if(denied) return denied
 try {
  const coverage=await syncNflAuxiliary(createAdminClient(),currentNflSeason())
  revalidateTag('sideline:nfl-data',{expire:0})
  return NextResponse.json({coverage})
 } catch(error) { return safeApiError('nfl-sync-advanced',error) }
}
export const GET=withPipelineHealth('nfl-sync-advanced',run)
