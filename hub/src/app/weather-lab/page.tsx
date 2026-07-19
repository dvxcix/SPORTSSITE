import { WeatherLabClient } from '@/components/weather/WeatherLabClient'
import { TierGate } from '@/components/layout/TierGate'

export default function WeatherLabPage() {
  return (
    <TierGate requiredTier="basic" label="Weather Lab">
      <WeatherLabClient />
    </TierGate>
  )
}
