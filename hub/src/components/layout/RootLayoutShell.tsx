'use client'

import { usePathname } from 'next/navigation'
import { Sidebar } from './Sidebar'
import { TopBar } from './TopBar'

export function RootLayoutShell({ children }: { children: React.ReactNode }) {
  const path = usePathname()
  const isAdmin = path.startsWith('/admin')
  const isAuthPage = path.startsWith('/auth/')
  const isLandingPage = path === '/'

  if (isAdmin) {
    // Admin pages render their own full layout via admin/layout.tsx
    return <>{children}</>
  }

  if (isAuthPage || isLandingPage) {
    return <>{children}</>
  }

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex-1 min-w-0 flex flex-col">
        <TopBar />
        <main className="flex-1 min-w-0">
          {children}
        </main>
      </div>
    </div>
  )
}
