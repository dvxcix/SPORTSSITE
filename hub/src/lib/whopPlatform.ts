import 'server-only'
import Whop from '@whop/sdk'
export { PLATFORM_URL } from '@/lib/platform'

export function getWhopPlatform() {
  const apiKey = process.env.WHOP_PLATFORM_API_KEY || process.env.WHOP_API_KEY
  if (!apiKey) throw new Error('WHOP_PLATFORM_API_KEY is not configured')
  return new Whop({ apiKey })
}

export function getWhopPlatformCompanyId() {
  const id = process.env.WHOP_PLATFORM_COMPANY_ID || process.env.WHOP_COMPANY_ID
  if (!id) throw new Error('WHOP_PLATFORM_COMPANY_ID is not configured')
  return id
}

export function creatorFee(price: number, percentage: number) {
  return Math.max(0.01, Math.min(price - 0.01, Math.round(price * percentage) / 100))
}

