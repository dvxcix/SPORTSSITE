# Statcast data integrity

SlipSurge treats `player_pitch_log` as the canonical event ledger for every
tracked MLB pitch and batted ball. Derived feeds may enrich an event, but they
must never create, remove, or reclassify a canonical event.

## Provenance rules

- Baseball Savant's date-level details export supplies the canonical pitch
  rows, pitch results, batted-ball measurements, bat tracking, swing path and
  spray coordinates.
- MLB's official schedule independently verifies that every final game has a
  canonical pitch log. The stored `games` table is checked separately so one
  failed source write cannot hide another.
- MLB Gameday supplies live contact while a game is in progress. Savant
  replaces that temporary live representation after the postgame sync.
- `player_home_run_events` and `near_hrs` are enrichment sources for park
  context and near-home-run metadata. Their absence never removes a home run
  from the canonical ledger.
- A source-provided value must survive into its typed database column. A value
  that the source did not track remains `null` and renders as unavailable. It
  must never be fabricated or converted to zero.

## Continuous audit

`/api/cron/statcast-integrity-check` runs daily after ingestion. It records a
row in `statcast_integrity_runs`, appears in Admin > Pipeline health, and checks:

1. Full-season pitch, game, fair-ball and home-run counts.
2. Home-run and in-play classification consistency.
3. Terminal-event descriptions and fair-ball result classification.
4. Every source-provided raw field against its materialized typed column.
5. Stored schedule coverage and suspiciously short game logs.
6. Final-game coverage against MLB's official schedule.
7. Optional home-run enrichment coverage, including inside-the-park events.
8. Freshness of every current Statcast category sync.

A real integrity failure sends the existing pipeline-health Discord alert and
the branded admin email. Identical failures are fingerprinted and debounced.

## Importer contract

Production, historical backfill, manual recovery and diagnostic importers must
materialize the same fields. Run:

```bash
npm run test:statcast-mappers
```

This test fails when one importer drops a field that another importer stores.

## Consumer requirements

- Queries that can exceed PostgREST's 1,000-row response cap must paginate in
  a deterministic order.
- Actual home-run histories come from `player_pitch_log.is_home_run`; optional
  Savant details are matched afterward.
- Spray charts plot only source-provided locations. Coordinate-less events
  remain in the canonical event ledger and are reported by the audit as source
  unavailable rather than silently displayed at a fabricated location.
