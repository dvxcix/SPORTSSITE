import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getDiscordConfig, getGuildChannels, postToChannelChecked } from '@/lib/discord'
import { safeApiError } from '@/lib/safeApiError'
import { createAdminClient } from '@/lib/supabase/admin'
import { consumeServerRateLimit } from '@/lib/serverRateLimit'

async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: NextResponse.json({ error: 'Not signed in' }, { status: 401 }) }
  const { data: profile } = await supabase.from('users').select('account_type').eq('id', user.id).single()
  if (profile?.account_type !== 'admin') return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  return { adminId: user.id }
}

const boundedString = (v: unknown, max: number): string | undefined => {
  if (typeof v !== 'string') return undefined
  const value = v.trim()
  return value && value.length <= max ? value : undefined
}

const httpsUrl = (v: unknown): string | undefined => {
  const value = boundedString(v, 2_048)
  if (!value) return undefined
  try {
    const parsed = new URL(value)
    return parsed.protocol === 'https:' ? parsed.toString() : undefined
  } catch {
    return undefined
  }
}

// One-off manual posts as the bot — a MEE6-style embed composer, not a
// configured/repeating alert type, so this builds and sends the embed
// directly rather than going through postAlert's discord_config.alert_channels
// lookup.
export async function POST(req: Request) {
  const { error, adminId } = await requireAdmin()
  if (error) return error

  const rateLimit = await consumeServerRateLimit(adminId!, 'admin_discord_compose', 60, 3600)
  if (!rateLimit.available) return NextResponse.json({ error: 'Posting is temporarily unavailable' }, { status: 503 })
  if (!rateLimit.allowed) return NextResponse.json({ error: 'Too many posts. Try again later.' }, { status: 429 })

  const body = await req.json().catch(() => null)
  const channelId = boundedString(body?.channelId, 32)
  if (!channelId || !/^\d{17,20}$/.test(channelId)) return NextResponse.json({ error: 'Choose a valid channel' }, { status: 400 })

  const admin = createAdminClient()
  const config = await getDiscordConfig(admin)
  if (!config?.enabled || !config.guild_id) return NextResponse.json({ error: 'Discord is not configured' }, { status: 409 })
  const allowedChannels = await getGuildChannels(config.guild_id)
  if (!allowedChannels.some(channel => channel.id === channelId)) {
    return NextResponse.json({ error: 'Choose a configured server channel' }, { status: 400 })
  }

  const content = boundedString(body?.content, 2_000)
  const title = boundedString(body?.title, 256)
  const description = boundedString(body?.description, 4_096)
  const authorName = boundedString(body?.authorName, 256)
  const authorIconUrl = httpsUrl(body?.authorIconUrl)
  const url = httpsUrl(body?.url)
  const thumbnailUrl = httpsUrl(body?.thumbnailUrl)
  const imageUrl = httpsUrl(body?.imageUrl)
  const footerText = boundedString(body?.footerText, 2_048)
  const footerIconUrl = httpsUrl(body?.footerIconUrl)
  const color = Number.isInteger(body?.color) && body.color >= 0 && body.color <= 0xFFFFFF ? body.color : undefined

  const invalidLength = [
    [body?.content, 2_000], [body?.title, 256], [body?.description, 4_096],
    [body?.authorName, 256], [body?.footerText, 2_048],
  ].some(([value, max]) => typeof value === 'string' && value.trim().length > Number(max))
  const invalidUrl = [body?.authorIconUrl, body?.url, body?.thumbnailUrl, body?.imageUrl, body?.footerIconUrl]
    .some(value => typeof value === 'string' && value.trim() && !httpsUrl(value))
  if (invalidLength || invalidUrl || (body?.color != null && color == null)) {
    return NextResponse.json({ error: 'One or more embed fields are invalid' }, { status: 400 })
  }

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

  try {
    const result = await postToChannelChecked(channelId, {
      ...(content ? { content } : {}),
      ...(embed ? { embeds: [embed] } : {}),
    })
    if (!result.ok) return NextResponse.json({ error: 'Discord post failed' }, { status: 502 })
    return NextResponse.json({ ok: true })
  } catch (cause) {
    return safeApiError('admin-discord-compose', cause, 'Discord post failed', 502)
  }
}
