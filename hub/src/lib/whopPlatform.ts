import 'server-only'
import Whop from '@whop/sdk'
import { WHOP_API_URL, WHOP_SDK_API_VERSION } from './whopApi'
export { PLATFORM_URL } from '@/lib/platform'

export function getWhopPlatform() {
  const apiKey = process.env.WHOP_PLATFORM_API_KEY || process.env.WHOP_API_KEY
  if (!apiKey) throw new Error('WHOP_PLATFORM_API_KEY is not configured')
  return new Whop({ apiKey, baseURL: WHOP_API_URL, version: WHOP_SDK_API_VERSION })
}

export function getWhopPlatformCompanyId() {
  const id = process.env.WHOP_PLATFORM_COMPANY_ID || process.env.WHOP_COMPANY_ID
  if (!id) throw new Error('WHOP_PLATFORM_COMPANY_ID is not configured')
  if (/^biz_[A-Za-z0-9]+$/.test(id)) return id
  // The legacy environment stores the company suffix. Current account APIs return the full ID.
  if (!process.env.WHOP_PLATFORM_COMPANY_ID && /^[A-Za-z0-9]+$/.test(id)) return 'biz_' + id
  throw new Error('WHOP_PLATFORM_COMPANY_ID is invalid')
}

export function whopPlatformConfiguration() {
  let companyConfigured = false
  try { companyConfigured = !!getWhopPlatformCompanyId() } catch { /* Invalid and missing IDs are both unconfigured. */ }
  return { apiConfigured: !!(process.env.WHOP_PLATFORM_API_KEY || process.env.WHOP_API_KEY), companyConfigured }
}

