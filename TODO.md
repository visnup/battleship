# TODO

- Commit, then a GitHub repo and, like magical-athlete, a Hugging Face dataset of `results/`.
- A shooter that also fires around each sunk ship. The README guesses it punishes clustering and
  would move the equilibrium; untested.
- Tuned posterior: give `posterior` a placer's habits as its prior, by sampling fleets from
  `placements.parquet` instead of uniformly. Is it better than tuned density against edges and
  cold?
- Adaptive in the matrix and equilibrium. Its worst case (45.7) already beats the equilibrium's
  46.2; what does the hider's best mix look like against it?
- Cheaper probing: score cells by hit chance plus a little information about the habit, rather
  than information alone, which cost 1–9 shots.
- Lookahead. Greedy hit-chasing and information-seeking tie; does a two-shot lookahead that
  minimizes expected misses beat both, or is greedy close to optimal?
- Speed up `posterior` (it's ~1.7 s a game at 1,000 samples) so it can join the full matrix.
- A placer that searches for fleets density finds last, rather than the coldest of 100 uniform
  ones, and how a tuned shooter answers it.
- Rule variants: ships may not touch, sinks not announced (which breaks density's sink
  resolution), and Salvo (a shot per ship still afloat).
- Learning across a series: a shooter that picks up an opponent's habit over n games, and how
  many games it takes.
