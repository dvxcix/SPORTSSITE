import { InfoPageShell, Section } from '@/components/marketing/InfoPageShell'
import { MLB_HIBERNATING } from '@/lib/mlbOffseason'

export const dynamic = 'force-static'

export default function AboutPage() {
  return (
    <InfoPageShell title="About SlipSurge" subtitle="The social hub for sports & picks.">
      <Section title="What we're building">
        SlipSurge is a place to follow sports bettors the way you'd follow anyone else worth listening to — real
        graded records, real picks, real parlays, not screenshots that vanish the moment they're wrong. Post a pick,
        build a parlay with same-book odds and payout math built in, and follow cappers whose track record you can
        actually verify on their profile.
      </Section>
      {!MLB_HIBERNATING && <Section title="The Dugout">
        For MLB, SlipSurge goes deeper than a feed — The Dugout surfaces live odds deltas, Statcast splits, pitch-mix
        breakdowns, and opening-vs-current line movement across sportsbooks, all in one board.
      </Section>}
      <Section title="The Sideline · NFL">
        Follow NFL matchups, compare player props and ladders, and research the slate in The Sideline.
      </Section>
      <Section title="The Court · NBA">
        Compare NBA odds and alternate lines, explore player trends and defense by position, and build your research in The Court.
      </Section>
      <Section title="Your sports, together">
        Follow {!MLB_HIBERNATING && 'MLB, '}NFL and NBA teams and players, share picks and stories, and open live scores, box scores and play-by-play from one community. Ultimate includes {MLB_HIBERNATING ? 'both' : 'all three'} research workspaces.
      </Section>
      <Section title="Not a sportsbook">
        SlipSurge is a social and content platform. We don't accept wagers or process bets — any odds or payout
        numbers you see on a post are self-reported by the user who posted it. See our{' '}
        <a href="/responsible-gambling" style={{ color: 'var(--accent)' }}>Responsible Gambling</a> page for more.
      </Section>
    </InfoPageShell>
  )
}
