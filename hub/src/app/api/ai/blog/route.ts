import { NextRequest, NextResponse } from 'next/server'
import { requireTier } from '@/lib/requireTier'

export async function POST(req: NextRequest) {
  const gate = await requireTier('basic')
  if (gate.error) return gate.error

  const { prompt, sport, tone } = await req.json()

  const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY
  if (!ANTHROPIC_KEY) {
    return NextResponse.json({ error: 'No API key' }, { status: 500 })
  }

  const systemPrompt = `You are an expert sports betting analyst and writer for SlipSurge, the premier sports betting social hub. Write engaging, informative blog articles for sports bettors. ${sport ? `Focus on ${sport}.` : ''} Use a ${tone ?? 'analytical'} tone. Return JSON with: title (string), excerpt (1-2 sentence summary, string), content (full article in markdown, string). Be specific, use stats, be opinionated.`

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': ANTHROPIC_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 2000,
      messages: [{ role: 'user', content: `Write a blog article about: ${prompt}` }],
      system: systemPrompt,
    }),
  })

  if (!res.ok) return NextResponse.json({ error: 'AI failed' }, { status: 500 })

  const data = await res.json()
  const text = data.content?.[0]?.text ?? ''

  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0])
      return NextResponse.json(parsed)
    }
  } catch {}

  return NextResponse.json({
    title: prompt,
    excerpt: `An analysis of: ${prompt}`,
    content: text,
  })
}
