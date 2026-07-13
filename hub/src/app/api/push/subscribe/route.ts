import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const body = await request.json().catch(() => null)
  const endpoint = body?.endpoint as string | undefined
  const p256dh = body?.keys?.p256dh as string | undefined
  const auth = body?.keys?.auth as string | undefined
  if (!endpoint || !p256dh || !auth) {
    return NextResponse.json({ error: 'Malformed subscription' }, { status: 400 })
  }

  // endpoint is globally unique per browser/device subscription — upserting
  // on it means re-subscribing (e.g. after a permission reset) updates the
  // existing row instead of accumulating duplicates.
  const { error } = await supabase.from('push_subscriptions').upsert({
    user_id: user.id,
    endpoint,
    p256dh,
    auth,
  }, { onConflict: 'endpoint' })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
