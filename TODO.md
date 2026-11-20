# TODO

## Check the model

- [x] An engine: deal, tricks, the magenta 5, scoring, four hands, a heuristic player (`game.ts`).
- [x] Tests of the booklet's rules and its scoring example (`game.test.ts`).
- [x] A fast engine, 2026-11-19: 0.47 ms a default game, from 3.0 (shared plays, `top()`, loops).
- [x] Playouts to the end of the hand, scored by `chance` (`scripts/chance.ts`), 2026-11-19: 32
      deals win 96.6% at 3 players and 92.1% at 4 against the default, more than 32 full-game
      playouts (95.3%, 82.4%), at about a quarter of the cost.
- [ ] A better `defaultPolicy`, from playouts (`decisions.ts`, `variants.ts`). The default is
      weak: 16-deal hand playouts win 94.9% and 86.1% against it.
- [x] Learn a play scorer from playouts, as in hilt (`dataset.ts`, `learn.py`, `learned.ts`),
      then rounds of it on learned players' games (`round.sh`, `status.ts`), 2026-11-20: round 0
      wins 87.0% and 79.6% against the default; rounds 1–4 each beat the one before by 2 to 15
      points; rounds 5–7 by 0 to 1.5.
- [x] Rollout models of 50 trees and 31 leaves, 2026-11-20: a learned game at 8 times the
      default's cost, where 200 trees of 63 were 50 times.
- [x] Headroom, 2026-11-20: 16-deal hand playouts among round 6's rollout players lose to round 6
      (25.3% at 3 players, 17.4% at 4), so the labels, not the model, cap it.
- [x] Card counting features (version 2), 2026-11-20: round 7, on its own round's games, ties
      round 6, which had six rounds' (+0.2 and +1.0).
- [x] Refit `chance` to learned players' games, 2026-11-20: a chip is worth 40–60% more there.
      Round 8 is the first labeled with it.
- [x] Round 8 didn't gain (+0.2, +0.8 against round 7). Refit to rounds 7–8 with 1,500 trees
      of 127 leaves, it beats round 8 by 1.8 and 0.5, so the model was some of the limit; that
      bigger model is `model-r8.json` now (the first fit is `model-r8small.json`).
- [ ] Round 9: bigger trees, and labels from playouts two hands deep (`HANDS=2`). Stopped
      2026-11-20 with `dataset/data-r9/` holding all 12,000 3-player games and a partial start
      of the 4-player ones. Labeling two hands deep runs about 4.5 times slower than one, so the
      4-player games need about 2 hours and would overrun the default `HOURS=3`. To resume, rerun
      the 4-player games (`dataset.ts --players 4`, with round.sh's other flags), then train and
      compare as round.sh does.
- [ ] If that doesn't gain: full-game playouts (no `chance`), or the full model inside the
      playouts on fewer deals.

## Analysis

- [ ] Who wins by seat, and how often hands bust or hit 25.
- [ ] When to play a card as a magenta 5.
- [ ] Rule readings: `tiesLow` both ways (`scripts/rules.ts`).

## Online

- [x] Play online with bots, as in hilt (`replay.ts`, `convex/`, `src/components/`), at a round
      table.
- [ ] The Hard bot on the learned model once one beats playouts, and in the review.
- [ ] Deploy.
