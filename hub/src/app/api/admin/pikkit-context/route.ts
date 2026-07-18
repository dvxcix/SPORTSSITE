import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createPersistentContext } from '@/lib/browserbase'

async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: NextResponse.json({ error: 'Not signed in' }, { status: 401 }) }
  const { data: profile } = await supabase.from('users').select('account_type').eq('id', user.id).single()
  if (profile?.account_type !== 'admin') return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  return {}
}

// One-time setup, run by hand from a signed-in admin browser tab (not a
// cron job) — mints a durable Browserbase context and returns a Live View
// URL. Open that URL, sign into Pikkit yourself inside it (this codebase
// never sees the password), then save the returned contextId as
// PIKKIT_CONTEXT_ID in Vercel's env vars. Every future scrape-pikkit cron
// run resumes that same signed-in context — no re-login needed unless
// Pikkit's session actually expires. Re-running this mints a BRAND NEW,
// separately-unauthenticated context — it doesn't refresh the old one, so
// there's no reason to hit this again unless you need to re-auth.
export async function GET() {
  const auth = await requireAdmin()
  if (auth.error) return auth.error
  const { contextId, liveViewUrl } = await createPersistentContext()
  return NextResponse.json({ contextId, liveViewUrl })
}
