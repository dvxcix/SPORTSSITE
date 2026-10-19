import { notFound, redirect } from 'next/navigation'
import { requirePaintAccess } from '@/lib/paintAccess'
export default async function NbaPage() { const gate = await requirePaintAccess(); if (gate.error) notFound(); redirect('/the-paint') }
