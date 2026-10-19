import { NextResponse } from 'next/server'
import { requirePaintAccess } from '@/lib/paintAccess'
import { searchNbaDirectory } from '@/lib/nbaDirectory'

export async function GET(request: Request) {
  const gate = await requirePaintAccess()
  if (gate.error) return gate.error
  const query = (new URL(request.url).searchParams.get('q') ?? '').trim().slice(0, 64)
  if (query.length < 2) return NextResponse.json({ players: [], teams: [] }, { headers: { 'Cache-Control': 'private, no-store' } })
  try { return NextResponse.json(await searchNbaDirectory(query), { headers: { 'Cache-Control': 'private, no-store' } }) }
  catch { return NextResponse.json({ error: 'NBA search is temporarily unavailable', players: [], teams: [] }, { status: 503, headers: { 'Cache-Control': 'private, no-store' } }) }
}
