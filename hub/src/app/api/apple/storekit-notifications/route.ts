import { NextResponse } from 'next/server'
import { readSignedStoreKitBody, receiveStoreKitNotification, storeKitError } from '@/lib/storeKitSignedData'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  try {
    const signed = await readSignedStoreKitBody(request, 'signedPayload')
    await receiveStoreKitNotification(signed)
    return NextResponse.json({ ok: true })
  } catch (error) {
    const result = storeKitError(error)
    return NextResponse.json({ error: result.message }, { status: result.status })
  }
}
