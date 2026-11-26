# Odds Board response time

26 November 2026. Branch `codex/odds-board-latency-20261126` starts at
production main `940132fd7227b19651a4caaccc65353b4dfb00e9`. The native
client changes live on `codex/ios-parity-20261125`.

On a signed-in iPhone 18 Pro Simulator, production returned the 25 November
NBA schedule in 0.7–0.8 seconds and the requested Odds Board in 4.9–5.2
seconds. The 26 November NFL schedule usually took 0.4–0.8 seconds and
the Odds Board took 2.0–6.9 seconds. These are HTTP response times. The
native client starts its NBA schedule and odds reads together.

- NFL reads the schedule and durable kickoff evidence concurrently. Legacy
  board version discovery uses one bounded key lookup and reads the saved
  payload in version order. Complete archived and current views use the
  same original evidence, with the same final kickoff validation.
- NBA reuses the exact schedule for its initial phase proof. Its earlier
  observed frame and eligible player artwork are resolved concurrently.
  The later phase and cutoff checks still read their existing sources.
- Route and production suites passed 303 checks. The NFL route fixture
  verifies one lookup and newest-first selection even when the storage
  result is returned in a different order. The NBA route fixture checks
  schedule reuse and verifies a new cutoff read still runs.
- Pending authenticated request timings from a deployment of this branch
  before marking the production latency issue resolved.
