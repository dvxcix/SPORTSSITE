# HR Mechanics Engine

The HR Mechanics Engine is an Ultimate-only Research view that ranks all 18 hitters using measured MLB swing formation, contact quality, trajectory, rolling change and opposing-starter damage shape.

## Evidence boundary

- SlipSurge MLB observations are the player-level evidence: bat speed, attack angle, swing length, swing-path tilt, attack direction, exit velocity, launch angle, barrels, blasts, on-time contact, squared-up contact, pull-side air contact and pitch-by-pitch starter outcomes.
- Driveline OpenBiomechanics is a population calibration source. Its anonymous laboratory swings calibrate observable bat-to-ball transfer and carry relationships.
- Pelvis, torso, wrist, force-plate or motion-capture values are never imputed as measurements for MLB players. Those variables remain research context only until a measured player-level source exists.
- The UI's confidence value describes observable coverage and sample depth. It is not a home-run probability.

## Calibration provenance

- Repository: <https://github.com/drivelineresearch/openbiomechanics>
- Revision: `ba585d40fa3b3260c16fc618892ec0a0d87d37a4`
- Runtime artifact: `src/data/biomechanics/openbiomechanics-hitting-priors.json`
- Artifact builder: `scripts/build-openbiomechanics-priors.mjs`
- License note: licensed use; upstream public data is CC BY-NC-SA 4.0 and code is MIT.

The generated artifact contains coefficients, sample counts, validation errors and provenance only. Raw OpenBiomechanics files are not committed to SlipSurge.

## Validation

Models are cross-validated by athlete group so swings from one athlete do not appear in both training and validation folds.

- Exit-velocity transfer: 677 swings, 4.7 mph grouped-athlete MAE.
- Carry model: 604 tracked contacts, 23.6 feet grouped-athlete MAE and 0.914 R-squared.

Run `npm run test:hr-mechanics` after regenerating the artifact.

## Pregame integrity

- Batter rolling windows come from `dugout_statcast_precomputed` for the selected date and opposing pitcher hand.
- Opposing-starter pitch logs are filtered to `game_date < selected game date`.
- The engine never reads postgame outcomes while producing a pregame score.
- Every output identifies the selected rolling window and source-through date.

## Score composition

The complete-game readiness index combines seven transparent components:

1. Power formation: bat speed, blast rate, squared-up rate and hard-swing rate.
2. Transfer efficiency: measured exit velocity compared with the calibrated bat-speed/attack-angle expectation.
3. Plane match: attack angle, ideal-angle frequency and swing-path tilt.
4. Timing: on-time rate, miss distance and squared-up rate.
5. Trajectory: barrels, hard-hit rate, pull-side air contact and calibrated carry.
6. Pitcher breakdown: starter HR, barrel, hard-hit and fly-ball rates to the hitter's batting side.
7. Trend: selected L1/L3/L5/L10 mechanics relative to the player's season baseline.

The ranking is descriptive mechanics intelligence. It does not claim deterministic outcomes and does not replace the market, matchup or odds-movement tools.

## Runtime and cache

`GET /api/research/mechanics` is Ultimate-gated. Server-only snapshots are keyed by date, game, rolling window, model version and lineup signature. Pregame snapshots refresh after 20 minutes or when the lineup/pitcher signature changes. Started and final games retain their frozen snapshot.
