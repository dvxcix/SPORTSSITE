import { Suspense } from 'react'
import { PitcherReportClient } from '@/components/pitcher-report/PitcherReportClient'

export default function PitcherReportPage() {
  return (
    <Suspense fallback={null}>
      <PitcherReportClient />
    </Suspense>
  )
}
