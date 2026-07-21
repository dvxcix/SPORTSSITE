import { createHash, randomUUID } from 'crypto'

// Server-side X (Twitter) Conversions API — fires two events: a brand-new
// account signing up (auth/callback/route.ts, auth/whop/callback/route.ts)
// and a real paid tier purchase completing for the first time (whopWebhook.ts,
// whopMainReconcile.ts, whopAddonReconcile.ts — all three can be the one that
// actually observes it first, since the webhook isn't the only real grant
// path; see those files' own comments on why the cron reconcile jobs exist).
//
// X's setup flow only ever gave a single pixel ID (re01u) and one access
// token — no separate per-event-type IDs — so every event posts to the same
// endpoint, differentiated only by the documented fields below (conversion_id/
// event_source_url), not by any event-type field (the API doesn't expose one
// in what X's own docs show for this endpoint).
const X_PIXEL_ID = 're01u'
const X_CONVERSIONS_URL = `https://ads-api.x.com/12/measurement/conversions/${X_PIXEL_ID}`

function sha256Hex(input: string): string {
  return createHash('sha256').update(input.trim().toLowerCase()).digest('hex')
}

// Fire-and-forget by design — a failure or slow response from X's API must
// never block or fail the real user-facing action (signup redirect, webhook
// ack, cron reconcile) it's attached to. Every failure path just logs.
export async function sendXConversion({
  conversionId, email, eventSourceUrl, ip, userAgent,
}: {
  // Stable per-real-world-event key (e.g. `signup-${userId}`,
  // `purchase-${userId}`) — lets X dedupe if this ever fires twice for the
  // same actual signup/purchase.
  conversionId: string
  email?: string | null
  eventSourceUrl?: string
  ip?: string | null
  userAgent?: string | null
}): Promise<void> {
  const token = process.env.X_PIXEL_ACCESSTOKEN
  if (!token) {
    console.error('[xConversion] X_PIXEL_ACCESSTOKEN not configured — skipping', conversionId)
    return
  }

  // X requires at least one of: twclid, hashed_email, hashed_phone_number, or
  // the (ip_address, user_agent) pair. We never have a twclid (no click-id
  // capture wired up) or phone number, so this is hashed_email and/or
  // ip+ua — whichever this call site actually has available.
  const identifiers: Record<string, string> = {}
  if (email) identifiers.hashed_email = sha256Hex(email)
  if (ip && userAgent) {
    identifiers.ip_address = ip
    identifiers.user_agent = userAgent
  }
  if (!Object.keys(identifiers).length) {
    console.error('[xConversion] no usable identifiers (no email, no ip+ua pair) — skipping', conversionId)
    return
  }

  try {
    const res = await fetch(X_CONVERSIONS_URL, {
      method: 'POST',
      headers: { 'X-Pixel-Token': token, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        conversions: [{
          conversion_time: new Date().toISOString(),
          event_id: `tw-${X_PIXEL_ID}-${randomUUID()}`,
          ...(eventSourceUrl ? { event_source_url: eventSourceUrl } : {}),
          conversion_id: conversionId,
          identifiers: [identifiers],
        }],
      }),
    })
    if (!res.ok) console.error('[xConversion] API rejected event', conversionId, res.status, await res.text().catch(() => ''))
  } catch (e) {
    console.error('[xConversion] request threw', conversionId, e)
  }
}

// Vercel/most proxies set x-forwarded-for as a comma-separated list, real
// client IP first — falls back to x-real-ip. Neither is guaranteed present
// (e.g. local dev), which is fine: sendXConversion above just skips the
// ip+ua identifier pair when either is missing, since email alone still
// satisfies X's "at least one identifier" requirement whenever we have it.
export function clientIpFromRequest(request: Request): string | null {
  const xff = request.headers.get('x-forwarded-for')
  if (xff) return xff.split(',')[0].trim()
  return request.headers.get('x-real-ip')
}
