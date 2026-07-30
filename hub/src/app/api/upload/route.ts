import { NextResponse } from 'next/server'
import sharp from 'sharp'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

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
async function normalizeImage(file: File): Promise<{ buffer: Buffer; contentType: string; ext: string } | null> {
  const input = Buffer.from(await file.arrayBuffer())
  let img: sharp.Sharp
  let meta: sharp.Metadata
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
  'avatars', 'banners', 'posts', 'stories', 'emojis', 'badges', 'badge-cards', 'social-platforms', 'changelog',
])

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

  let body: File | Buffer = file
  let contentType: string | undefined
  let fileName = file.name
  if (kind === 'avatars' || kind === 'banners') {
    const normalized = await normalizeImage(file)
    if (normalized) {
      body = normalized.buffer
      contentType = normalized.contentType
      fileName = fileName.replace(/\.[^.]+$/, '') + `.${normalized.ext}`
    }
  }

  // Path is built server-side from the verified session's user id, never
  // from anything the client sends — same own-folder guarantee the old
  // client-side RLS policy enforced, just applied here instead.
  const path = `${kind}/${user.id}/${Date.now()}-${fileName}`
  const admin = createAdminClient()
  const { error } = await admin.storage.from('media').upload(path, body, { upsert: true, ...(contentType ? { contentType } : {}) })
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  const { data: { publicUrl } } = admin.storage.from('media').getPublicUrl(path)
  return NextResponse.json({ publicUrl })
}
