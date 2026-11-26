'use client'

import { useWatchlist } from '@/context/WatchlistContext'

/** Mount the signed-in panels that open from the header and account menu. */
export function UtilityDock({ children }: { children?: React.ReactNode }) {
  const { signedIn } = useWatchlist()
  return signedIn ? <div className="ss-utility-dock-items" hidden inert aria-hidden="true">{children}</div> : null
}
