import { NextResponse } from 'next/server'
import { changeNflAccess, readNflAccess } from '@/lib/adminNflAccess'
import { adminDecisionActor } from '@/lib/supabase/adminDecisionActor'

const headers = { 'Cache-Control': 'private, no-store' }

export async function GET(request: Request) {
  const actor = await adminDecisionActor(request)
  if (actor.error) return actor.error
  return readNflAccess(request, actor.admin)
}

export async function POST(request: Request) {
  if (!request.headers.has('authorization')) return NextResponse.json({ error: 'Sign in required' }, { status: 401, headers })
  const actor = await adminDecisionActor(request)
  if (actor.error) return actor.error
  return changeNflAccess(request, () => actor.admin, actor.user.id)
}
