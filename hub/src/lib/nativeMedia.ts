import 'server-only'

const mediaName = /^[0-9a-f-]{36}\.(jpg|png|webp|gif|avif)$/

export function isOwnedNativeMedia(value: unknown, userId: string,
  kind: 'avatars' | 'banners' | 'posts' | 'messages' | 'stories' | 'emojis' | 'badges' | 'badge-cards'): value is string {
  if (typeof value !== 'string' || value.length > 2048) return false
  try {
    const url = new URL(value)
    const storage = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!)
    const path = `/storage/v1/object/public/media/${kind}/${userId}/`
    return url.protocol === 'https:' && url.origin === storage.origin && !url.username && !url.password &&
      !url.search && !url.hash && url.pathname.startsWith(path) && mediaName.test(url.pathname.slice(path.length))
  } catch { return false }
}

export function isNativeSocialGif(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 2048) return false
  try {
    const url = new URL(value)
    const supportedHost = ['media.tenor.com', 'c.tenor.com', 'i.giphy.com'].includes(url.hostname) || /^media[0-9]?\.giphy\.com$/.test(url.hostname)
    return supportedHost && url.protocol === 'https:' && !url.username && !url.password && !url.port && !url.hash && /\.gif$/i.test(url.pathname)
  } catch { return false }
}
