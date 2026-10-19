import { createHash } from 'node:crypto'
import { NextResponse } from 'next/server'
import { requireCronAuth } from '@/lib/cron-auth'
import { withPipelineHealth } from '@/lib/pipelineHealth'
import { createAdminClient } from '@/lib/supabase/admin'
import { getPaintSchedule, getPaintProps } from '@/lib/nbaPaintData'
import { nbaEconomicSnapshot } from '@/lib/nbaMovement'
import { nbaToday } from '@/lib/nbaPaint'
export const maxDuration = 60
async function run(request: Request) {
  const denied = requireCronAuth(request); if (denied) return denied
  const started = Date.now(), admin = createAdminClient()
  const today=nbaToday(), tomorrow=new Date(`${today}T12:00:00Z`);tomorrow.setUTCDate(tomorrow.getUTCDate()+1)
  const schedules = await Promise.all([getPaintSchedule(today),getPaintSchedule(tomorrow.toISOString().slice(0,10))])
  const games = [...new Map(schedules.flatMap(s=>s.games).map(g=>[g.id,g])).values()].filter(g => ['scheduled', 'unknown', undefined].includes(g.status_state) && Date.parse(g.datetime ?? g.status) > Date.now()).sort((a,b)=>Date.parse(a.datetime??a.status)-Date.parse(b.datetime??b.status)).slice(0,16)
  const report = { checked: 0, captured: 0, unchanged: 0, failed: 0, deferred: 0 }
  for (let offset = 0; offset < games.length; offset += 4) {
    if (Date.now() - started > 42_000) { report.deferred += games.length-offset; break }
    await Promise.all(games.slice(offset,offset+4).map(async game => {
      report.checked++
      try {
        const props = await getPaintProps(game.id,true)
        if (!props.length || Date.parse(game.datetime??game.status)<=Date.now()) { report.deferred++; return }
        if(props.some(p=>p.game_id!==game.id)){report.failed++;return}
        const fingerprint = createHash('sha256').update(JSON.stringify(nbaEconomicSnapshot(props))).digest('hex')
        const { data,error } = await admin.rpc('record_nba_market_capture',{ p_game_id:game.id,p_game_date:game.date,p_fingerprint:fingerprint,p_props:props })
        if (error) report.failed++; else if (data) report.captured++; else report.unchanged++
      } catch { report.failed++ }
    }))
  }
  return NextResponse.json(report,{status:report.failed ? 503 : 200})
}
export const GET = withPipelineHealth('nba-market-capture',run)
