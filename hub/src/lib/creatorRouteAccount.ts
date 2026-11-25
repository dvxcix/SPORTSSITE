import 'server-only'
import { NextResponse } from 'next/server'
import { requireNativeAccount } from '@/lib/supabase/nativeAccount'
import { createClient } from '@/lib/supabase/server'

export async function creatorRouteAccount(request: Request, signInError = 'Not signed in') {
  if (request.headers.has('authorization')) {
    const account = await requireNativeAccount(request)
    if (account.error) return { error: account.error }
    return { client: account.supabase, userId: account.userId, native: true, email: undefined }
  }
  const headers = { 'Cache-Control': 'private, no-store' }
  const client = await createClient()
  const { data: { user } } = await client.auth.getUser()
  if (!user) return { error: NextResponse.json({ error: signInError }, { status: 401, headers }) }
  return { client, userId: user.id, native: false, email: user.email }
}
