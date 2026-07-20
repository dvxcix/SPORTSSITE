import { handleWhopWebhookRequest } from '@/lib/whopWebhook'

export const runtime = 'nodejs'

// The separate Discord-community Whop business (ADDON_WHOP_KEY /
// ADDON_WHOP_WEBHOOK) — today just the $10/mo Ultimate add-on
// (plan_Q1Ey6RMgjS9XQ), sold only to accounts that already get Advanced
// free via that same business's Discord plan. Deliberately its own route
// with its own signing secret, not folded into /api/webhooks/whop, so an
// event from this business can never be verified against (or mistaken for)
// a normal tier-payments customer's event.
export async function POST(req: Request) {
  return handleWhopWebhookRequest(req, process.env.ADDON_WHOP_WEBHOOK)
}
