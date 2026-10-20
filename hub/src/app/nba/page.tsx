import { redirect } from 'next/navigation'
import { NbaAccessFallback } from '@/components/nba/NbaAccessFallback'
import { requirePaintAccess } from '@/lib/paintAccess'
export default async function NbaPage() { const gate = await requirePaintAccess(); if (gate.error) return <NbaAccessFallback status={gate.error.status} />; redirect('/the-paint') }
