import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireBrowserbaseCronAuth } from '@/lib/cron-auth'
import { reconcileWhopAddon, debugRawMembershipsFetch } from '@/lib/whopAddonReconcile'

export const revalidate = 0

// Accepts either a real signed-in admin session OR the same cron bearer
// token every other server-to-server admin route already accepts — this
// one specifically needs to be triggerable outside a browser (urgent
// reconciliation, re-runnable any time) without that meaning "open to
// anyone." The hourly automatic run lives at /api/cron/whop-addon-reconcile
// (see vercel.json) — this route stays for manual/emergency re-runs.
async function requireAdmin(req: Request) {
  if (!requireBrowserbaseCronAuth(req)) return {}
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: NextResponse.json({ error: 'Not signed in' }, { status: 401 }) }
  const { data: profile } = await supabase.from('users').select('account_type').eq('id', user.id).single()
  if (profile?.account_type !== 'admin') return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  return {}
}

export async function GET(req: Request) {
  const auth = await requireAdmin(req)
  if (auth.error) return auth.error

  if (new URL(req.url).searchParams.get('debug') === '1') {
    return NextResponse.json(await debugRawMembershipsFetch())
  }

  const result = await reconcileWhopAddon()
  if ('error' in result) return NextResponse.json(result, { status: result.error.includes('not configured') ? 500 : 502 })
  return NextResponse.json(result)
}
