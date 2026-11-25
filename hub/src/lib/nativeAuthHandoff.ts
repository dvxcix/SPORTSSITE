import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from 'node:crypto'

const urlValue = /^[A-Za-z0-9_-]{43}$/
const codePart = /^[A-Za-z0-9_-]+$/
const authContext = Buffer.from('SlipSurge iOS sign-in handoff v1')
const lifetime = 2 * 60 * 1000

export function isNativeAuthValue(value: unknown): value is string {
  return typeof value === 'string' && urlValue.test(value)
}

export function nativeHandoffKey(value = process.env.SLIPSURGE_NATIVE_OAUTH_HANDOFF_KEY) {
  if (!isNativeAuthValue(value)) return null
  const key = Buffer.from(value, 'base64url')
  return key.length === 32 && key.toString('base64url') === value ? key : null
}

type Handoff = {
  state: string
  challenge: string
  tokenHash: string
  userId: string
  expiresAt: number
}

export function sealNativeHandoff(key: Buffer, value: Omit<Handoff, 'expiresAt'>, now = Date.now()) {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  cipher.setAAD(authContext)
  const data = Buffer.concat([cipher.update(JSON.stringify({ ...value, expiresAt: now + lifetime }), 'utf8'), cipher.final()])
  return Buffer.concat([iv, cipher.getAuthTag(), data]).toString('base64url')
}

export function openNativeHandoff(key: Buffer, code: unknown, state: unknown, verifier: unknown, now = Date.now()) {
  if (!isNativeAuthValue(state) || !isNativeAuthValue(verifier) ||
      typeof code !== 'string' || code.length < 40 || code.length > 3072 || !codePart.test(code)) return null
  try {
    const data = Buffer.from(code, 'base64url')
    const decipher = createDecipheriv('aes-256-gcm', key, data.subarray(0, 12))
    decipher.setAAD(authContext)
    decipher.setAuthTag(data.subarray(12, 28))
    const message = Buffer.concat([decipher.update(data.subarray(28)), decipher.final()])
    const payload = JSON.parse(message.toString('utf8')) as Handoff
    if (!Number.isFinite(payload.expiresAt) || payload.expiresAt <= now || payload.expiresAt > now + lifetime ||
        payload.state !== state || !isNativeAuthValue(payload.challenge) ||
        typeof payload.tokenHash !== 'string' || !payload.tokenHash ||
        typeof payload.userId !== 'string' || !payload.userId) return null
    const challenge = createHash('sha256').update(verifier).digest('base64url')
    if (!timingSafeEqual(Buffer.from(challenge), Buffer.from(payload.challenge))) return null
    return { tokenHash: payload.tokenHash, userId: payload.userId }
  } catch {
    return null
  }
}
