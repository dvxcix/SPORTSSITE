import { NextResponse } from 'next/server'
import { requireCronAuth } from '@/lib/cron-auth'
import { withPipelineHealth } from '@/lib/pipelineHealth'
import { processNextContactRecapExport, recoverStaleContactRecapExports } from '@/lib/contactRecapExportQueue'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 800

async function run(request: Request) {
  const authError = requireCronAuth(request)
  if (authError) return authError
  await recoverStaleContactRecapExports()
  const results = []
  for (let index = 0; index < 2; index++) {
    const result = await processNextContactRecapExport()
    if (!result.processed) break
    results.push(result)
  }
  return NextResponse.json({ ok: true, processed: results.length, results })
}

export const GET = withPipelineHealth('process-contact-recap-exports', run)
