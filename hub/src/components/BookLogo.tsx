'use client'
import React, { useState } from 'react'

// Vendor key → display info. Logos are served from our own /public/sportsbooks
// (copied from mlb-party's asset set) — remote sportsbook favicons are
// unreliable to hotlink (many block cross-origin fetches or 404 silently).
const BOOKS: Record<string, { favicon: string; initials: string; bg: string; color: string }> = {
  fanduel:    { favicon: '/sportsbooks/fanduel.ico',    initials: 'FD',  bg: '#1493FF', color: '#fff' },
  draftkings: { favicon: '/sportsbooks/draftkings.png', initials: 'DK',  bg: '#53A318', color: '#fff' },
  betmgm:     { favicon: '/sportsbooks/betmgm.png',     initials: 'MGM', bg: '#B8960C', color: '#000' },
  caesars:    { favicon: '/sportsbooks/caesars.png',    initials: 'CZ',  bg: '#0B4032', color: '#B8960C' },
  betrivers:  { favicon: '/sportsbooks/betrivers.ico',  initials: 'BR',  bg: '#003087', color: '#fff' },
  pinnacle:   { favicon: '/sportsbooks/pinnacle.ico',   initials: 'PIN', bg: '#003087', color: '#fff' },
  williamhill_us: { favicon: '/sportsbooks/caesars.png', initials: 'CZ', bg: '#0B4032', color: '#B8960C' },
}

// Normalize vendor key from any alias
export function normalizeVendor(v: string): string {
  const k = (v || '').toLowerCase().replace(/[^a-z]/g, '')
  if (k === 'fanduel' || k === 'fd') return 'fanduel'
  if (k === 'draftkings' || k === 'dk') return 'draftkings'
  if (k === 'betmgm' || k === 'mgm') return 'betmgm'
  if (k === 'caesars' || k === 'cz' || k === 'williamhillus' || k === 'williamhill') return 'caesars'
  if (k === 'fanatics' || k === 'fan') return 'fanatics'
  if (k === 'betrivers' || k === 'br') return 'betrivers'
  return k
}

export function BookLogo({ vendor, size = 16 }: { vendor: string; size?: number }) {
  const [err, setErr] = useState(false)
  const key = normalizeVendor(vendor)
  const book = BOOKS[key]

  if (!book) {
    return (
      <span style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        width: size, height: size, borderRadius: 3,
        background: 'var(--surface-2)', fontSize: size * 0.45,
        fontWeight: 700, color: 'var(--text-3)', fontFamily: 'monospace',
        flexShrink: 0, verticalAlign: 'middle',
      }}>
        {vendor.slice(0, 2).toUpperCase()}
      </span>
    )
  }

  if (!err) {
    return (
      <img
        src={book.favicon}
        alt={key}
        onError={() => setErr(true)}
        style={{ width: size, height: size, objectFit: 'contain', flexShrink: 0, verticalAlign: 'middle', borderRadius: 2 }}
      />
    )
  }

  // Fallback: colored pill with initials
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      width: size, height: size, borderRadius: 3,
      background: book.bg, fontSize: size * 0.38,
      fontWeight: 900, color: book.color, fontFamily: 'monospace',
      flexShrink: 0, verticalAlign: 'middle', letterSpacing: '-0.02em',
    }}>
      {book.initials}
    </span>
  )
}
