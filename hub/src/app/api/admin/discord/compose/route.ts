import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { postToChannelChecked } from '@/lib/discord'

async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: NextResponse.json({ error: 'Not signed in' }, { status: 401 }) }
  const { data: profile } = await supabase.from('users').select('account_type').eq('id', user.id).single()
  if (profile?.account_type !== 'admin') return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  return {}
}

const s = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() ? v.trim() : undefined)

// One-off manual posts as the bot — a MEE6-style embed composer, not a
// configured/repeating alert type, so this builds and sends the embed
// directly rather than going through postAlert's discord_config.alert_channels
// lookup.
export async function POST(req: Request) {
  const { error } = await requireAdmin()
  if (error) return error

  const body = await req.json().catch(() => null)
  const channelId = s(body?.channelId)
  if (!channelId) return NextResponse.json({ error: 'Choose a channel' }, { status: 400 })

  const content = s(body?.content)
  const title = s(body?.title)
  const description = s(body?.description)
  const authorName = s(body?.authorName)
  const authorIconUrl = s(body?.authorIconUrl)
  const url = s(body?.url)
  const thumbnailUrl = s(body?.thumbnailUrl)
  const imageUrl = s(body?.imageUrl)
  const footerText = s(body?.footerText)
  const footerIconUrl = s(body?.footerIconUrl)
  const color = typeof body?.color === 'number' ? body.color : undefined

  const hasEmbedContent = title || description || authorName || imageUrl || thumbnailUrl || footerText
  if (!content && !hasEmbedContent) return NextResponse.json({ error: 'Add a message or fill in the embed' }, { status: 400 })

  const embed = hasEmbedContent ? {
    ...(title ? { title } : {}),
    ...(description ? { description } : {}),
    ...(url ? { url } : {}),
    ...(color != null ? { color } : {}),
    ...(authorName ? { author: { name: authorName, ...(authorIconUrl ? { icon_url: authorIconUrl } : {}) } } : {}),
    ...(thumbnailUrl ? { thumbnail: { url: thumbnailUrl } } : {}),
    ...(imageUrl ? { image: { url: imageUrl } } : {}),
    ...(footerText ? { footer: { text: footerText, ...(footerIconUrl ? { icon_url: footerIconUrl } : {}) } } : {}),
  } : null

  const result = await postToChannelChecked(channelId, {
    ...(content ? { content } : {}),
    ...(embed ? { embeds: [embed] } : {}),
  })
  if (!result.ok) return NextResponse.json({ error: result.error || 'Discord post failed' }, { status: 502 })
  return NextResponse.json({ ok: true })
}
