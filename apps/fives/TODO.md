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
  - [x] `leadDown`, 2026-11-20, from `scripts/overrules.ts` on round 9: lead the highest card face
        down with 5+ to go. 65.3% and 49.4% against the previous default (40,000 games), 44.8%
        and 33.6% against the league.
  - [x] Trump first in `leadDown`, 2026-11-20: +8.3 and +11.3 points, +5.8 and +6.6 against the
        league.
  - [x] `take` waits when last early at 4 players, more than 12 from 25, 2026-11-20: +3.5 at 4
        players (40,000 games), +4.3 against the league, nothing at 3.
  - [x] Mine round 9 again against this default, 2026-11-20: its differences are spread under 1%
        of decisions each; the two screened (duck low when last, take high when second) lost.
  - [ ] Rerun the playouts rows of the README's players table against the new default (hours).
  - [x] Round 10, 2026-11-20, labeled with the new default's flag (`FROM=10`, `HANDS=2`, 1,500
        trees of 127 leaves): lost to round 9 (29.8%, 23.7%). Refit to rounds 7–10
        (`model-r10refit.json`) it ties round 9 (32.8%, 24.8%). Not adopted; rounds have stopped
        gaining.
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
- [x] Round 9, 2026-11-20: labels from playouts two hands deep (`HANDS=2`), 1,500 trees of 127
      leaves fit to rounds 7–9. +0.4 and +0.9 over round 8's refit, short of twice the noise, and
      91.0% and 88.6% against the default. Adopted; the 1,500-tree fit hadn't stopped improving.
- [x] What playouts beat round 9, 2026-11-20 (400 games at 4 players, against round 9 in every
      other seat, fair 25%): hand playouts among its rollout players on 16 deals win 16.4%, on 64
      deals 27.1%; full-game playouts on 16, 6.5%; hand playouts among its full model on 2 deals,
      3.0% (100 games), at 13 times a rollout game's cost. So more deals, not deeper or stronger
      playouts.
- [x] Round 11, 2026-11-20: labels on 64 deals, one hand deep, fit to rounds 10–11. Beats round
      10 (36.2%, 26.3%) and loses to round 9 (31.7%, 24.6%). Not adopted.

## Analysis

- [ ] Who wins by seat, and how often hands bust or hit 25.
- [ ] When to play a card as a magenta 5.
- [ ] Rule readings: `tiesLow` both ways (`scripts/rules.ts`).

## Online

- [x] Play online with bots, as in hilt (`replay.ts`, `convex/`, `src/components/`), at a round
      table.
- [ ] The Hard bot on the learned model once one beats playouts, and in the review.
- [x] Deploy, 2026-11-20: fives.visnup.com, from `main`.
