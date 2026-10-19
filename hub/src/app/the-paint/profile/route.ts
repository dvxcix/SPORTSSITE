import { NextRequest, NextResponse } from 'next/server'
import { requirePaintAccess } from '@/lib/paintAccess'
import { getPaintProfile } from '@/lib/nbaPaintData'
export async function GET(request: NextRequest) {
  const gate = await requirePaintAccess(); if (gate.error) return gate.error
  const id = request.nextUrl.searchParams.get('player'); const season = Number(request.nextUrl.searchParams.get('season'))
  if (!id || !/^\d{1,10}$/.test(id) || !Number.isInteger(season) || season < 1996 || season > new Date().getUTCFullYear()) return NextResponse.json({ error: 'Invalid player' }, { status: 400 })
  return NextResponse.json(await getPaintProfile(Number(id), season), { headers: { 'Cache-Control': 'private, no-store' } })
}
