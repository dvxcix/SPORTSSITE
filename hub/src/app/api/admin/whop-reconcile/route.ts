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

  const params = new URL(req.url).searchParams
  const userId = params.get('userId') ?? undefined
  if (userId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(userId)) return NextResponse.json({ error: 'Invalid member' }, { status: 400 })
  const result = await reconcileWhopMain({ userId, dryRun: params.get('dryRun') === '1' })
  if ('error' in result) return NextResponse.json(result, { status: result.error.includes('not configured') ? 500 : 502 })
  return NextResponse.json(result, { headers: { 'Cache-Control': 'private, no-store' } })
}
