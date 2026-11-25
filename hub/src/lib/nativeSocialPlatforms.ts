import { PROVIDER_BY_PLATFORM_KEY } from './verifiedIdentity'
import { publicVerifiedIdentities } from './publicVerifiedIdentities'

export const socialPlatformColumns = 'id,key,name,icon_url,url_template,sort_order'
export const socialPlatformKey = /^[a-z0-9_]{2,30}$/
export type NativeSocialPlatform = {
  id: string; key: string; name: string; icon_url: string; url_template: string | null; sort_order: number
}

export function nativeSocialURL(value: string): string | null {
  try {
    if (value.length > 2_048 || /[\u0000-\u001f\u007f\\]/.test(value)) return null
    const url = new URL(value)
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password ? url.href : null
  } catch { return null }
}

export function nativeSocialTemplate(template: string): boolean {
  if (!template) return true
  const first = nativeSocialURL(template.replaceAll('{handle}', 'example-profile-one'))
  const second = nativeSocialURL(template.replaceAll('{handle}', 'example-profile-two'))
  return Boolean(first && second && new URL(first).origin === new URL(second).origin)
}

export function nativePublicSocialLinks(platforms: NativeSocialPlatform[], value: unknown, verifiedValue: unknown) {
  const handles = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
  const verified = publicVerifiedIdentities(verifiedValue)
  return platforms.flatMap(platform => {
    const identity = Object.hasOwn(PROVIDER_BY_PLATFORM_KEY, platform.key) ? verified[PROVIDER_BY_PLATFORM_KEY[platform.key]] : undefined
    const handle = identity?.handle ?? (Object.hasOwn(handles, platform.key) ? handles[platform.key] : null)
    if (typeof handle !== 'string' || !handle.trim() || handle.length > 100 || /[\u0000-\u001f\u007f]/.test(handle)) return []
    const href = identity?.profileUrl ?? (platform.url_template && nativeSocialTemplate(platform.url_template)
      ? nativeSocialURL(platform.url_template.replace('{handle}', encodeURIComponent(handle.replace(/^@/, '')))) : null)
    return [{ id: platform.id, name: platform.name, handle, iconUrl: nativeSocialURL(platform.icon_url), href, verified: Boolean(identity) }]
  })
}
