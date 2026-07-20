import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireBrowserbaseCronAuth } from '@/lib/cron-auth'
import { reconcileWhopMain } from '@/lib/whopMainReconcile'

export const revalidate = 0

// Accepts either a real signed-in admin session OR the shared cron bearer
// token, same as /api/admin/whop-addon-reconcile — manual/emergency re-run;
// the hourly automatic one is /api/cron/whop-reconcile.
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

  const result = await reconcileWhopMain()
  if ('error' in result) return NextResponse.json(result, { status: result.error.includes('not configured') ? 500 : 502 })
  return NextResponse.json(result)
}
