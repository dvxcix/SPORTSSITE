import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import { isNativeAuthValue } from './nativeAuthHandoff'

const duration = { request: 10 * 60_000, proof: 2 * 60_000 } as const
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export type WhopLinkRequest = { userId: string; state: string; challenge: string }
type WhopLinkProof = WhopLinkRequest & { whop: { sub: string; preferred_username?: string; name?: string }; discordAccess: boolean }

export function sealWhopLink(key: Buffer, phase: 'request', value: WhopLinkRequest, now?: number): string
export function sealWhopLink(key: Buffer, phase: 'proof', value: WhopLinkProof, now?: number): string
export function sealWhopLink(key: Buffer, phase: keyof typeof duration, value: WhopLinkRequest | WhopLinkProof, now = Date.now()) {
  const nonce = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, nonce)
  cipher.setAAD(Buffer.from(`SlipSurge iOS Whop connection ${phase} v1`))
  const data = Buffer.concat([cipher.update(JSON.stringify({ ...value, expiresAt: now + duration[phase] }), 'utf8'), cipher.final()])
  return Buffer.concat([nonce, cipher.getAuthTag(), data]).toString('base64url')
}

function open(key: Buffer, phase: keyof typeof duration, token: unknown, now: number) {
  if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{40,2500}$/.test(token)) return null
  try {
    const bytes = Buffer.from(token, 'base64url')
    if (bytes.toString('base64url') !== token) return null
    const cipher = createDecipheriv('aes-256-gcm', key, bytes.subarray(0, 12))
    cipher.setAAD(Buffer.from(`SlipSurge iOS Whop connection ${phase} v1`))
    cipher.setAuthTag(bytes.subarray(12, 28))
    const value = JSON.parse(Buffer.concat([cipher.update(bytes.subarray(28)), cipher.final()]).toString('utf8')) as WhopLinkProof & { expiresAt: number }
    if (!Number.isFinite(value.expiresAt) || value.expiresAt <= now || value.expiresAt > now + duration[phase] ||
        typeof value.userId !== 'string' || !uuid.test(value.userId) || !isNativeAuthValue(value.state) || !isNativeAuthValue(value.challenge)) return null
    return value
  } catch { return null }
}

export function readWhopLinkRequest(key: Buffer, token: unknown, now = Date.now()): WhopLinkRequest | null {
  const value = open(key, 'request', token, now)
  return value ? { userId: value.userId, state: value.state, challenge: value.challenge } : null
}

export function readWhopLinkProof(key: Buffer, token: unknown, expected: { userId: string; state: unknown; verifier: unknown }, now = Date.now()) {
  const value = open(key, 'proof', token, now)
  if (!value || value.userId !== expected.userId || value.state !== expected.state || !isNativeAuthValue(expected.verifier) ||
      typeof value.whop?.sub !== 'string' || !/^[A-Za-z0-9_-]{2,120}$/.test(value.whop.sub) || typeof value.discordAccess !== 'boolean') return null
  const challenge = createHash('sha256').update(expected.verifier).digest('base64url')
  if (!timingSafeEqual(Buffer.from(challenge), Buffer.from(value.challenge))) return null
  return { whop: value.whop, discordAccess: value.discordAccess }
}
