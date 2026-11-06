# TODO

- A Hugging Face dataset of `results/`, like magical-athlete's.
- Density's runaway games: 16 of 250,000 took over 75 shots, mostly against clustered fleets.
  Replay one and check whether it's a wrong sink claim, then let density revisit its claims
  when no placement fits the ship left afloat. Adaptive and the tuned shooters inherit it.
- Adaptive:
  - A prior. It starts with the five habits equally likely, so its first shots lean to the
    edges, and that costs about a shot against uniform fleets. Try the best mix's prior (65%
    uniform), or real players' habits once there are logged games.
  - Its belief freezes once fewer than 20 of 20,000 sample fleets of every habit fit. More
    samples, or a per-habit likelihood that doesn't run out (`posterior` per habit), would keep
    it learning late in the game.
  - It ignores which ship sank and in what order, which `posterior` uses.
  - Real players aren't one of five habits. Habits as dials (edge-hugging, touching) to fit.
- Cheaper probing: score cells by hit chance plus a little information about the habit, rather
  than information alone, which cost 0–7 shots.
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
