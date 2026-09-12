import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const EVENTS = new Set(['storefront_view', 'offer_view', 'checkout_started'])
const SOURCES = new Set(['direct', 'feed', 'profile', 'community', 'search', 'external'])

export async function POST(request: NextRequest) {
  const origin = request.headers.get('origin')
  if (origin) {
    try {
      if (new URL(origin).host !== request.nextUrl.host) return NextResponse.json({ recorded: false }, { status: 403 })
    } catch {
      return NextResponse.json({ recorded: false }, { status: 403 })
    }
  }

  const body = await request.json().catch(() => null)
  const creatorId = typeof body?.creatorId === 'string' ? body.creatorId : ''
  const productId = typeof body?.productId === 'string' ? body.productId : null
  const eventType = typeof body?.eventType === 'string' ? body.eventType : ''
  const sessionId = typeof body?.sessionId === 'string' ? body.sessionId : ''
  const source = typeof body?.source === 'string' && SOURCES.has(body.source) ? body.source : 'direct'
  if (!UUID.test(creatorId) || !UUID.test(sessionId) || (productId && !UUID.test(productId)) || !EVENTS.has(eventType)) {
    return NextResponse.json({ recorded: false }, { status: 400 })
  }

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('record_creator_funnel_event', {
    p_creator_id: creatorId,
    p_product_id: productId,
    p_event_type: eventType,
    p_session_id: sessionId,
    p_source: source,
  })
  if (error) return NextResponse.json({ recorded: false }, { status: 503, headers: { 'Cache-Control': 'no-store' } })
  return NextResponse.json({ recorded: Boolean(data) }, { headers: { 'Cache-Control': 'no-store' } })
}
