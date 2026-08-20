import { NextResponse } from 'next/server'
import { requireCronAuth } from '@/lib/cron-auth'
import { withPipelineHealth } from '@/lib/pipelineHealth'
import { processNextContactAlertJob, recoverStaleContactAlertJobs } from '@/lib/contactAlertOutbox'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

async function run(request: Request) {
  const authError = requireCronAuth(request)
  if (authError) return authError
  await recoverStaleContactAlertJobs()
  const results = []
  for (let index = 0; index < 4; index += 1) {
    const result = await processNextContactAlertJob()
    if (!result.processed) break
    results.push(result)
  }
  return NextResponse.json({ ok: true, processed: results.length, results })
}

export const GET = withPipelineHealth('process-contact-alerts', run)
