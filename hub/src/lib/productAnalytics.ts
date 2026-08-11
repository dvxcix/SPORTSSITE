import { track } from '@vercel/analytics'

type ProductEventValue = string | number | boolean | null

export function trackProductEvent(name: string, properties: Record<string, ProductEventValue> = {}) {
  try {
    track(name, properties)
  } catch {
    // Analytics must never interrupt the member action it records.
  }
}
