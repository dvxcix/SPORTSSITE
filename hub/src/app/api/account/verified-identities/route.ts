import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { extractIdentityHandle, type VerifiedIdentity } from '@/lib/verifiedIdentity'

export const dynamic = 'force-dynamic'

// Rebuild public identity badges from the authenticated user's real Auth
// identities. The browser never submits arbitrary "verified" handles.
export async function POST() {
  const supabase = await createClient()
  const [{ data: { user } }, identitiesResult] = await Promise.all([
    supabase.auth.getUser(),
    supabase.auth.getUserIdentities(),
  ])
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (identitiesResult.error) {
    return NextResponse.json({ error: 'Could not verify connected accounts' }, { status: 502 })
  }

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
  for (const identity of identitiesResult.data?.identities ?? []) {
    if (identity.provider !== 'discord' && identity.provider !== 'x') continue
    const extracted = extractIdentityHandle(identity.provider, identity.identity_data ?? {})
    if (extracted) next[identity.provider] = extracted
  }

  const { error: updateError } = await admin
    .from('users')
    .update({ verified_identities: next })
    .eq('id', user.id)
  if (updateError) return NextResponse.json({ error: 'Could not update profile identities' }, { status: 500 })

  return NextResponse.json({ identities: next }, {
    headers: { 'Cache-Control': 'private, no-store, max-age=0' },
  })
}
