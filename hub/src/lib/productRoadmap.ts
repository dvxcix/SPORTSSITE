export type ProductRoadmapStatus = 'complete' | 'active' | 'queued'

export type ProductRoadmapPhase = {
  id: string
  label: string
  status: ProductRoadmapStatus
  progress: number
  shipped: string[]
  remaining: string[]
}

export const PRODUCT_ROADMAP_PHASES: ProductRoadmapPhase[] = [
  {
    id: 'foundation', label: 'Foundation', status: 'complete', progress: 100,
    shipped: ['Shared shell and navigation', 'Design tokens and common states', 'Desktop, mobile, tablet, and foldable contracts'],
    remaining: [],
  },
  {
    id: 'account', label: 'Account Journey', status: 'complete', progress: 100,
    shipped: ['Registration and recovery', 'Resumable personalized onboarding', 'Identity, interests, privacy, alerts, and membership destination'],
    remaining: [],
  },
  {
    id: 'feed', label: 'Feed & Publishing', status: 'complete', progress: 100,
    shipped: ['Post, pick, poll, research, media, GIF, and spoiler modes', 'Replies, reactions, reposts, bookmarks, sharing, and moderation', 'Draft recovery and paginated feed states'],
    remaining: [],
  },
  {
    id: 'community', label: 'Community', status: 'complete', progress: 100,
    shipped: ['Groups, multi-channel workspaces, and forums', 'Roles, permissions, invites, onboarding, and moderation', 'Live game rooms and contribution recaps'],
    remaining: [],
  },
  {
    id: 'messaging', label: 'Messaging', status: 'complete', progress: 100,
    shipped: ['Private and group conversations', 'Replies, reactions, forwarding, pins, search, and shared media', 'Requests, read state, realtime recovery, and member controls'],
    remaining: [],
  },
  {
    id: 'public-commerce', label: 'Public & Commerce', status: 'complete', progress: 100,
    shipped: ['Home, pricing, trust, and authentication surfaces', 'Creator identity, storefronts, offers, payouts, and analytics', 'Marketplace and entitlement-aware access'],
    remaining: [],
  },
  {
    id: 'sports-social', label: 'Sports × Social', status: 'complete', progress: 100,
    shipped: ['MLB and NFL entity cards', 'Dugout and Sideline sharing', 'Market moments, watchlists, matrices, game rooms, and exact-state handoff'],
    remaining: [],
  },
  {
    id: 'quality', label: 'Quality & Release', status: 'active', progress: 86,
    shipped: ['Production contract suite', 'Accessibility and responsive browser budgets', 'Feature gates, telemetry, health reporting, and branded recovery states'],
    remaining: ['Live visual-regression sampling across authenticated routes', 'Interaction telemetry review on real traffic', 'Final cross-device polish pass'],
  },
]

export function roadmapCompletion() {
  return Math.round(PRODUCT_ROADMAP_PHASES.reduce((sum, phase) => sum + phase.progress, 0) / PRODUCT_ROADMAP_PHASES.length)
}
