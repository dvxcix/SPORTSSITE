import 'server-only'
import { NextResponse } from 'next/server'
import { resolveAuthedClient } from '@/lib/requireTier'
import { ownOnboardingComplete } from './ownOnboarding'

const headers = { 'Cache-Control': 'private, no-store' }

export async function requireNativeAccount(request: Request): Promise<NextResponse | null> {
  const token = request.headers.get('authorization')?.match(/^Bearer\s+(\S+)$/i)?.[1]
  if (!token) return NextResponse.json({ error: 'Sign in required' }, { status: 401, headers })

  try {
    const { supabase, userId, error } = await resolveAuthedClient()
    if (error) return error
    if (!userId) return NextResponse.json({ error: 'Sign in required' }, { status: 401, headers })

    const { data: assurance, error: assuranceError } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel(token)
    if (assuranceError || !assurance) throw new Error('Account assurance unavailable')
    if (assurance.nextLevel === 'aal2' && assurance.currentLevel !== 'aal2') {
      return NextResponse.json({ error: 'Two-factor verification required', code: 'MFA_REQUIRED' }, { status: 403, headers })
    }
    if (!await ownOnboardingComplete(supabase)) {
      return NextResponse.json({ error: 'Finish your SlipSurge account setup', code: 'ONBOARDING_REQUIRED' }, { status: 403, headers })
    }
    return null
  } catch {
    return NextResponse.json({ error: 'Account verification temporarily unavailable' }, { status: 503, headers })
  }
}
