import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { bootstrapAccount } from '@/lib/accountBootstrap'

export const dynamic = 'force-dynamic'

// Creates the profile for an already-authenticated Auth user. This keeps
// the browser from receiving INSERT privileges on the users table or being
// able to choose role, tier, billing, and provider columns at signup.
export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  return bootstrapAccount(user)
}
