'use client'

import Link from 'next/link'
import type { ReactNode } from 'react'
import { trackProductEvent } from '@/lib/productAnalytics'

/** Keep browsing usable without JavaScript; analytics never controls navigation. */
export function DiscoveryLink({ href, destination, children, className, ariaLabel }: {
  href: string
  destination: string
  children: ReactNode
  className?: string
  ariaLabel?: string
}) {
  return <Link href={href} prefetch={false} className={className} aria-label={ariaLabel}
    onClick={() => trackProductEvent('public_discovery_opened', { destination, source: 'homepage' })}>
    {children}
  </Link>
}
