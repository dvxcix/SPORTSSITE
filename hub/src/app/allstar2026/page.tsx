import { Suspense } from 'react'
import type { Metadata } from 'next'
import { AllStarClient } from '@/components/allstar/AllStarClient'

export const revalidate = 0

// Deliberately not linked from Sidebar nav yet — internal-only until the
// page is finished/approved, then it gets a real nav entry.
export const metadata: Metadata = {
  title: '2026 MLB All-Star Game — SlipSurge',
  description: 'Real bat-tracking Statcast splits and FanDuel markets for tonight\'s AL vs NL All-Star Game.',
}

export default function AllStar2026Page() {
  return (
    <Suspense fallback={null}>
      <AllStarClient />
    </Suspense>
  )
}
