import { NextResponse } from 'next/server'
import { backtestSavedMatrix, MAX_RANGE_DAYS } from '@/lib/adminMatrixBacktest'
import { MLB_HIBERNATING } from '@/lib/mlbOffseason'
import { adminDecisionActor } from '@/lib/supabase/adminDecisionActor'

export const maxDuration = 300
const headers = { 'Cache-Control': 'private, no-store' }

export async function GET(request: Request) {
  if (!request.headers.has('authorization')) return NextResponse.json({ error: 'Sign in required' }, { status: 401, headers })
  const actor = await adminDecisionActor(request)
  if (actor.error) return actor.error
  return NextResponse.json({ paused: MLB_HIBERNATING, maximumDays: MAX_RANGE_DAYS }, { headers })
}

export async function POST(request: Request) {
  if (!request.headers.has('authorization')) return NextResponse.json({ error: 'Sign in required' }, { status: 401, headers })
  const actor = await adminDecisionActor(request)
  if (actor.error) return actor.error
  if (MLB_HIBERNATING) {
    return NextResponse.json({ error: 'MLB backtesting is paused for the off-season.' }, { status: 503, headers })
  }
  const result = await backtestSavedMatrix(request, () => actor.admin)
  result.headers.set('Cache-Control', headers['Cache-Control'])
  return result
}
