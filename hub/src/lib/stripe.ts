import Stripe from 'stripe'

// Server-only. Never import this file from a 'use client' component.
let _stripe: Stripe | null = null

export function getStripe(): Stripe {
  if (_stripe) return _stripe
  const key = process.env.STRIPE_SECRET_KEY
  if (!key) throw new Error('STRIPE_SECRET_KEY is not set')
  _stripe = new Stripe(key, { apiVersion: '2026-06-24.dahlia' })
  return _stripe
}

export const PLATFORM_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://hub-umber-seven.vercel.app'
