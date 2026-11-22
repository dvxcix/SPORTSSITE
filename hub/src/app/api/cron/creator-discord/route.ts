import { NextResponse } from 'next/server'
import { requireCronAuth } from '@/lib/cron-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { processCreatorDiscordQueue } from '@/lib/creatorDiscord'
import { withPipelineHealth } from '@/lib/pipelineHealth'
export const maxDuration=300
export const revalidate=0
export const GET=withPipelineHealth('creator-discord', run)
async function run(request:Request){
 const error=requireCronAuth(request);if(error)return error
 const result=await processCreatorDiscordQueue(createAdminClient())
 return NextResponse.json(result.failed?{...result,error:'Some Discord deliveries are retained for retry.'}:result,{status:result.failed?503:200})
}
