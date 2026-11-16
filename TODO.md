# TODO

## Check the model

- [x] Check card values and rent tables against the physical cards.
- [x] Settle what the sheet leaves open (CLAUDE.md's "Interpretations"). Hasbro has no FAQ, so
      `sensitivity.ts` runs both readings of each: none favors a seat, and only no-reshuffle
      changes how games go (`README.md`).
- [x] An engine: deal, turns, payments, Just Say No chains, and a heuristic player (`game.ts`).
- [x] Whole-game strategies head to head (`strategies.ts`).
- [x] A better `defaultPolicy`, from playouts (`decisions.ts`, `variants.ts`, `order.ts`):
      charge, then bank, then lay properties down; never build; aim at the leader. Against it,
      the first one wins 10 points less at 2 players and a third fewer games at 5.
- [ ] Close more of the gap to playouts, still 8 to 18 points at 3–5 players. `decisions.ts`
      points at which property or wild to lay down and as which color, the any-color Rent's
      color and target, and Forced Deal's target. Also untouched: when to hold Just Say No, and
      what to pay with.
- [ ] Playouts tie the default at 2 players (±4). Find out whether more deals per move or a
      better rollout player would help.
- [ ] Log some real games and compare: game length, first-player advantage. Needs real games.

## Analysis

- [x] Who wins: seat order and player count (2 to 5). Going first is worth 13.6 points at 2.
- [x] What each card is worth (`cards.ts`): Deal Breaker by far, then two-color Rents at big
      tables and Just Say No at small ones. Not split yet by whether it's played, banked or held.
- [x] Bank or build: never build, and bank about $10M before laying properties down.
- [x] Which colors to chase (`colors.ts`): the 2-card sets, especially dark blue.
- [x] How long games last, and how often the draw pile runs out.
