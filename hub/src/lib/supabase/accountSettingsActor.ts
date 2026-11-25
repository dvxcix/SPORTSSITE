import 'server-only'
import { NextResponse } from 'next/server'
import { requireNativeAccount } from './nativeAccount'
import { createClient } from './server'

export async function accountSettingsActor(request: Request) {
  const native = request.headers.has('authorization') ? await requireNativeAccount(request) : null
  if (native?.error) return { error: native.error }
  const supabase = native?.supabase ?? await createClient()
  const token = native ? request.headers.get('authorization')?.match(/^Bearer\s+(\S+)$/i)?.[1] : undefined
  const { data: { user } } = await supabase.auth.getUser(token)
  if (!user || (native && user.id !== native.userId)) {
    return { error: NextResponse.json({ error: 'Not signed in' }, { status: 401 }) }
  }
  return { supabase, user, native: native !== null }
}
