import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCreatorWebhookSecret } from '@/lib/creatorWebhookConfig'
import { handleWhopWebhookRequest } from '@/lib/whopWebhook'
export const runtime = 'nodejs'
export async function POST(request: Request) {
 try { return await handleWhopWebhookRequest(request, await getCreatorWebhookSecret(createAdminClient()), 'creator') }
 catch { return NextResponse.json({ error: 'Creator webhook unavailable' }, { status: 503 }) }
}
