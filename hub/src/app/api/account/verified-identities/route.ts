import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { syncDiscordIdentity } from '@/lib/discord'
import { extractIdentityHandle, type VerifiedIdentity } from '@/lib/verifiedIdentity'
import { accountSettingsActor } from '@/lib/supabase/accountSettingsActor'

export const dynamic = 'force-dynamic'

// Rebuild public identity badges from the authenticated user's real Auth
// identities. The browser never submits arbitrary "verified" handles.
export async function POST(request: Request) {
  const account = await accountSettingsActor(request)
  if (account.error) return account.error
  const { user } = account
  if (!user.identities) return NextResponse.json({ error: 'Could not verify connected accounts' }, { status: 502 })

  const admin = createAdminClient()
  const { data: current, error: readError } = await admin
    .from('users')
    .select('verified_identities')
    .eq('id', user.id)
    .maybeSingle()
  if (readError) return NextResponse.json({ error: 'Could not load profile identities' }, { status: 500 })

  const next: Record<string, VerifiedIdentity> = {
    ...((current?.verified_identities as Record<string, VerifiedIdentity> | null) ?? {}),
  }
  delete next.discord
  delete next.x
  for (const identity of user.identities) {
    if (identity.provider !== 'discord' && identity.provider !== 'x') continue
    const extracted = extractIdentityHandle(identity.provider, identity.identity_data ?? {})
    if (extracted) next[identity.provider] = extracted
  }

  const { error: updateError } = await admin
    .from('users')
    .update({ verified_identities: next })
    .eq('id', user.id)
  if (updateError) return NextResponse.json({ error: 'Could not update profile identities' }, { status: 500 })

  await syncDiscordIdentity(admin, user.id)
  return NextResponse.json({ identities: next }, {
    headers: { 'Cache-Control': 'private, no-store, max-age=0' },
  })
}
