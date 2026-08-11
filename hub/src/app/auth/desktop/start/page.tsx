'use client'

import { Suspense, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

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
      if (error) setError(error.message)
    })
  }, [provider, requestError, searchParams, state])

  return <DesktopAuthStatus error={requestError || error} />
}

function DesktopAuthStatus({ error }: { error: string }) {
  return (
    <main style={{ minHeight: '100dvh', display: 'grid', placeItems: 'center', background: '#090b0f', color: '#f5f7fa' }}>
      <div style={{ textAlign: 'center', maxWidth: 420, padding: 32 }}>
        <img src="/logo.png" alt="SlipSurge" width={52} height={52} />
        <h1 style={{ margin: '18px 0 8px', fontSize: 22 }}>SlipSurge desktop sign-in</h1>
        <p style={{ color: error ? '#ff5f77' : '#9ca3af', lineHeight: 1.5 }}>
          {error || 'Opening your secure sign-in…'}
        </p>
      </div>
    </main>
  )
}

export default function DesktopAuthStartPage() {
  return <Suspense fallback={<DesktopAuthStatus error="" />}><DesktopAuthStartInner /></Suspense>
}
