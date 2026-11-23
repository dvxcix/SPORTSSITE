'use client'

import { Suspense, useState } from 'react'
import dynamic from 'next/dynamic'
import { usePathname } from 'next/navigation'
import { Sidebar } from './Sidebar'
import { TopBar } from './TopBar'
import { WatchlistProvider } from '@/context/WatchlistContext'
import { DesktopCommandBar } from './DesktopCommandBar'
import { useDesktopPlatform } from '@/lib/useDesktopPlatform'
import { NetworkStatus } from './NetworkStatus'
import { UtilityDock } from './UtilityDock'
import { MobileDock } from './MobileDock'
import { MfaGate } from '@/components/security/MfaGate'
import { ContextHandoff } from './ContextHandoff'
import { ProductTelemetry } from './ProductTelemetry'
import { isPublicPreviewPath } from '@/lib/publicResearchPreview'
import { getProductArea } from './navigationConfig'
import { CreatorMarketShell, CreatorWorkspaceShell } from '@/components/creator/CreatorWorkspaceShell'
import { useMobileViewport } from './useMobileViewport'
import { useAuth } from '@/context/AuthContext'
import { usesVisitorBrowseFrame } from '@/lib/publicBrowsePolicy'
import { VisitorBrowseShell } from './VisitorBrowseShell'

const WatchlistButton=dynamic(()=>import('@/components/dugout/WatchlistPanel').then(module=>module.WatchlistButton),{ssr:false})
const MyPicksButton=dynamic(()=>import('@/components/dugout/MyPicksPanel').then(module=>module.MyPicksButton),{ssr:false})
const MatrixButton=dynamic(()=>import('@/components/dugout/CustomMatrixPanel').then(module=>module.MatrixButton),{ssr:false})
const NflMatrixButton=dynamic(()=>import('@/components/sideline/NflMatrixButton').then(module=>module.NflMatrixButton),{ssr:false})
const DesktopExperience=dynamic(()=>import('@/components/desktop/DesktopExperience').then(module=>module.DesktopExperience),{ssr:false})
const DesktopNavigation=dynamic(()=>import('@/components/desktop/DesktopNavigation').then(module=>module.DesktopNavigation),{ssr:false})
const GlobalCommandPalette=dynamic(()=>import('./GlobalCommandPalette').then(module=>module.GlobalCommandPalette),{ssr:false})

export function RootLayoutShell({ children }: { children: React.ReactNode }) {
  // Keep context stable across streamed route changes, including transitions
  // from the admin panel. Sideline market cells consume this on first render.
  return <WatchlistProvider><RootLayoutShellContent>{children}</RootLayoutShellContent></WatchlistProvider>
}

function RootLayoutShellContent({ children }: { children: React.ReactNode }) {
  useMobileViewport()
  const path = usePathname()
  const isAdmin = path.startsWith('/admin')
  const isAuthPage = path.startsWith('/auth/') || path === '/onboarding'
  const isLandingPage = path === '/'
  const productArea = getProductArea(path)
  // Sidebar is a fixed-width column on desktop but an off-canvas drawer
  // below the md breakpoint — this is the shared toggle both the topbar's
  // hamburger button and the sidebar's own backdrop/close button drive.
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const isDesktop = useDesktopPlatform()
  const { user, loading, authUnavailable } = useAuth()

  if (isAdmin) {
    // Admin pages render their own full layout via admin/layout.tsx
    return <><NetworkStatus /><ProductTelemetry />{children}</>
  }

  if (path === '/creators/studio' || path === '/creators/payouts') {
    return <><MfaGate/><NetworkStatus/><ProductTelemetry/><CreatorWorkspaceShell>{children}</CreatorWorkspaceShell><div hidden inert><MyPicksButton/><WatchlistButton/></div><UtilityDock teaserOnly/></>
  }
  if (path === '/creators' || path.startsWith('/creators/offers/') || path.startsWith('/creators/access/') || /^\/creators\/[^/]+$/.test(path)) {
    return <><MfaGate/><NetworkStatus/><ProductTelemetry/><CreatorMarketShell>{children}</CreatorMarketShell><div hidden inert><MyPicksButton/><WatchlistButton/></div><UtilityDock teaserOnly/></>
  }

  if (isLandingPage || isPublicPreviewPath(path)) {
    return <><NetworkStatus/><ProductTelemetry/>{children}<UtilityDock teaserOnly/></>
  }

  if (isAuthPage || process.env.NEXT_PUBLIC_DESIGN_REVIEW === '1' && path === '/design-review/full-audit') {
    return <><NetworkStatus /><ProductTelemetry /><main id="main-content">{children}</main>{(isLandingPage || isPublicPreviewPath(path)) && <UtilityDock teaserOnly />}</>
  }

  if (usesVisitorBrowseFrame(path) && !loading && !authUnavailable && !user) {
    return <><NetworkStatus/><ProductTelemetry/><VisitorBrowseShell pathname={path}>{children}</VisitorBrowseShell><UtilityDock teaserOnly/></>
  }

  // Single drawer hosts stay mounted here; headers and the account menu open
  // them. VOLT is the only floating launcher on every route.
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
  // entirely) sidesteps. Gated on path rather than self-hiding —
  // RootLayoutShell already computes `path`.
  //
  // Daily Recap reuses Dugout's own buildBatterRow/matrix_matches pipeline
  // wholesale (DailyRecapTable in DugoutClient.tsx), so a member's Matrices
  // already highlight there with zero extra wiring — the same saved
  // Matrices apply on both pages since they're a per-account resource, not
  // page-scoped. This just makes the same create/edit panel reachable from
  // both places too, instead of only the one it happened to be built on.
  const showMatrixButton = path === '/dugout' || path === '/daily-recap'
  const showNflMatrixButton = path === '/the-sideline'

  return (
    <>
      <MfaGate />
      <GlobalCommandPalette />
      <a className="ss-skip-link" href="#main-content">Skip to content</a>
      <NetworkStatus />
      <ProductTelemetry />
      <Suspense fallback={null}><ContextHandoff /></Suspense>
      <div className={`flex min-h-dvh ss-site-shell ${isDesktop ? 'ss-desktop-shell' : ''}`} data-product-area={productArea}>
        {isDesktop
          ? <Suspense fallback={null}><DesktopNavigation /></Suspense>
          : <Suspense fallback={null}><Sidebar open={mobileNavOpen} onClose={() => setMobileNavOpen(false)} /></Suspense>}
        <div className="flex-1 min-w-0 flex flex-col">
          {isDesktop && <Suspense fallback={null}><DesktopCommandBar /></Suspense>}
          {!isDesktop && <TopBar onMenuClick={() => setMobileNavOpen(v => !v)} />}
          <main id="main-content" tabIndex={-1} className="flex-1 min-w-0 ss-site-main">
            {children}
          </main>
        </div>
      </div>
      {!isDesktop && <MobileDock hidden={mobileNavOpen} onMenuClick={() => setMobileNavOpen(true)} />}
      <UtilityDock>
        {showMatrixButton && <MatrixButton />}
        {showNflMatrixButton && <NflMatrixButton />}
        <MyPicksButton />
        <WatchlistButton />
      </UtilityDock>
      {isDesktop && <DesktopExperience />}
    </>
  )
}
