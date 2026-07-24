'use client'

import { useState } from 'react'
import { usePathname } from 'next/navigation'
import { Sidebar } from './Sidebar'
import { TopBar } from './TopBar'
import { WatchlistProvider } from '@/context/WatchlistContext'
import { WatchlistButton } from '@/components/dugout/WatchlistPanel'
import { MyPicksButton } from '@/components/dugout/MyPicksPanel'
import { MatrixButton } from '@/components/dugout/CustomMatrixPanel'

export function RootLayoutShell({ children }: { children: React.ReactNode }) {
  const path = usePathname()
  const isAdmin = path.startsWith('/admin')
  const isAuthPage = path.startsWith('/auth/')
  const isLandingPage = path === '/'
  // Sidebar is a fixed-width column on desktop but an off-canvas drawer
  // below the md breakpoint — this is the shared toggle both the topbar's
  // hamburger button and the sidebar's own backdrop/close button drive.
  const [mobileNavOpen, setMobileNavOpen] = useState(false)

  if (isAdmin) {
    // Admin pages render their own full layout via admin/layout.tsx
    return <>{children}</>
  }

  if (isAuthPage || isLandingPage) {
    return <>{children}</>
  }

  // WatchlistProvider (and its two FABs) used to live inside dugout/page.tsx
  // only, so the watchlist/picks were invisible everywhere else — moved up
  // here so a signed-in user can see and manage them from any page, not just
  // while actually on the Dugout. WatchlistButton/MyPicksButton both
  // self-hide (`if (!wl.signedIn) return null`) so nothing renders for a
  // signed-out visitor.
  //
  // MatrixButton was first mounted deep inside DugoutClient's own render
  // tree and never actually appeared — some ancestor in that ~2,600-line
  // component almost certainly establishes a CSS containing block (a
  // transform/filter) that traps a `position: fixed` descendant inside its
  // own box instead of the real viewport, the exact trap this top-level
  // spot (proven by the two buttons above, which sit outside <main>
  // entirely) sidesteps. Custom Matrix is Dugout-only, so it's gated on
  // path rather than self-hiding — RootLayoutShell already computes `path`.
  const isDugout = path === '/dugout'

  return (
    <WatchlistProvider>
      <div className="flex min-h-screen">
        <Sidebar open={mobileNavOpen} onClose={() => setMobileNavOpen(false)} />
        <div className="flex-1 min-w-0 flex flex-col">
          <TopBar onMenuClick={() => setMobileNavOpen(v => !v)} />
          <main className="flex-1 min-w-0">
            {children}
          </main>
        </div>
      </div>
      <WatchlistButton />
      <MyPicksButton />
      {isDugout && <MatrixButton />}
    </WatchlistProvider>
  )
}
