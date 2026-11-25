'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

import { STANDARD_EMOJI_MAP } from './emojiCatalog'
export { EMOJI_CATEGORIES, STANDARD_EMOJI_MAP } from './emojiCatalog'

export type CustomEmoji = { code: string; image_url: string; category_id: string | null; category_name: string | null }

let customEmojiCache: CustomEmoji[] | null = null
let inflight: Promise<CustomEmoji[]> | null = null

async function fetchCustomEmojis(): Promise<CustomEmoji[]> {
  if (customEmojiCache) return customEmojiCache
  if (!inflight) {
    inflight = (async () => {
      const supabase = createClient()
      const { data } = await supabase
        .from('custom_emojis')
        .select('code, image_url, category_id, category:custom_emoji_categories(name)')
      customEmojiCache = (data ?? []).map((e: any) => ({
        code: e.code, image_url: e.image_url, category_id: e.category_id, category_name: e.category?.name ?? null,
      }))
      inflight = null
      return customEmojiCache
    })()
  }
  return inflight
}

// Groups custom emoji by category for the picker — MLB/NBA/etc. sections
// alongside the standard ones, not one flat "Custom" bucket. Uncategorized
// emoji (category_id null, e.g. one whose category got deleted) land in a
// trailing "Other" group rather than silently vanishing from the picker.
export function groupCustomEmojisByCategory(emojis: CustomEmoji[]): { label: string; emoji: CustomEmoji[] }[] {
  const byCategory = new Map<string, CustomEmoji[]>()
  for (const e of emojis) {
    const label = e.category_name ?? 'Other'
    if (!byCategory.has(label)) byCategory.set(label, [])
    byCategory.get(label)!.push(e)
  }
  const groups = Array.from(byCategory.entries()).map(([label, emoji]) => ({ label, emoji }))
  // "Other" always last regardless of alphabetical/insertion order.
  groups.sort((a, b) => (a.label === 'Other' ? 1 : b.label === 'Other' ? -1 : a.label.localeCompare(b.label)))
  return groups
}

// Module-level cache (not a Context) — every PostCardClient instance on a
// page would otherwise issue its own identical query. Custom emoji change
// rarely enough that a page-load-scoped cache is fine; call
// invalidateCustomEmojiCache() after an admin add/delete so the picker/
// admin page itself reflects the change without a full reload.
export function invalidateCustomEmojiCache() {
  customEmojiCache = null
}

export function useCustomEmojis(): CustomEmoji[] {
  const [emojis, setEmojis] = useState<CustomEmoji[]>(customEmojiCache ?? [])
  useEffect(() => {
    let cancelled = false
    fetchCustomEmojis().then(data => { if (!cancelled) setEmojis(data) })
    return () => { cancelled = true }
  }, [])
  return emojis
}

const SHORTCODE_RE = /:([a-z0-9_]{2,30}):/g

// Replaces every :code: in text with either a custom emoji's code (caller
// renders the image) or the standard unicode character. Returns an array of
// string | {code, image_url} segments for the caller to render — kept as
// data rather than JSX here so this stays framework-render-agnostic.
export function parseEmojiShortcodes(text: string, customEmojis: CustomEmoji[]): (string | CustomEmoji)[] {
  const customByCode = new Map(customEmojis.map(e => [e.code, e]))
  const parts: (string | CustomEmoji)[] = []
  let lastIndex = 0
  for (const m of text.matchAll(SHORTCODE_RE)) {
    const code = m[1]
    const custom = customByCode.get(code)
    const standard = STANDARD_EMOJI_MAP[code]
    if (!custom && !standard) continue // unknown shortcode — leave the literal :code: text alone
    parts.push(text.slice(lastIndex, m.index))
    parts.push(custom ?? standard!)
    lastIndex = m.index! + m[0].length
  }
  parts.push(text.slice(lastIndex))
  return parts
}
