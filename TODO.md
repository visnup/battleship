# TODO

## Check the model

- [x] Check card values and rent tables against the physical cards.
- [x] Settle what the sheet leaves open (CLAUDE.md's "Interpretations"). Hasbro has no FAQ, so
      `sensitivity.ts` runs both readings of each: none favors a seat, and only no-reshuffle
      changes how games go (`README.md`).
- [x] An engine: deal, turns, payments, Just Say No chains, and a heuristic player (`game.ts`).
- [x] Whole-game strategies head to head (`strategies.ts`).
- [x] A better `defaultPolicy`, from playouts (`decisions.ts`, `variants.ts`, `order.ts`):
      charge, then bank, then lay properties down; never build; aim one-player charges at whoever has to pay in property. Against it,
      the first one wins 10 points less at 2 players and a third fewer games at 5.
- [ ] Speed up playouts. A 5-player game with one playouts player takes about 10s: it makes
      ~17 decisions of ~14 legal moves, each played out on 80 deals, so ~19,000 rollouts a game
      (as many at 2 players: more decisions, fewer moves). A plain game is 1.5ms. In order:
      - The new `inProperty` target calls `leader` for every color and rent card in `charge`,
        and `leader` scores every player's colors. `lead`, `fullColors` and `progress` are now
        about 40% of the profile. Score the leader once per call.
      - Spend deals where they decide something: play every move on 10–20 deals, drop the
        ones clearly behind, and give the rest the remaining deals (successive halving).
      - Fewer moves: Forced Deal lists every take × give, and many moves are the same up to
        which identical card or which seat.
      - Memoize `fullSets` and `progress` per player, keyed on a counter bumped whenever their
        table changes. Or make `props` copy-on-write (replaced, never edited; `arrange` and
        moved wilds would make new `Placed`s) and key a `WeakMap` on the array. Plays stay
        mutable: copying state on every play would cost more in garbage than it saves.
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
