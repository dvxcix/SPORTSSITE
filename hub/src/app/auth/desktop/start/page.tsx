'use client'

import { Suspense, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

function DesktopAuthStartInner() {
  const searchParams = useSearchParams()
  const [error, setError] = useState('')

  useEffect(() => {
    const provider = searchParams.get('provider')
    const state = searchParams.get('state')
    const rawNext = searchParams.get('next') || '/feed'
    const next = rawNext.startsWith('/') && !rawNext.startsWith('//') ? rawNext : '/feed'

    if (!state || !/^[0-9a-f-]{36}$/i.test(state)) {
      setError('Invalid desktop sign-in request.')
      return
    }

    if (provider === 'whop') {
      location.replace(`/auth/whop/login?next=${encodeURIComponent(next)}&desktop_state=${encodeURIComponent(state)}`)
      return
    }

    if (provider !== 'discord' && provider !== 'x') {
      setError('Unsupported sign-in provider.')
      return
    }

    const callback = new URL('/auth/callback', location.origin)
    callback.searchParams.set('next', next)
    callback.searchParams.set('desktop_state', state)

    createClient().auth.signInWithOAuth({
      provider,
      options: { redirectTo: callback.toString() },
    }).then(({ error }) => {
      if (error) setError(error.message)
    })
  }, [searchParams])

  return <DesktopAuthStatus error={error} />
}

function DesktopAuthStatus({ error }: { error: string }) {
  return (
    <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#090b0f', color: '#f5f7fa' }}>
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
