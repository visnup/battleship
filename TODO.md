# TODO

## Check the model

- [x] Check card values and rent tables against the physical cards.
- [x] Settle what the sheet leaves open (CLAUDE.md's "Interpretations"). Hasbro has no FAQ, so
      `sensitivity.ts` runs both readings of each: none favors a seat, and only no-reshuffle
      changes how games go (`README.md`).
- [x] An engine: deal, turns, payments, Just Say No chains, and a heuristic player (`game.ts`).
- [x] Whole-game strategies head to head (`strategies.ts`).
- [x] A better `defaultPolicy`, from playouts (`decisions.ts`, `variants.ts`, `order.ts`):
      charge, then bank, then lay properties down; never build; aim one-player charges at whoever
      has to pay in property. Against it, the first one wins 10 points less at 2 players and more
      than a third fewer games at 5.
- [x] Speed up playouts until the strategies table's playouts row is good to ±1 point in 15
      minutes (30 at most). That's about 32,000 playouts games: 6,400 at 5 players, 10,000 at
      2. On 20 cores at 3.5s a game it took about 93 minutes. With what's checked below, 10,000
      games at each of 2–5 players (±1 everywhere) took 73 minutes on 2026-11-15, so it still
      needs 2.5–5× more.
      - [x] Memoize `arrange`, score each player once in `leader` and `inProperty`, and pick
            the any-color Rent's target once per amount: 1.75× with every result unchanged
            (250bb75).
      - [x] One move per wild placed (`arrange` re-colors it after every play) and per
            identical card taken or given: about 10%, same results in the benchmark.
      - [x] Racing: play every live move on 8 more shared deals at a time, and drop one once
            it's 2 standard errors of the paired difference behind the leader, up to 80 deals.
            By regret (each method's pick, valued on 1,000 independent deals, against the
            best move, at ~450–600 sampled decisions): 1.19 points a decision on 656 rollouts
            at 5 players, against 1.26 on 985 for 80 deals each; 0.94 on 545 against 0.84 on
            683 at 2. z = 1.5 is 1.9× cheaper at 5 players at the same regret, but worse at 2.
            Successive halving only matched 80 deals each at equal cost.
      - [x] Count without `filter`, pay without copying arrays, build `arrange`'s key without
            joins, and skip `arrange` after banking or Pass Go: 1.2× with every result
            unchanged. Garbage collection went from 16% of the time to 2%. Scoring `arrange`'s
            search incrementally was slower and broke ties differently.
      - [ ] Cheaper rollouts: `arrange`'s key and search, then `fullSets` and `pay`, lead the
            profile. Memoize `fullSets` and `progress` per player, keyed on a counter bumped
            whenever their table changes, or make `props` copy-on-write (replaced, never
            edited; `arrange` would make new `Placed`s) and key a `WeakMap` on the array. Plays
            stay mutable: copying state on every play would cost more in garbage than it saves.
      - [x] Rollouts cut off after two rounds and scored from the board (`chance`): 2.5× faster,
            and a stronger player, not a weaker one. By regret on the richer `chance`
            (2026-11-16, ±2 SE), 0.73 ± 0.12 points a decision against 1.21 ± 0.17 at 5
            players, and 0.54 ± 0.08 against 1.03 ± 0.14 at 2; paired on the same decisions,
            −0.48 ± 0.19 and −0.49 ± 0.16. One round was faster again but worse (0.88, 0.92). The row now takes 21.5 minutes, and playouts win 8 to 10 points more.
      - Comparing playouts and the default on the same deals doesn't help: it cut variance
        2.3× for banker at 2 players, but made it worse for builder, which, like playouts,
        plays very differently from the default.
- [ ] Learn a player from playouts. Tried 2026-11-16, not committed: a linear scorer over
      each move's kind and how it changes `features` for us and for opponents, fitted to
      two-round playout values (40 deals a move) at every decision of 4,000 default games.
      It lost to the default, 48.1% at 2 players and 17.4% at 5 (10,000 games). With a
      feature for "the default's move", so it only learns corrections, 47.5% and 18.4%
      (4,000 games). Four times the data didn't help, so the model is the limit.
      - [ ] Fit a nonlinear model (gradient-boosted trees or a small network, in Python via
            `uv`) on the same move features and playout values, and play it head to head. If
            it wins, distill readable rules from it for `STEPS`. Less noisy targets (more deals
            a move) are the other lever.
- [ ] Close more of the gap to playouts, now 12 to 23 points. `decisions.ts` and the rule
      screens still play each deal to the end; cut them off like playouts, which would make
      them faster and their picks better, then look for patterns again. Found, not adopted
      yet: banking Forced Deal in the first round, +0.35 to +0.4 points at 3–5 players and
      −0.3 at 2 (400,000 games). Adopt it, at 3+ players, with the next change that reruns
      the tables. Done: placement
      (no pattern beat the default) and the any-color Rent (aim it, and Debt Collector, at
      whoever has to pay in property). Forced Deal's gap is real, about 1.6 points a game at 5
      players and mostly in what to take, but 15 rules for it didn't beat the default. Also
      untouched: what to pay with. Saving Just Say No for a Deal Breaker loses; playouts at
      each Just Say No decision might still find a rule.
- [x] Test the table advice the default doesn't follow yet (web search, 2026-11-15): holding
      the card that completes a set, and keeping a Just Say No for a Deal Breaker. Both lose.
- [ ] Playouts win 62.1% at 2 players, 12 points over the default; playing to the end, they
      tied it. More deals per move still help, about 2 points each time they double: at 80,
      160 and 320, 43.1%, 45.7% and 47.2% at 5 players, and 60.2%, 60.7% and 62.1% at 2 (4,000
      games each, ±1.5). Two rounds is best at 80 deals; with fewer deals, fewer rounds win
      (at 16, one round 36.6% at 5 players, two 31.7%, three 26.4%), and stopping at the end of
      the turn is worse than the default at 2 players. Retuned on the richer `chance`
      (2026-11-16, 8,000 games, ±1.5): nothing beats 80 deals and two rounds within the
      30-minute row. One round at 160 deals is 0.6× the time and +1.3 at 5 players but −2.5 at
      2; two rounds at 160 is +1.7 and +1.5 at 1.5× the time; z = 1.5 gains nothing. A richer `chance` (sets half done, rent
      cards, cash and properties in hand) added 1.9 points at 2 players and 1.2 at 5. Still to
      try: more of that, and a better rollout player. A counterfactual-regret agent on a cut-down 2-player
      game ([arXiv 2510.25080](https://arxiv.org/pdf/2510.25080), code at monopolydeal.ai)
      reportedly wins about 75% against a heuristic player.
- [ ] Log some real games and compare: game length, first-player advantage. Needs real games.

## Analysis

- [x] Who wins: seat order and player count (2 to 5). Going first is worth 13.6 points at 2.
- [x] What each card is worth (`cards.ts`): Deal Breaker by far, then two-color Rents at big
      tables and Just Say No at small ones.
- [x] Bank or build: never build, and bank about $10M before laying properties down.
- [x] Which colors to chase (`colors.ts`): the 2-card sets, especially dark blue.
- [x] How long games last, and how often the draw pile runs out.
- [x] Charts in `charts/` (`scripts/charts.ts`), drawn from the README's tables.
- [x] How much is luck: playouts win 1.24 fair shares against the default at 2 players and
      2.16 at 5, so skill counts for more at big tables.
- [x] When a game is decided (`decided.ts`): the player ahead after round 3 wins 72% at 2
      players and 48% at 5. Comebacks last at 2 players and run out at 5.
- [x] Played or banked (`cards.ts`): every action card is worth far more played, except
      Forced Deal early at 3+ players. Holding one unplayed isn't measured: no player here
      reads another's hand, so a held card can't deter.
- [x] Paying (`payments.ts`): at 5 players the bank is down to $7.5M when charged, one payment
      in four costs property, and 72% of losers pay in property at least once.
- [x] Opening hands (`openings.ts`): action cards make a hand, and it matters more at big
      tables (0.61 to 1.41 fair shares at 5 players). The sheet has no mulligan.
