import type { SupabaseClient } from '@supabase/supabase-js'

export async function nativeChatReaction(client: SupabaseClient, value: string, enabled: boolean) {
  const cleaned = value.trim()
  if (!cleaned || cleaned.length > 64) return { status: 400 } as const
  const custom = /^:([a-z0-9_]{2,30}):$/.exec(cleaned)
  if (!custom) return [...cleaned].length <= 16 ? { emoji: cleaned } : { status: 400 } as const
  if (enabled) {
    const result = await client.from('custom_emojis').select('code').eq('code', custom[1]).maybeSingle()
    if (result.error) return { status: 503 } as const
    if (!result.data) return { status: 400 } as const
  }
  return { emoji: cleaned }
}
