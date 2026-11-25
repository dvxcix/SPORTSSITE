import { NextResponse } from 'next/server'
import { discordAdminActor } from '@/lib/discordAdminActor'

// One-shot diagnostic for the "DISCORD_BOT_TOKEN is not configured" runtime
// error persisting across confirmed-fresh deployments — reports presence
// only (never the value) so this is safe to check from a browser tab.
export async function GET(request: Request) {
  const actor = await discordAdminActor(request)
  if (actor.error) return actor.error

  return NextResponse.json({
    hasBotToken: !!process.env.DISCORD_BOT_TOKEN,
    hasApplicationId: !!process.env.DISCORD_APPLICATION_ID,
    hasPublicKey: !!process.env.DISCORD_PUBLIC_KEY,
  })
}
