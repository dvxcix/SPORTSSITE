'use client'

import { Suspense, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { AuthStatus } from '@/components/auth/AuthShell'

function DesktopAuthStartInner() {
  const searchParams = useSearchParams()
  const [error, setError] = useState('')
  const provider = searchParams.get('provider')
  const state = searchParams.get('state')
  const requestError = !state || !/^[0-9a-f-]{36}$/i.test(state)
    ? 'Invalid desktop sign-in request.'
    : provider !== 'whop' && provider !== 'discord' && provider !== 'x'
      ? 'Unsupported sign-in provider.'
      : ''

  useEffect(() => {
    const rawNext = searchParams.get('next') || '/feed'
    const next = rawNext.startsWith('/') && !rawNext.startsWith('//') ? rawNext : '/feed'

    if (requestError || !state) return

    if (provider === 'whop') {
      location.replace(`/auth/whop/login?next=${encodeURIComponent(next)}&desktop_state=${encodeURIComponent(state)}`)
      return
    }

    if (provider !== 'discord' && provider !== 'x') return

    const callback = new URL('/auth/callback', location.origin)
    callback.searchParams.set('next', next)
    callback.searchParams.set('desktop_state', state)

    createClient().auth.signInWithOAuth({
      provider,
      options: { redirectTo: callback.toString() },
    }).then(({ error }) => {
      if (error) setError('Desktop sign-in could not be started. Return to the app and try again.')
    }).catch(() => setError('Desktop sign-in could not be started. Return to the app and try again.'))
  }, [provider, requestError, searchParams, state])

  return <DesktopAuthStatus error={requestError || error} />
}

function DesktopAuthStatus({ error }: { error: string }) {
  return <AuthStatus error={error}>Opening secure sign-in…</AuthStatus>
}

export default function DesktopAuthStartPage() {
  return <Suspense fallback={<DesktopAuthStatus error="" />}><DesktopAuthStartInner /></Suspense>
}
