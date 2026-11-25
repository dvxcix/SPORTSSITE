import 'server-only'
import { NextResponse } from 'next/server'
import { createClient } from './supabase/server'
import { adminDecisionActor } from './supabase/adminDecisionActor'

const headers = { 'Cache-Control': 'private, no-store' }

export async function discordAdminActor(request: Request) {
  if (request.headers.has('authorization')) {
    const actor = await adminDecisionActor(request)
    return actor.error ? { error: actor.error } : { id: actor.user.id, native: true as const, admin: actor.admin }
  }
  const client = await createClient()
  const { data: { user } } = await client.auth.getUser()
  if (!user) return { error: NextResponse.json({ error: 'Not signed in' }, { status: 401, headers }) }
  const { data: profile } = await client.from('users').select('account_type').eq('id', user.id).single()
  if (profile?.account_type !== 'admin') return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403, headers }) }
  return { id: user.id, native: false as const }
}
