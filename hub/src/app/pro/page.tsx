import { redirect } from 'next/navigation'

// The old "SlipSurge Pro" Stripe upsell — retired in favor of the
// Free/Basic/Advanced/Ultimate Whop tiers (zero real Pro subscribers at the
// time of retirement). feature_pro_plan is also flipped off in site_settings
// so this route is unreachable via nav either way; the redirect covers
// anyone hitting the old URL directly. Underlying Stripe checkout/webhook
// code is left in place, dormant, rather than deleted in the same pass as a
// payments launch — full removal is a separate later cleanup.
export default function ProPlanPage() {
  redirect('/pricing')
}
