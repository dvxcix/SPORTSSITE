'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

// Curated set, not a full unicode/CLDR dataset — no emoji npm dependency
// existed anywhere in this codebase before, and pulling in a ~3000-entry
// package for a sports-betting social app is more than this needs. Picked
// for what actually gets used here: reactions, sports, money/betting,
// common faces/gestures. Shortcodes follow the Slack/Discord/GitHub
// convention (:fire:, :joy:, :100:) since that's what most users already
// know by muscle memory.
export const EMOJI_CATEGORIES: { label: string; emoji: { code: string; char: string }[] }[] = [
  {
    label: 'Reactions',
    emoji: [
      { code: 'fire', char: '🔥' }, { code: 'joy', char: '😂' }, { code: 'heart', char: '❤️' },
      { code: '100', char: '💯' }, { code: 'eyes', char: '👀' }, { code: 'clap', char: '👏' },
      { code: 'skull', char: '💀' }, { code: 'scream', char: '😱' }, { code: 'sob', char: '😭' },
      { code: 'thinking', char: '🤔' }, { code: 'salute', char: '🫡' }, { code: 'mindblown', char: '🤯' },
      { code: 'cry_laugh', char: '🤣' }, { code: 'smirk', char: '😏' }, { code: 'sweat', char: '😅' },
    ],
  },
  {
    label: 'Hands',
    emoji: [
      { code: 'thumbsup', char: '👍' }, { code: 'thumbsdown', char: '👎' }, { code: 'pray', char: '🙏' },
      { code: 'muscle', char: '💪' }, { code: 'point_right', char: '👉' }, { code: 'point_left', char: '👈' },
      { code: 'ok_hand', char: '👌' }, { code: 'fist', char: '✊' }, { code: 'handshake', char: '🤝' },
      { code: 'wave', char: '👋' }, { code: 'crossed_fingers', char: '🤞' }, { code: 'raised_hands', char: '🙌' },
    ],
  },
  {
    label: 'Sports',
    emoji: [
      { code: 'baseball', char: '⚾' }, { code: 'football', char: '🏈' }, { code: 'basketball', char: '🏀' },
      { code: 'hockey', char: '🏒' }, { code: 'soccer', char: '⚽' }, { code: 'boxing', char: '🥊' },
      { code: 'trophy', char: '🏆' }, { code: 'medal', char: '🥇' }, { code: 'stadium', char: '🏟️' },
      { code: 'whistle', char: '🎯' }, { code: 'stopwatch', char: '⏱️' },
    ],
  },
  {
    label: 'Money & Betting',
    emoji: [
      { code: 'moneybag', char: '💰' }, { code: 'money', char: '💵' }, { code: 'chart_up', char: '📈' },
      { code: 'chart_down', char: '📉' }, { code: 'dice', char: '🎲' }, { code: 'slot', char: '🎰' },
      { code: 'gem', char: '💎' }, { code: 'rocket', char: '🚀' }, { code: 'bank', char: '🏦' },
      { code: 'crown', char: '👑' }, { code: 'lock', char: '🔒' }, { code: 'unlock', char: '🔓' },
    ],
  },
  {
    label: 'Faces',
    emoji: [
      { code: 'smile', char: '😀' }, { code: 'grin', char: '😁' }, { code: 'wink', char: '😉' },
      { code: 'cool', char: '😎' }, { code: 'angry', char: '😡' }, { code: 'confused', char: '😕' },
      { code: 'neutral', char: '😐' }, { code: 'sleepy', char: '😴' }, { code: 'sick', char: '🤢' },
      { code: 'party', char: '🥳' }, { code: 'heart_eyes', char: '😍' }, { code: 'zany', char: '🤪' },
    ],
  },
  {
    label: 'Symbols',
    emoji: [
      { code: 'check', char: '✅' }, { code: 'x', char: '❌' }, { code: 'warning', char: '⚠️' },
      { code: 'question', char: '❓' }, { code: 'exclamation', char: '❗' }, { code: 'star', char: '⭐' },
      { code: 'sparkles', char: '✨' }, { code: 'boom', char: '💥' }, { code: 'zap', char: '⚡' },
      { code: 'up', char: '⬆️' }, { code: 'down', char: '⬇️' }, { code: 'siren', char: '🚨' },
    ],
  },
]

export const STANDARD_EMOJI_MAP: Record<string, string> = Object.fromEntries(
  EMOJI_CATEGORIES.flatMap(c => c.emoji).map(e => [e.code, e.char])
)

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
