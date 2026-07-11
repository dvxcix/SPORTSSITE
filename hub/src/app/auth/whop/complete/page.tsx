'use client'

import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

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

  useEffect(() => {
    const tokenHash = searchParams.get('token_hash')
    const next = searchParams.get('next') || '/feed'
    if (!tokenHash) { setError('Missing sign-in token.'); return }

    const supabase = createClient()
    supabase.auth.verifyOtp({ token_hash: tokenHash, type: 'magiclink' }).then(({ error }) => {
      if (error) { setError(error.message); return }
      router.push(next)
      router.refresh()
    })
  }, [searchParams, router])

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)' }}>
      {error ? (
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 13, color: 'var(--red)', marginBottom: 12 }}>{error}</div>
          <a href="/auth/login" style={{ fontSize: 13, color: 'var(--accent)', fontWeight: 700 }}>Back to login →</a>
        </div>
      ) : (
        <div style={{ fontSize: 13, color: 'var(--text-3)' }}>Signing you in…</div>
      )}
    </div>
  )
}

export default function WhopCompletePage() {
  return (
    <Suspense fallback={
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)' }}>
        <div style={{ fontSize: 13, color: 'var(--text-3)' }}>Loading…</div>
      </div>
    }>
      <WhopCompleteInner />
    </Suspense>
  )
}
