import { NextRequest, NextResponse } from 'next/server'
import { requireTier } from '@/lib/requireTier'
import { consumeServerRateLimit } from '@/lib/serverRateLimit'

const AI_TIMEOUT_MS = 30_000
const VALID_SPORTS = new Set(['MLB', 'NFL', 'NBA', 'NHL', 'Soccer', 'MMA', 'CFB', 'CBB'])
const VALID_TONES = new Set(['analytical', 'educational', 'conversational', 'concise'])

export async function POST(req: NextRequest) {
  const gate = await requireTier('basic')
  if (gate.error) return gate.error

  const body = await req.json().catch(() => null)
  const prompt = typeof body?.prompt === 'string' ? body.prompt.trim().slice(0, 500) : ''
  const sport = typeof body?.sport === 'string' && VALID_SPORTS.has(body.sport) ? body.sport : ''
  const tone = typeof body?.tone === 'string' && VALID_TONES.has(body.tone) ? body.tone : 'analytical'
  if (prompt.length < 3) return NextResponse.json({ error: 'Add a topic before generating an article.' }, { status: 400 })

  const rateLimit = await consumeServerRateLimit(gate.userId!, 'ai-blog', 10, 3600)
  if (!rateLimit.available) return NextResponse.json({ error: 'Article generation is temporarily unavailable.' }, { status: 503 })
  if (!rateLimit.allowed) return NextResponse.json({ error: 'You have reached the hourly article limit.' }, { status: 429 })

  const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY
  if (!ANTHROPIC_KEY) {
    return NextResponse.json({ error: 'Article generation is temporarily unavailable.' }, { status: 503 })
  }

  const systemPrompt = `You are an expert sports betting analyst and writer for SlipSurge, the premier sports betting social hub. Write engaging, informative blog articles for sports bettors. ${sport ? `Focus on ${sport}.` : ''} Use a ${tone ?? 'analytical'} tone. Return JSON with: title (string), excerpt (1-2 sentence summary, string), content (full article in markdown, string). Be specific, use stats, be opinionated.`

  let res: Response
  try {
    res = await fetch('https://api.anthropic.com/v1/messages', {
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
      signal: AbortSignal.timeout(AI_TIMEOUT_MS),
    })
  } catch (error) {
    console.error('[ai/blog] provider request failed', { type: error instanceof Error ? error.name : typeof error })
    return NextResponse.json({ error: 'Article generation is temporarily unavailable.' }, { status: 502 })
  }

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
