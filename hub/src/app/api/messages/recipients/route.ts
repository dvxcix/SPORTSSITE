import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { searchMessageRecipients } from '@/lib/messageRecipients'

export async function GET(request: Request) {
  const headers = { 'Cache-Control': 'private, no-store' }
  try {
    const client = await createClient()
    const { data: { user }, error } = await client.auth.getUser()
    if (error || !user) return NextResponse.json({ error: 'Sign in to search members.' }, { status: 401, headers })
    const users = await searchMessageRecipients(client, user.id, new URL(request.url).searchParams.get('q') ?? '')
    return NextResponse.json({ users }, { headers })
  } catch {
    return NextResponse.json({ error: 'Member search is unavailable. Try again.' }, { status: 503, headers })
  }
}
