// Pin the current REST contract independently of provider defaults.
export const WHOP_API_URL = 'https://api.whop.com/api/v1'
export const WHOP_API_VERSION = '2026-11-17-3'
// The installed creator SDK uses this supported v1 response contract.
export const WHOP_SDK_API_VERSION = '2026-07-20'
export function whopApiHeaders(apiKey: string, version = WHOP_API_VERSION) {
  return { Authorization: `Bearer ${apiKey}`, 'Api-Version-Date': version }
}
