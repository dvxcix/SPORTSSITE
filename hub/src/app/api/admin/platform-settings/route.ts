import { NextResponse } from 'next/server'
import { creatorAdminAuth } from '@/lib/creatorAdminAuth'
export async function PATCH() {
 const auth = await creatorAdminAuth()
 if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })
 return NextResponse.json({ error: 'Creator fees are managed in Whop. The separate SlipSurge percentage has been retired.' }, { status: 410 })
}
