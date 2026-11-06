# TODO

- A Hugging Face dataset of `results/`, like magical-athlete's.
- Adaptive: a prior from real players' habits, once there are logged games, which would also say
  whether the five habits or the grid of dials fits them better.
- Cheaper probing: score cells by hit chance plus a little information about the habit, rather
  than information alone, which cost 1–9 shots.
- A shooter that also fires around each sunk ship, against clustering.
- Tuned posterior: give `posterior` a placer's habits as its prior. Is it better than tuned
  density against edges and cold?
- Lookahead. Greedy hit-chasing and information-seeking tie; does a two-shot lookahead that
  minimizes expected misses beat both, or is greedy close to optimal?
- Speed up `posterior` (it's ~1.7 s a game at 1,000 samples) so it can join the full matrix.
- A placer that searches for fleets density finds last, rather than the coldest of 100 uniform
  ones, and how a tuned shooter answers it.
- Rule variants: ships may not touch, sinks not announced (which breaks density's sink
  resolution), and Salvo (a shot per ship still afloat).
- Learning across a series: a shooter that picks up an opponent's habit over n games, and how
  many games it takes.
