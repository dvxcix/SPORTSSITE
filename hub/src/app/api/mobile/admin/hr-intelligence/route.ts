import { NextResponse } from 'next/server'
import { readHrIntelligence } from '@/lib/adminHrIntelligence'
import { MLB_HIBERNATING, mlbPausedResponse } from '@/lib/mlbOffseason'
import { adminDecisionActor } from '@/lib/supabase/adminDecisionActor'

export const maxDuration = 300
const headers = { 'Cache-Control': 'private, no-store' }

export async function GET(request: Request) {
  if (!request.headers.has('authorization')) return NextResponse.json({ error: 'Sign in required' }, { status: 401, headers })
  const actor = await adminDecisionActor(request)
  if (actor.error) return actor.error
  if (!new URL(request.url).searchParams.has('date')) return NextResponse.json({ paused: MLB_HIBERNATING }, { headers })
  if (MLB_HIBERNATING) return mlbPausedResponse(503)
  const response = await readHrIntelligence(request, true)
  response.headers.set('Cache-Control', headers['Cache-Control'])
  return response
}
