import { WeatherLabClient } from '@/components/weather/WeatherLabClient'
import { TierGate } from '@/components/layout/TierGate'
import { CloudSun } from 'lucide-react'
import { ProductHero, ProductPageShell } from '@/components/product/ProductPage'

export default function WeatherLabPage() {
  return (
    <TierGate requiredTier="basic" label="Weather Lab">
      <ProductPageShell>
        <ProductHero icon={<CloudSun size={23} />} eyebrow="Ballpark conditions" title="Weather Lab" description="Compare live wind, temperature, humidity, and roof conditions across every game on the slate." status="Live conditions" />
        <WeatherLabClient />
      </ProductPageShell>
    </TierGate>
  )
}
