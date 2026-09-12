'use client'

import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { safeInternalPath } from '@/lib/safeRedirect'
import { AuthStatus } from '@/components/auth/AuthShell'

// The actual "log the user in" step. The callback route (server-side)
// verified Whop, checked access, and provisioned/found the matching
// Supabase auth user, but only the BROWSER's own Supabase client can turn a
// token_hash into real, cookie-backed session state that the middleware
// will accept — that's what verifyOtp does here, same mechanism Supabase's
// own magic-link email flow uses.
function WhopCompleteInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [error, setError] = useState('')
  const tokenHash = searchParams.get('token_hash')
  const requestError = tokenHash ? '' : 'Missing sign-in token.'

  useEffect(() => {
    const next = safeInternalPath(searchParams.get('next'))
    if (!tokenHash) return

    const supabase = createClient()
    supabase.auth.verifyOtp({ token_hash: tokenHash, type: 'magiclink' }).then(({ error }) => {
      if (error) { setError('Sign-in could not be completed. Please try again.'); return }
      router.push(next)
      router.refresh()
    }).catch(() => setError('Sign-in could not be completed. Please try again.'))
  }, [searchParams, router, tokenHash])

  return <AuthStatus error={requestError || error}>Signing you in…</AuthStatus>
}

export default function WhopCompletePage() {
  return (
    <Suspense fallback={<AuthStatus>Loading…</AuthStatus>}>
      <WhopCompleteInner />
    </Suspense>
  )
}
