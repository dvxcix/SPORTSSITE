import { Suspense } from 'react'
import { SearchClient } from '@/components/search/SearchClient'
import { TierGate } from '@/components/layout/TierGate'

export default function SearchPage() {
  return (
    <TierGate requiredTier="basic" label="Search">
      <Suspense fallback={null}>
        <SearchClient />
      </Suspense>
    </TierGate>
  )
}
