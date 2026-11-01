type ProfileMetadataInput = {
  username: string
  display_name?: string | null
  bio?: string | null
  avatar_url?: string | null
  is_private?: boolean | null
  hide_win_rate?: boolean | null
  pick_record?: { wins?: number; losses?: number; pushes?: number } | null
}

/** Metadata is publicly shareable, regardless of the viewer who generated it. */
export function profileMetadata(profile: ProfileMetadataInput | null) {
  if (!profile) return {}
  const name = profile.display_name || profile.username
  const record = profile.is_private === false && profile.hide_win_rate === false ? profile.pick_record : null
  const recordStr = record && ((record.wins ?? 0) + (record.losses ?? 0) + (record.pushes ?? 0)) > 0
    ? `${record.wins ?? 0}-${record.losses ?? 0}${record.pushes ? `-${record.pushes}` : ''} record. `
    : ''
  const description = `${recordStr}${profile.bio || `${name}'s picks and posts on SlipSurge.`}`.trim()
  return {
    title: `${name} (@${profile.username}) · SlipSurge`,
    description,
    openGraph: {
      title: `${name} (@${profile.username})`,
      description,
      images: profile.avatar_url ? [profile.avatar_url] : undefined,
    },
    twitter: {
      card: 'summary' as const,
      title: `${name} (@${profile.username})`,
      description,
      images: profile.avatar_url ? [profile.avatar_url] : undefined,
    },
  }
}
