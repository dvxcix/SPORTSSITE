'use client'

import { useEffect, useMemo, useState } from 'react'
import { useCustomEmojis, parseEmojiShortcodes } from '@/lib/emoji'
import { createClient } from '@/lib/supabase/client'
import { extractMentionedUsernames } from '@/lib/mentions'
import { MentionHoverLink, type MentionProfile } from './MentionProfileCard'
import { SafeImage } from '@/components/ui/SafeImage'

const mentionProfileCache = new Map<string, MentionProfile | null>()

async function resolveProfiles(usernames: string[]) {
  const missing = usernames.filter(username => !mentionProfileCache.has(username))
  if (missing.length) {
    const { data, error } = await createClient().from('users')
      .select('id, username, display_name, avatar_url, bio, is_verified, follower_count, pick_record')
      .or(missing.map(username => `username.ilike.${username}`).join(','))
      .limit(missing.length)
    if (!error) {
      const found = new Map(((data ?? []) as MentionProfile[]).map(profile => [profile.username.toLowerCase(), profile]))
      for (const username of missing) mentionProfileCache.set(username, found.get(username) ?? null)
    }
  }

  const resolved = new Map<string, MentionProfile>()
  for (const username of usernames) {
    const profile = mentionProfileCache.get(username)
    if (profile) resolved.set(username, profile)
  }
  return resolved
}

// Post/comment content rendered as flat text with zero parsing — an
// "@username" mention was inert: unclickable (separately, see
// FeedComposer/PostCardClient's submitComment for the notification half),
// and a ":shortcode:" was just literal text, standard or custom. This
// handles both: mentions become profile links, shortcodes become the
// matching unicode emoji or an inline <img> for a custom one.
export function LinkifiedText({ text }: { text: string }) {
  const customEmojis = useCustomEmojis()
  const contentParts = text.split(/(https:\/\/[^\s]+)/g)
  const usernameKey = useMemo(() => extractMentionedUsernames(text).join('|'), [text])
  const [profiles, setProfiles] = useState<Map<string, MentionProfile>>(() => new Map())

  useEffect(() => {
    const usernames = usernameKey.split('|').filter(Boolean)
    if (!usernames.length) return
    let cancelled = false
    resolveProfiles(usernames).then(resolved => { if (!cancelled) setProfiles(resolved) })
    return () => { cancelled = true }
  }, [usernameKey])

  return (
    <>
      {contentParts.map((contentPart, contentIndex) => {
        if (contentPart.startsWith('https://')) {
          const cleanUrl = contentPart.replace(/[),.!?]+$/, '')
          let gif = false
          try {
            const parsed = new URL(cleanUrl)
            gif = /\.gif$/i.test(parsed.pathname) || /(^|\.)(giphy\.com|tenor\.com|giphyusercontent\.com)$/.test(parsed.hostname)
          } catch { /* leave invalid text untouched */ }
          if (gif) return <a key={contentIndex} href={cleanUrl} target="_blank" rel="noopener noreferrer" className="ss-inline-gif-link"><SafeImage src={cleanUrl} alt="Shared GIF" className="ss-inline-gif"/></a>
          return <a key={contentIndex} href={cleanUrl} target="_blank" rel="noopener noreferrer" className="ss-content-link">{contentPart}</a>
        }
        const mentionParts = contentPart.split(/(@[a-zA-Z0-9_.]{1,30})/g)
        return (
          <span key={contentIndex}>
            {mentionParts.map((part, mentionIndex) => {
              if (part.startsWith('@') && part.length > 1) {
                const profile = profiles.get(part.slice(1).toLowerCase())
                if (!profile) return <span key={mentionIndex}>{part}</span>
                return <MentionHoverLink key={mentionIndex} profile={profile} />
              }
              const emojiParts = parseEmojiShortcodes(part, customEmojis)
              return <span key={mentionIndex}>{emojiParts.map((seg, emojiIndex) => typeof seg === 'string' ? seg : <SafeImage key={emojiIndex} src={seg.image_url} alt={`:${seg.code}:`} title={`:${seg.code}:`} className="ss-inline-emoji"/>)}</span>
            })}
          </span>
        )
      })}
    </>
  )
}
