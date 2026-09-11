import { redirect } from 'next/navigation'

export default async function LegacyScoresPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>
}) {
  const { date } = await searchParams
  redirect(date ? `/sports?date=${encodeURIComponent(date)}` : '/sports')
}
