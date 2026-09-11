'use client'

import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { AuthStatus } from '@/components/auth/AuthShell'

function DesktopAuthCompleteInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [error, setError] = useState('')

  useEffect(() => {
    const tokenHash = searchParams.get('token_hash')
    const state = searchParams.get('state')
    const expectedState = localStorage.getItem('slipsurge_desktop_oauth_state')
    const rawNext = searchParams.get('next') || '/feed'
    const next = rawNext.startsWith('/') && !rawNext.startsWith('//') ? rawNext : '/feed'

    if (!tokenHash || !state || state !== expectedState) {
      window.queueMicrotask(() => setError('This desktop sign-in request is invalid or expired.'))
      return
    }

    localStorage.removeItem('slipsurge_desktop_oauth_state')
    createClient().auth.verifyOtp({ token_hash: tokenHash, type: 'magiclink' }).then(({ error }) => {
      if (error) {
        setError(error.message)
        return
      }
      router.replace(next)
      router.refresh()
    })
  }, [router, searchParams])

  return <AuthStatus error={error}>Finishing desktop sign-in…</AuthStatus>
}

export default function DesktopAuthCompletePage() {
  return <Suspense fallback={<AuthStatus>Loading…</AuthStatus>}><DesktopAuthCompleteInner /></Suspense>
}
