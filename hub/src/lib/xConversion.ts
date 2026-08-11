import { createHash } from 'crypto'

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

// Real incident: X rejected every single conversion with "MISSING_PARAMETER
// event_id" — X's `event_id` is NOT a per-call unique id we generate (that's
// what `conversion_id` below is for); per X's own docs it's the fixed Event
// ID of a specific tracked conversion event, created once in Ads Manager
// (looks like a short code, e.g. "ol288") and reused on every call for that
// event type. The old code generated a fresh random string per call, which
// X correctly doesn't recognize as any registered event. One real Event ID
// per event type this app tracks, read from env — set X_SIGNUP_EVENT_ID and
// X_PURCHASE_EVENT_ID to the values shown for each event in Ads Manager's
// Events page (business.x.com > Tools > Events Manager).
const X_EVENT_IDS: Record<'signup' | 'purchase', string | undefined> = {
  signup: process.env.X_SIGNUP_EVENT_ID,
  purchase: process.env.X_PURCHASE_EVENT_ID,
}

// Fire-and-forget by design — a failure or slow response from X's API must
// never block or fail the real user-facing action (signup redirect, webhook
// ack, cron reconcile) it's attached to. Every failure path just logs.
export async function sendXConversion({
  eventType, conversionId, email, eventSourceUrl, ip, userAgent,
}: {
  // Which registered X conversion event this call reports — determines
  // which X_*_EVENT_ID env var supplies the required event_id.
  eventType: 'signup' | 'purchase'
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
    return
  }
  const eventId = X_EVENT_IDS[eventType]
  if (!eventId) {
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
    return
  }

  try {
    const res = await fetch(X_CONVERSIONS_URL, {
      method: 'POST',
      headers: { 'X-Pixel-Token': token, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        conversions: [{
          conversion_time: new Date().toISOString(),
          event_id: eventId,
          ...(eventSourceUrl ? { event_source_url: eventSourceUrl } : {}),
          conversion_id: conversionId,
          identifiers: [identifiers],
        }],
      }),
      signal: AbortSignal.timeout(12_000),
    })
    if (!res.ok) console.error('[xConversion] API rejected event', { status: res.status })
  } catch (e) {
    console.error('[xConversion] request failed', { type: e instanceof Error ? e.name : typeof e })
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
