'use client'

import Image from 'next/image'
import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { BadgeCheck, Check, ExternalLink, Loader2, Link2, ShieldCheck, Unlink, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { extractIdentityHandle, type VerifiedIdentity } from '@/lib/verifiedIdentity'

type Provider = 'whop' | 'discord' | 'x'

const providers: Array<{
  id: Provider
  name: string
  description: string
  accent: string
}> = [
  { id: 'whop', name: 'Whop', description: 'Membership and purchase access', accent: '#ff6243' },
  { id: 'discord', name: 'Discord', description: 'Community access and roles', accent: '#5865f2' },
  { id: 'x', name: 'X', description: 'Verified social identity', accent: '#f4f4f5' },
]

function ProviderMark({ provider }: { provider: Provider }) {
  if (provider === 'whop') {
    return <Image src="/brands/whop-logo.svg" alt="" width={25} height={25} />
  }
  if (provider === 'x') return <span className="ss-connection-letter" aria-hidden="true">X</span>
  return (
    <svg viewBox="0 0 24 24" width="26" height="26" fill="currentColor" aria-hidden="true">
      <path d="M20.3 4.4a19.7 19.7 0 0 0-4.9-1.5l-.1.1c-.2.4-.4.8-.6 1.2a18.4 18.4 0 0 0-5.5 0c-.2-.4-.4-.9-.6-1.2a.1.1 0 0 0-.1-.1 19.8 19.8 0 0 0-4.9 1.5C.5 9-.3 13.6.1 18.1l.1.1a19.8 19.8 0 0 0 6 3l.1-.1c.5-.6.9-1.3 1.2-2a13.3 13.3 0 0 1-1.9-.9v-.1l.4-.3h.1c3.9 1.8 8.2 1.8 12.1 0h.1l.4.3v.1c-.6.3-1.2.6-1.9.9.4.7.8 1.4 1.2 2h.1a19.8 19.8 0 0 0 6-3l.1-.1c.5-5.2-.8-9.7-3.6-13.7ZM8 15.3c-1.2 0-2.2-1.1-2.2-2.4s1-2.4 2.2-2.4 2.2 1.1 2.2 2.4-1 2.4-2.2 2.4Zm8 0c-1.2 0-2.2-1.1-2.2-2.4s1-2.4 2.2-2.4 2.2 1.1 2.2 2.4-1 2.4-2.2 2.4Z" />
    </svg>
  )
}

export function ConnectedAccountsPanel({
  initialVerified,
  initialWhopConnected,
}: {
  initialVerified: Record<string, VerifiedIdentity>
  initialWhopConnected: boolean
}) {
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])
  const [verified, setVerified] = useState<Record<string, VerifiedIdentity>>(initialVerified)
  const [whopConnected, setWhopConnected] = useState(initialWhopConnected)
  const [busy, setBusy] = useState<Provider | null>(null)
  const [confirming, setConfirming] = useState<Provider | null>(null)
  const [message, setMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(null)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const linkError = params.get('link_error') || params.get('whop_link_error')
    const linkedWhop = params.get('whop_linked')
    if (linkError) setMessage({ tone: 'error', text: 'That account could not be connected. It may already belong to another SlipSurge account.' })
    if (linkedWhop) {
      setWhopConnected(true)
      setMessage({ tone: 'success', text: 'Whop connected.' })
    }
    if (linkError || linkedWhop) {
      params.delete('link_error')
      params.delete('whop_link_error')
      params.delete('whop_linked')
      const query = params.toString()
      window.history.replaceState({}, '', `${window.location.pathname}${query ? `?${query}` : ''}`)
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    async function refreshIdentities() {
      const { data, error } = await supabase.auth.getUserIdentities()
      if (cancelled) return
      if (error) {
        setMessage({ tone: 'error', text: 'Connected accounts could not be refreshed.' })
        return
      }
      const next = { ...initialVerified }
      delete next.discord
      delete next.x
      for (const identity of data?.identities ?? []) {
        if (identity.provider !== 'discord' && identity.provider !== 'x') continue
        const extracted = extractIdentityHandle(identity.provider, identity.identity_data ?? {})
        if (extracted) next[identity.provider] = extracted
      }
      setVerified(next)
      const response = await fetch('/api/account/verified-identities', { method: 'POST' })
      const body = await response.json().catch(() => ({}))
      if (!cancelled && response.ok && body.identities) setVerified(body.identities)
    }
    refreshIdentities().catch(() => {
      if (!cancelled) setMessage({ tone: 'error', text: 'Connected accounts could not be refreshed.' })
    })
    return () => { cancelled = true }
  }, [initialVerified, supabase])

  function isConnected(provider: Provider) {
    return provider === 'whop' ? whopConnected : !!verified[provider]
  }

  async function connect(provider: Provider) {
    setBusy(provider)
    setMessage(null)
    if (provider === 'whop') {
      router.push(`/auth/whop/login?mode=link&next=${encodeURIComponent('/settings/connections')}`)
      return
    }
    try {
      const { error } = await supabase.auth.linkIdentity({
        provider,
        options: { redirectTo: `${location.origin}/auth/callback?next=${encodeURIComponent('/settings/connections')}` },
      })
      if (error) throw error
    } catch {
      setBusy(null)
      setMessage({ tone: 'error', text: `${provider === 'x' ? 'X' : 'Discord'} could not be connected. Try again.` })
    }
  }

  async function disconnect(provider: Provider) {
    setBusy(provider)
    setMessage(null)
    try {
      if (provider === 'whop') {
        const response = await fetch('/api/whop/unlink', { method: 'POST' })
        if (!response.ok) throw new Error('unlink failed')
        setWhopConnected(false)
        const next = { ...verified }
        delete next.whop
        setVerified(next)
      } else {
        const { data, error: readError } = await supabase.auth.getUserIdentities()
        if (readError) throw readError
        const identity = data?.identities.find(item => item.provider === provider)
        if (!identity) throw new Error('identity missing')
        if ((data?.identities.length ?? 0) <= 1) {
          setMessage({ tone: 'error', text: 'Connect another sign-in method before disconnecting this account.' })
          return
        }
        const { error } = await supabase.auth.unlinkIdentity(identity)
        if (error) throw error
        const response = await fetch('/api/account/verified-identities', { method: 'POST' })
        const body = await response.json().catch(() => ({}))
        if (!response.ok) throw new Error(body.error || 'sync failed')
        setVerified(body.identities ?? {})
      }
      setConfirming(null)
      setMessage({ tone: 'success', text: `${providers.find(item => item.id === provider)?.name} disconnected.` })
      router.refresh()
    } catch {
      setMessage({ tone: 'error', text: 'That account could not be disconnected. Try again.' })
    } finally {
      setBusy(null)
    }
  }

  const connectionCount = providers.filter(provider => isConnected(provider.id)).length

  return (
    <div className="ss-connections">
      <section className="ss-connection-summary">
        <span className="ss-connection-summary-icon"><ShieldCheck size={22} /></span>
        <div>
          <p>Account connections</p>
          <h2>{connectionCount} of {providers.length} connected</h2>
        </div>
        <span className="ss-connection-summary-count">{connectionCount}/{providers.length}</span>
      </section>

      {message && (
        <div className={`ss-connection-alert ${message.tone}`} role={message.tone === 'error' ? 'alert' : 'status'}>
          {message.tone === 'success' ? <Check size={16} /> : <X size={16} />}
          <span>{message.text}</span>
          <button type="button" onClick={() => setMessage(null)} aria-label="Dismiss message"><X size={14} /></button>
        </div>
      )}

      <section className="ss-connection-list" aria-label="Available account connections">
        {providers.map(provider => {
          const connected = isConnected(provider.id)
          const identity = verified[provider.id]
          const isBusy = busy === provider.id
          const isConfirming = confirming === provider.id
          return (
            <article className="ss-connection-card" key={provider.id} style={{ '--provider-accent': provider.accent } as React.CSSProperties}>
              <span className="ss-connection-provider-mark"><ProviderMark provider={provider.id} /></span>
              <div className="ss-connection-copy">
                <div className="ss-connection-title">
                  <h3>{provider.name}</h3>
                  <span className={connected ? 'is-connected' : ''}>{connected ? <><BadgeCheck size={13} /> Connected</> : 'Not connected'}</span>
                </div>
                <p>{provider.description}</p>
                {connected && (
                  identity?.profileUrl
                    ? <a href={identity.profileUrl} target="_blank" rel="noopener noreferrer">{identity.handle}<ExternalLink size={12} /></a>
                    : <small>Connected to your SlipSurge account</small>
                )}
              </div>
              <div className="ss-connection-actions">
                {!connected ? (
                  <button type="button" className="ss-settings-primary" onClick={() => connect(provider.id)} disabled={busy !== null}>
                    {isBusy ? <Loader2 size={14} className="animate-spin" /> : <Link2 size={14} />}
                    {isBusy ? 'Connecting…' : 'Connect'}
                  </button>
                ) : isConfirming ? (
                  <div className="ss-connection-confirm">
                    <button type="button" className="ss-settings-secondary" onClick={() => setConfirming(null)} disabled={isBusy}>Keep</button>
                    <button type="button" className="ss-connection-danger" onClick={() => disconnect(provider.id)} disabled={isBusy}>
                      {isBusy ? <Loader2 size={14} className="animate-spin" /> : <Unlink size={14} />}
                      Disconnect
                    </button>
                  </div>
                ) : (
                  <button type="button" className="ss-settings-secondary" onClick={() => setConfirming(provider.id)} disabled={busy !== null}>
                    <Unlink size={14} /> Disconnect
                  </button>
                )}
              </div>
            </article>
          )
        })}
      </section>
    </div>
  )
}
