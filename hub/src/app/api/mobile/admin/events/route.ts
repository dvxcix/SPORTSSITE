import { NextResponse } from 'next/server'
import { isAccountId } from '@/lib/blocks'
import { adminDecisionActor } from '@/lib/supabase/adminDecisionActor'

const headers = { 'Cache-Control': 'private, no-store' }
const reply = (body: unknown, status = 200) => NextResponse.json(body, { status, headers })

export async function GET(request: Request) {
  const account = await adminDecisionActor(request)
  if (account.error) return account.error
  const { data, error } = await account.admin.from('events')
    .select('id,title,description,sport,location,is_online,start_date,end_date,going_count,interested_count,host:users(username,display_name,avatar_url,is_verified)')
    .order('start_date', { ascending: false }).order('id', { ascending: false }).limit(100)
  return error ? reply({ error: 'Events could not be loaded' }, 503) : reply({ events: data ?? [] })
}

export async function DELETE(request: Request) {
  const account = await adminDecisionActor(request)
  if (account.error) return account.error
  const id = new URL(request.url).searchParams.get('id')
  if (!id || !isAccountId(id)) return reply({ error: 'Choose a valid event' }, 400)
  const { data, error } = await account.admin.from('events').delete().eq('id', id).select('id').maybeSingle()
  if (error) return reply({ error: 'The event could not be deleted' }, 503)
  return data ? reply({ removed: data.id }) : reply({ error: 'Event not found' }, 404)
}
