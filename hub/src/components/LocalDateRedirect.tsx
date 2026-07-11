'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

// Server components can only guess "today" using the SERVER's clock (UTC on
// Vercel), which is wrong for anyone not in UTC — e.g. an Eastern-time viewer
// gets bumped to tomorrow's date hours before their own midnight. This runs
// client-side instead, reads the viewer's own browser/OS timezone, and
// redirects to the date-scoped URL so every visitor lands on THEIR today.
export function LocalDateRedirect({ basePath }: { basePath: string }) {
  const router = useRouter()

  useEffect(() => {
    const localToday = new Date().toLocaleDateString('en-CA') // browser-local YYYY-MM-DD
    // Also stamp it in a cookie so the server can get the viewer's real local
    // date on later renders (e.g. the "today" highlight dot) without needing
    // another round-trip through this redirect every time.
    document.cookie = `local_date=${localToday}; path=/; max-age=21600`
    router.replace(`${basePath}?date=${localToday}`)
  }, [router, basePath])

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 280 }}>
      <div style={{ width: 30, height: 30, border: '3px solid var(--border)', borderTopColor: 'var(--accent)', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )
}
