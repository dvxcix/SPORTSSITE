import 'server-only'
import { sign } from 'node:crypto'
import { connect, type ClientHttp2Session } from 'node:http2'
import { createAdminClient } from '@/lib/supabase/admin'
import { applePushConfig, appleToken, type ApplePushConfig } from './applePushConfig'

type Device = { id: string; token: string; topic: string; environment: string }

function providerToken(config: ApplePushConfig, issuedAt: number) {
  const head = Buffer.from(JSON.stringify({ alg: 'ES256', kid: config.keyId })).toString('base64url')
  const claims = Buffer.from(JSON.stringify({ iss: config.teamId, iat: issuedAt })).toString('base64url')
  const input = `${head}.${claims}`
  const signature = sign('sha256', Buffer.from(input), { key: config.key, dsaEncoding: 'ieee-p1363' })
  return `${input}.${signature.toString('base64url')}`
}

function requestDelivery(session: ClientHttp2Session, token: string, topic: string, auth: string, id: string, issuedAt: number, payload: string) {
  return new Promise<{ status: number; invalidAt?: string }>((resolve, reject) => {
    const request = session.request({ ':method': 'POST', ':path': `/3/device/${token}`,
      authorization: `bearer ${auth}`, 'apns-topic': topic, 'apns-id': id, 'apns-collapse-id': id,
      'apns-push-type': 'alert', 'apns-priority': '10', 'apns-expiration': String(issuedAt + 3600),
      'content-type': 'application/json' })
    let status = 0, response = ''
    request.setEncoding('utf8')
    request.on('response', headers => { status = Number(headers[':status']) })
    request.on('data', chunk => { if (response.length < 1024) response += chunk })
    request.on('error', reject)
    request.on('end', () => {
      let invalidAt: string | undefined
      if (status === 410) {
        try {
          const { timestamp } = JSON.parse(response)
          if (Number.isFinite(timestamp) && timestamp > 0 && timestamp <= Date.now()) invalidAt = new Date(timestamp).toISOString()
        } catch { /* Keep the token unless Apple provides an expiry timestamp. */ }
      }
      resolve({ status, invalidAt })
    })
    request.setTimeout(6000, () => request.destroy(Error('APNs request expired')))
    request.end(payload)
  })
}

async function deliver(devices: Device[], config: ApplePushConfig, userId: string, id: string) {
  const admin = createAdminClient()
  const authority = config.environment === 'development' ? 'https://api.sandbox.push.apple.com' : 'https://api.push.apple.com'
  const connection = connect(authority, { minVersion: 'TLSv1.2' })
  connection.on('error', () => { /* Individual streams settle their own delivery result. */ })
  connection.setTimeout(10_000, () => connection.destroy())
  const deadline = setTimeout(() => connection.destroy(), 24_000)
  const issuedAt = Math.floor(Date.now() / 1000)
  try {
    const auth = providerToken(config, issuedAt)
    // APNs and the lock screen receive no message text, participant or account details.
    const payload = JSON.stringify({ aps: { alert: { title: 'SlipSurge', body: 'You have new activity.' }, sound: 'default' }, notificationId: id })
    for (const device of devices) {
      if (connection.destroyed || connection.closed) break
      const active = await admin.from('native_apple_push_devices').select('id').eq('id', device.id).eq('user_id', userId).maybeSingle()
      if (active.error || !active.data) continue
      const claim = await admin.from('native_apple_push_deliveries').insert({ device_id: device.id, notification_id: id, status: 'sending' })
      if (claim.error) continue
      let providerStatus: number | null = null
      let success = false
      try {
        const result = await requestDelivery(connection, device.token, device.topic, auth, id, issuedAt, payload)
        providerStatus = result.status || null
        success = result.status === 200
        if (result.invalidAt) {
          await admin.from('native_apple_push_devices').delete().eq('id', device.id).eq('user_id', userId).lte('updated_at', result.invalidAt)
        }
      } catch { /* A timed-out send might have reached Apple. Keep the claim. */ }
      await admin.from('native_apple_push_deliveries').update({ status: success ? 'sent' : 'failed', provider_status: providerStatus })
        .eq('device_id', device.id).eq('notification_id', id)
    }
  } finally {
    clearTimeout(deadline)
    connection.destroy()
  }
}

export async function sendApplePush(userId: string, notificationId: string) {
  const configs = [applePushConfig('production'), applePushConfig('development')].filter((config): config is ApplePushConfig => config != null)
  if (!configs.length) return
  const since = new Date(Date.now() - 30 * 86_400_000).toISOString()
  const { data, error } = await createAdminClient().from('native_apple_push_devices').select('id,token,topic,environment')
    .eq('user_id', userId).gte('updated_at', since).order('updated_at', { ascending: false }).limit(8).abortSignal(AbortSignal.timeout(5000))
  if (error || !data?.length) return
  await Promise.allSettled(configs.map(config => {
    const devices = data.filter(device => device.environment === config.environment && device.topic === config.topic && appleToken(device.token))
    return devices.length ? deliver(devices, config, userId, notificationId) : Promise.resolve()
  }))
}
