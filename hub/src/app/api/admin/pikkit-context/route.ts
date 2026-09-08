import { type NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createPersistentContext } from '@/lib/browserbase'

export const maxDuration = 60

async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: NextResponse.json({ error: 'Not signed in' }, { status: 401 }) }
  const { data: profile } = await supabase.from('users').select('account_type').eq('id', user.id).single()
  if (profile?.account_type !== 'admin') return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  return {}
}

// Manual setup from a signed-in admin browser. Normal requests deliberately
// reuse the current Pikkit manual-auth session (or its persisted context)
// so a retry does not look like another new device to Cloudflare. Add
// ?fresh=1 only when the admin explicitly wants to discard that continuity.
export async function GET(request: NextRequest) {
  const auth = await requireAdmin()
  if (auth.error) return auth.error
  const fresh = request.nextUrl.searchParams.get('fresh') === '1'
  const setup = await createPersistentContext(undefined, { fresh })
  console.info('[pikkit-context] manual auth ready', {
    session: setup.sessionId.slice(-8),
    context: setup.contextId.slice(-8),
    continuity: setup.continuity,
    region: setup.region,
    proxyMode: setup.proxyMode,
    expiresAt: setup.expiresAt,
  })
  return NextResponse.json({
    ...setup,
    verification: 'manual',
    instructions: 'Open liveViewUrl and complete Pikkit sign-in and SMS verification yourself. Keep using this same setup URL if you need to reopen Live View; it now preserves the active browser identity instead of starting over.',
    afterLogin: 'After the signed-in Pikkit page is visible, release sessionId from the Browserbase Sessions dashboard, wait a few seconds for the context to persist, then save contextId as PIKKIT_CONTEXT_ID and redeploy.',
    cloudflareNote: 'Complete Cloudflare manually in Live View. Do not open fresh=1 or create another Browserbase session during the same login attempt; changing identity can invalidate the verification.',
    freshSessionUrl: `${request.nextUrl.origin}${request.nextUrl.pathname}?fresh=1`,
  })
}
