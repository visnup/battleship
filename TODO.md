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
- [ ] Speed up playouts until the strategies table's playouts row is good to ±1 point in 15
      minutes (30 at most). That's about 32,000 playouts games: 6,400 at 5 players, 10,000 at
      2. On 20 cores at 3.5s a game it takes about 93 minutes, so it needs 3–6× more.
      - [x] Memoize `arrange`, score each player once in `leader` and `inProperty`, and pick
            the any-color Rent's target once per amount: 1.75× with every result unchanged
            (250bb75).
      - [x] One move per wild placed (`arrange` re-colors it after every play) and per
            identical card taken or given: about 10%, same results in the benchmark.
      - [ ] Racing: play every live move on 8 more shared deals at a time, and drop one once
            it's 2 standard errors of the paired difference behind the leader, up to 80 deals.
            By regret (each method's pick, valued on 1,000 independent deals, against the
            best move, at ~450–600 sampled decisions): 1.19 points a decision on 656 rollouts
            at 5 players, against 1.26 on 985 for 80 deals each; 0.94 on 545 against 0.84 on
            683 at 2. z = 1.5 is 1.9× cheaper at 5 players at the same regret, but worse at 2.
            Successive halving only matched 80 deals each at equal cost.
      - [ ] Cheaper rollouts: `arrange`'s key and search, then `fullSets` and `pay`, lead the
            profile. Memoize `fullSets` and `progress` per player, keyed on a counter bumped
            whenever their table changes, or make `props` copy-on-write (replaced, never
            edited; `arrange` would make new `Placed`s) and key a `WeakMap` on the array. Plays
            stay mutable: copying state on every play would cost more in garbage than it saves.
      - [ ] If that's still over 30 minutes: rollouts cut off after a few turns and scored from
            the board. Much faster but a weaker player; check it by regret first.
      - Comparing playouts and the default on the same deals doesn't help: it cut variance
        2.3× for banker at 2 players, but made it worse for builder, which, like playouts,
        plays very differently from the default.
- [ ] Close more of the gap to playouts, still 7 to 16 points at 3–5 players. Done: placement
      (no pattern beat the default) and the any-color Rent (aim it, and Debt Collector, at
      whoever has to pay in property). Forced Deal's gap is real, about 1.6 points a game at 5
      players and mostly in what to take, but 15 rules for it didn't beat the default. Also
      untouched: when to hold Just Say No, and what to pay with.
- [ ] Test the table advice the default doesn't follow yet (web search, 2026-11-15):
      - Don't complete a set right away, so a Deal Breaker can't take it: hold the card that
        completes a set unless it wins the game.
      - Keep a Just Say No for a Deal Breaker instead of spending it on rent or Debt Collector.
- [ ] Playouts tie the default at 2 players (±4). Find out whether more deals per move or a
      better rollout player would help. A counterfactual-regret agent on a cut-down 2-player
      game ([arXiv 2510.25080](https://arxiv.org/pdf/2510.25080), code at monopolydeal.ai)
      reportedly wins about 75% against a heuristic player.
- [ ] Log some real games and compare: game length, first-player advantage. Needs real games.

## Analysis

- [x] Who wins: seat order and player count (2 to 5). Going first is worth 13.6 points at 2.
- [x] What each card is worth (`cards.ts`): Deal Breaker by far, then two-color Rents at big
      tables and Just Say No at small ones. Not split yet by whether it's played, banked or held.
- [x] Bank or build: never build, and bank about $10M before laying properties down.
- [x] Which colors to chase (`colors.ts`): the 2-card sets, especially dark blue.
- [x] How long games last, and how often the draw pile runs out.
- [x] Charts in `charts/` (`scripts/charts.ts`), drawn from the README's tables.
- [ ] How much is luck: how often the stronger player (playouts) wins against the default, by
      player count. Does skill matter more at 2 players or at 5?
- [ ] When a game is decided: win chances from the board (full sets, cards in hand, bank)
      round by round. How often does the leader after round 3 win, and do comebacks happen?
- [ ] Each card's value split by use: played, banked or held. Is a Rent card worth more as
      $1M early? Is a held Just Say No worth more than one played?
- [ ] Bank size: how much cash to keep against rent, and how often players pay in property
      instead. Charging whoever has to pay in property suggests an ideal cushion.
- [ ] Popular house rules, measured like the sheet's open readings in `sensitivity.ts`: Deal
      Breaker on any set, Just Say No unblockable, drawing 2 on an empty hand, no Forced Deal
      on full sets.
- [ ] Opening hands: which 5-card deals win, and whether any is worth a mulligan.
