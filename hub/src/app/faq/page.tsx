import { InfoPageShell, Section } from '@/components/marketing/InfoPageShell'

export const dynamic = 'force-static'

const FAQS: { q: string; a: React.ReactNode }[] = [
  { q: 'Is SlipSurge a sportsbook? Can I place real bets here?', a: 'No. SlipSurge is a social platform for sharing and following picks — we never accept wagers or hold funds for betting. Place actual bets through a licensed sportsbook in your jurisdiction.' },
  { q: 'What are the wager/payout numbers on a pick or parlay?', a: 'Self-reported by the user who posted it, using the calculator built into the composer. They\'re not verified against, or connected to, any real sportsbook account.' },
  { q: 'How does parlay grading work?', a: 'Each leg grades independently against the final box score. A parlay only shows WIN once every leg has graded — any single loss fails the whole thing, all-push is a push, otherwise it\'s a win, same as a real sportsbook slip.' },
  { q: 'Why can I only parlay legs from the same sportsbook?', a: 'Real books only pay out combined odds within their own platform — you can\'t parlay a leg priced on FanDuel with one priced on BetMGM. SlipSurge enforces the same rule so the combined odds shown are actually correct.' },
  { q: 'What\'s free vs. what requires a paid tier?', a: 'Creating an account, browsing the feed, and managing your own profile are always free. The community (posting, DMs, groups), player research, live scores, and our analytics tools (Weather Lab, Pitcher Report, Slate Breakdown, The Dugout) are unlocked across our Basic, Advanced, and Ultimate tiers — see the Pricing page for the full breakdown.' },
  { q: 'How do creator subscriptions work?', a: 'Approved creators can offer paid subscription tiers; SlipSurge takes a platform fee and the rest pays out to the creator via Stripe Connect on Stripe\'s own payout schedule.' },
  { q: 'How do I delete my account?', a: 'Contact support (see the Support page) and we\'ll process the deletion.' },
]

export default function FaqPage() {
  return (
    <InfoPageShell title="FAQ">
      {FAQS.map(f => (
        <Section key={f.q} title={f.q}>{f.a}</Section>
      ))}
    </InfoPageShell>
  )
}
