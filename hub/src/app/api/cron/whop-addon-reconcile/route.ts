import { NextResponse } from 'next/server'
import { requireCronAuth } from '@/lib/cron-auth'
import { reconcileWhopAddon } from '@/lib/whopAddonReconcile'

export const revalidate = 0

// Safety net for the addon Whop business's webhook — the webhook itself is
// now confirmed working (signature bug fixed, real events processing
// correctly live), so this is a backstop for whatever it might still miss,
// not the primary grant path anymore. Runs every 15 minutes (see
// vercel.json) — cheap now that this fetches every page via
// fetchAllWhopMemberships() and no longer touches downgrades, so more
// frequent runs don't risk anything, just catch stragglers faster.
export async function GET(req: Request) {
  const authError = requireCronAuth(req)
  if (authError) return authError

  const result = await reconcileWhopAddon()
  if ('error' in result) return NextResponse.json(result, { status: result.error.includes('not configured') ? 500 : 502 })
  return NextResponse.json(result)
}
