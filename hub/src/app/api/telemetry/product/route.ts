import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const ROUTE = /^\/[A-Za-z0-9_./@%{}\[\]-]{0,179}$/
const EVENTS = new Set(['route_view', 'route_ready', 'action_success', 'action_failure', 'slow_interaction', 'activation'])
const OUTCOMES = new Set(['observed', 'success', 'failure', 'abandoned'])
const DEVICES = new Set(['phone', 'foldable', 'tablet', 'desktop', 'wide'])

export async function POST(request: NextRequest) {
  const origin = request.headers.get('origin')
  if (origin) {
    try {
      if (new URL(origin).host !== request.nextUrl.host) return new NextResponse(null, { status: 403 })
    } catch {
      return new NextResponse(null, { status: 403 })
    }
  }
  const body = await request.json().catch(() => null)
  const sessionId = typeof body?.sessionId === 'string' ? body.sessionId : ''
  const eventName = typeof body?.eventName === 'string' ? body.eventName : ''
  const route = typeof body?.route === 'string' ? body.route : ''
  const outcome = typeof body?.outcome === 'string' ? body.outcome : ''
  const durationMs = body?.durationMs == null ? null : Number(body.durationMs)
  const deviceClass = typeof body?.deviceClass === 'string' ? body.deviceClass : ''
  if (!UUID.test(sessionId) || !EVENTS.has(eventName) || !ROUTE.test(route) || !OUTCOMES.has(outcome) || !DEVICES.has(deviceClass) || (durationMs != null && (!Number.isInteger(durationMs) || durationMs < 0 || durationMs > 120_000))) {
    return new NextResponse(null, { status: 400, headers: { 'Cache-Control': 'no-store' } })
  }
  const supabase = await createClient()
  const { error } = await supabase.rpc('record_product_interaction', { p_session_id: sessionId, p_event_name: eventName, p_route: route, p_outcome: outcome, p_duration_ms: durationMs, p_device_class: deviceClass })
  return new NextResponse(null, { status: error ? 503 : 204, headers: { 'Cache-Control': 'no-store' } })
}
