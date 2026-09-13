import { NextResponse } from 'next/server'
import { requireTier } from '@/lib/requireTier'

export const dynamic = 'force-dynamic'

const TENOR_BASE = 'https://tenor.googleapis.com/v2'
const CLIENT_KEY = 'slipsurge_social'

type TenorMedia = { url?: string; dims?: number[] }
type TenorResult = {
  id?: string
  title?: string
  content_description?: string
  media_formats?: Record<string, TenorMedia>
}

function cleanQuery(value: string | null) {
  return (value ?? '').trim().replace(/[\u0000-\u001f]/g, '').slice(0, 80)
}

function normalize(result: TenorResult) {
  const preview = result.media_formats?.tinygif ?? result.media_formats?.nanogif
  const shared = result.media_formats?.mediumgif ?? result.media_formats?.gif ?? preview
  if (!result.id || !preview?.url || !shared?.url) return null
  return {
    id: result.id,
    title: result.content_description || result.title || 'GIF',
    previewUrl: preview.url,
    url: shared.url,
    width: preview.dims?.[0] ?? null,
    height: preview.dims?.[1] ?? null,
  }
}

export async function GET(request: Request) {
  const gate = await requireTier('free')
  if (gate.error) return gate.error

  const key = process.env.TENOR_API_KEY
  if (!key) return NextResponse.json({ error: 'GIF library is temporarily unavailable.', results: [], next: null }, { status: 503 })

  const { searchParams } = new URL(request.url)
  const query = cleanQuery(searchParams.get('q'))
  const position = cleanQuery(searchParams.get('pos')).slice(0, 160)
  const endpoint = query ? 'search' : 'featured'
  const upstream = new URL(`${TENOR_BASE}/${endpoint}`)
  upstream.searchParams.set('key', key)
  upstream.searchParams.set('client_key', CLIENT_KEY)
  upstream.searchParams.set('limit', '24')
  upstream.searchParams.set('contentfilter', 'medium')
  upstream.searchParams.set('media_filter', 'tinygif,mediumgif,gif')
  upstream.searchParams.set('locale', 'en_US')
  if (query) upstream.searchParams.set('q', query)
  if (position) upstream.searchParams.set('pos', position)

  try {
    const response = await fetch(upstream, { signal: AbortSignal.timeout(6_000), cache: 'no-store' })
    if (!response.ok) return NextResponse.json({ error: 'GIF library did not respond.', results: [], next: null }, { status: 502 })
    const payload = await response.json() as { results?: TenorResult[]; next?: string }
    return NextResponse.json({
      results: (payload.results ?? []).map(normalize).filter(Boolean),
      next: payload.next || null,
      query,
    }, { headers: { 'Cache-Control': 'private, max-age=60' } })
  } catch {
    return NextResponse.json({ error: 'GIF library timed out.', results: [], next: null }, { status: 504 })
  }
}

export async function POST(request: Request) {
  const gate = await requireTier('free')
  if (gate.error) return gate.error
  const key = process.env.TENOR_API_KEY
  if (!key) return new NextResponse(null, { status: 204 })

  const body = await request.json().catch(() => ({})) as { id?: unknown; query?: unknown }
  const id = typeof body.id === 'string' ? body.id.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 80) : ''
  const query = typeof body.query === 'string' ? cleanQuery(body.query) : ''
  if (!id) return NextResponse.json({ error: 'Invalid GIF.' }, { status: 400 })

  const upstream = new URL(`${TENOR_BASE}/registershare`)
  upstream.searchParams.set('key', key)
  upstream.searchParams.set('client_key', CLIENT_KEY)
  upstream.searchParams.set('id', id)
  if (query) upstream.searchParams.set('q', query)
  await fetch(upstream, { signal: AbortSignal.timeout(3_000), cache: 'no-store' }).catch(() => null)
  return new NextResponse(null, { status: 204 })
}
