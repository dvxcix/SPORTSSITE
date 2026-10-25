import { getEffectiveTier } from '@/lib/requireTier'
import { loadDugoutData } from '@/lib/dugoutData'

export const revalidate = 0
export const maxDuration = 60

export async function GET(req: Request) {
  const gate = await getEffectiveTier()
  if (gate.error) return gate.error
  return loadDugoutData(req, { tier: gate.tier!, userId: gate.userId })
}
