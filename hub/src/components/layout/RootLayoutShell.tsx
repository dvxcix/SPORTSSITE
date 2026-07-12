'use client'

import { useState } from 'react'
import { usePathname } from 'next/navigation'
import { Sidebar } from './Sidebar'
import { TopBar } from './TopBar'

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

  return (
    <div className="flex min-h-screen">
      <Sidebar open={mobileNavOpen} onClose={() => setMobileNavOpen(false)} />
      <div className="flex-1 min-w-0 flex flex-col">
        <TopBar onMenuClick={() => setMobileNavOpen(v => !v)} />
        <main className="flex-1 min-w-0">
          {children}
        </main>
      </div>
    </div>
  )
}
