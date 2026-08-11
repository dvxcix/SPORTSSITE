import { NextResponse } from 'next/server'
import sharp from 'sharp'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { consumeServerRateLimit } from '@/lib/serverRateLimit'
import { safeApiError } from '@/lib/safeApiError'

export const dynamic = 'force-dynamic'

// Real incident: a WebP avatar crashed /api/share-image entirely (satori
// can't decode WebP), and there's no reason to assume that's the only
// WebP-hostile consumer an avatar/banner ever reaches. Normalizing to a
// universally-supported format once, here, at upload time, fixes it for
// every current and future consumer instead of adding a format guard to
// each one individually. Scoped to avatars/banners only — post/story media
// isn't rendered through anything with this limitation, and forcing those
// through the same re-encode would cost real fidelity/file-size for no
// benefit. Left untouched if animated (real animated avatars/banners are a
// legitimate, already-working use of a plain <img> tag elsewhere on the
// site; share-image never renders those anyway, animated or not).
async function normalizeImage(input: Buffer): Promise<{ buffer: Buffer; contentType: string; ext: string } | null> {
  let img: ReturnType<typeof sharp>
  let meta: Awaited<ReturnType<ReturnType<typeof sharp>['metadata']>>
  try {
    img = sharp(input, { animated: true })
    meta = await img.metadata()
  } catch {
    return null // Not an image sharp can parse — let the caller fall back to the raw upload.
  }
  if ((meta.pages ?? 1) > 1) return null // Animated — leave it exactly as uploaded.

  if (meta.hasAlpha) {
    return { buffer: await img.png().toBuffer(), contentType: 'image/png', ext: 'png' }
  }
  return { buffer: await img.jpeg({ quality: 88 }).toBuffer(), contentType: 'image/jpeg', ext: 'jpg' }
}

// Supabase Storage is currently rejecting valid, freshly-authenticated
// browser sessions at the RLS layer (confirmed: PostgREST writes from the
// same session succeed at the same moment Storage writes fail with "new row
// violates row-level security policy") — a platform-side JWT verification
// issue on Storage's end, not anything wrong with our policies or sessions.
// Proxying the actual bytes through this route sidesteps it: the caller is
// verified here (the same session-reading path PostgREST already trusts),
// then the write happens with the service role, bypassing Storage's own
// broken RLS check entirely.
const ALLOWED_KINDS = new Set([
  'avatars', 'banners', 'posts', 'stories', 'emojis', 'badges', 'badge-cards', 'social-platforms', 'changelog', 'discord-embeds',
])
const ADMIN_KINDS = new Set(['emojis', 'badges', 'badge-cards', 'social-platforms', 'changelog', 'discord-embeds'])
const MIME_EXTENSIONS = new Map([
  ['image/jpeg', 'jpg'],
  ['image/png', 'png'],
  ['image/webp', 'webp'],
  ['image/gif', 'gif'],
  ['image/avif', 'avif'],
])
const USER_MAX_BYTES = 8 * 1024 * 1024
const ADMIN_MAX_BYTES = 15 * 1024 * 1024

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'You must be signed in to upload.' }, { status: 401 })

  const form = await req.formData()
  const file = form.get('file')
  const kind = form.get('kind')
  if (!(file instanceof File) || typeof kind !== 'string' || !ALLOWED_KINDS.has(kind)) {
    return NextResponse.json({ error: 'Invalid upload request.' }, { status: 400 })
  }

  const admin = createAdminClient()
  const isAdminKind = ADMIN_KINDS.has(kind)
  if (isAdminKind) {
    const { data: profile } = await admin.from('users').select('account_type').eq('id', user.id).maybeSingle()
    if (profile?.account_type !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const extension = MIME_EXTENSIONS.get(file.type)
  const maxBytes = isAdminKind ? ADMIN_MAX_BYTES : USER_MAX_BYTES
  if (!extension || file.size < 1 || file.size > maxBytes) {
    return NextResponse.json({ error: `Upload a supported image under ${Math.floor(maxBytes / 1024 / 1024)} MB.` }, { status: 400 })
  }

  const rate = await consumeServerRateLimit(user.id, 'media_upload', isAdminKind ? 120 : 30, 60 * 60)
  if (!rate.available) return NextResponse.json({ error: 'Uploads are temporarily unavailable.' }, { status: 503 })
  if (!rate.allowed) return NextResponse.json({ error: 'Upload limit reached. Try again later.' }, { status: 429 })

  const input = Buffer.from(await file.arrayBuffer())
  try {
    const metadata = await sharp(input, { animated: true }).metadata()
    if (!metadata.width || !metadata.height || metadata.width > 12_000 || metadata.height > 12_000) {
      return NextResponse.json({ error: 'Image dimensions are not supported.' }, { status: 400 })
    }
  } catch {
    return NextResponse.json({ error: 'The selected file is not a valid image.' }, { status: 400 })
  }

  let body: Buffer = input
  let contentType = file.type
  let outputExtension = extension
  if (kind === 'avatars' || kind === 'banners') {
    const normalized = await normalizeImage(input)
    if (normalized) {
      body = normalized.buffer
      contentType = normalized.contentType
      outputExtension = normalized.ext
    }
  }

  // Path is built server-side from the verified session's user id, never
  // from anything the client sends — same own-folder guarantee the old
  // client-side RLS policy enforced, just applied here instead.
  const path = `${kind}/${user.id}/${crypto.randomUUID()}.${outputExtension}`
  const { error } = await admin.storage.from('media').upload(path, body, { upsert: false, contentType })
  if (error) return safeApiError('upload', error, 'Upload failed. Please try again.')

  const { data: { publicUrl } } = admin.storage.from('media').getPublicUrl(path)
  return NextResponse.json({ publicUrl }, { headers: { 'Cache-Control': 'private, no-store' } })
}
