import { NextResponse } from 'next/server'
import { PRODUCT_EXPERIENCE_ROUTES, routeCompletion } from '@/lib/productExperienceAudit'
import { summarizeProductTelemetry } from '@/lib/productExperienceTelemetry'
import { PRODUCT_ROADMAP_PHASES, roadmapCompletion } from '@/lib/productRoadmap'
import { adminDecisionActor } from '@/lib/supabase/adminDecisionActor'

const headers = { 'Cache-Control': 'private, no-store' }

export async function GET(request: Request) {
  if (!request.headers.has('authorization')) return NextResponse.json({ error: 'Sign in required' }, { status: 401, headers })
  const actor = await adminDecisionActor(request)
  if (actor.error) return actor.error
  const { data, error } = await actor.admin.from('product_interaction_events')
    .select('route,event_name,outcome,duration_ms,device_class,created_at')
    .order('created_at', { ascending: false })
    .limit(5000)
  if (error) return NextResponse.json({ error: 'Website telemetry couldn’t load' }, { status: 503, headers })

  return NextResponse.json({
    routes: PRODUCT_EXPERIENCE_ROUTES.map(route => ({ ...route, completion: routeCompletion(route) })),
    roadmap: { phases: PRODUCT_ROADMAP_PHASES, completion: roadmapCompletion() },
    telemetry: summarizeProductTelemetry(data ?? []),
  }, { headers })
}
