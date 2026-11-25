import 'server-only'

const mediaName = /^[0-9a-f-]{36}\.(jpg|png|webp|gif|avif)$/

export function isOwnedNativeMedia(value: unknown, userId: string, kind: 'avatars' | 'banners' | 'posts' | 'messages'): value is string {
  if (typeof value !== 'string' || value.length > 2048) return false
  try {
    const url = new URL(value)
    const storage = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!)
    const path = `/storage/v1/object/public/media/${kind}/${userId}/`
    return url.protocol === 'https:' && url.origin === storage.origin && !url.username && !url.password &&
      !url.search && !url.hash && url.pathname.startsWith(path) && mediaName.test(url.pathname.slice(path.length))
  } catch { return false }
}
