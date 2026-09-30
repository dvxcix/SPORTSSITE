# NFL availability eligibility

Confirmed Out, inactive, DNP, suspended and reserve designations no longer
participate in Sideline MM ranks, top-score highlights, matrices or Slate Edge.
Board and prop-ladder rows remain visible, ordered below eligible players, with
struck-through names and availability labels. Questionable/doubtful players are
not automatically ruled out. Score formulas and weights are unchanged.

Market Story retains the selected game's latest known availability while changing
prices. Current roster reserve status is not applied retroactively to past dates;
game-specific designations remain authoritative for those games.

Verification: 22 targeted tests (availability, highlights, contextual scores,
matrices, ladders, props) and worktree-aware TypeScript check passed.

Limitations: this gates the statuses received from the existing designation and
roster feeds; it does not establish that every real-world injury is present or
fresh in those feeds. No new injury provider was added. Live authenticated visual
verification and a league-wide feed freshness audit remain unverified.
