import { handleWhopWebhookRequest } from '@/lib/whopWebhook'

export const runtime = 'nodejs'

// The main tier-payments Whop business — every normal Basic/Advanced/
// Ultimate customer. See /api/webhooks/whop-addon for the entirely separate
// Discord-community business the $10 Ultimate add-on lives under.
export async function POST(req: Request) {
  return handleWhopWebhookRequest(req, process.env.WHOP_WEBHOOK_KEY)
}
