# TODO

## Check the model

- [x] Check card values and rent tables against the physical cards.
- [ ] Settle what the sheet leaves open (CLAUDE.md's "Interpretations") from Hasbro's FAQ where it
      says, else run both readings. Biggest unknowns: Just Say No on your own turn as a play,
      stacking Double the Rent, houses and hotels when their set breaks, and wild-only sets.
- [x] An engine: deal, turns, payments, Just Say No chains, and a heuristic player (`game.ts`).
- [ ] A better player than `defaultPolicy`. Its choices are guesses: when to bank actions instead
      of playing them, when to hold Just Say No, which property to pay with. Playouts, like
      magical-athlete's, would show how far it is from good play.
- [ ] Log some real games and compare: game length, first-player advantage.

## Analysis

- [ ] Who wins: seat order and player count (2 to 5).
- [ ] What each card is worth: played as an action, banked, or held for Just Say No.
- [ ] Bank or build: how much money to keep before laying down properties.
- [ ] Which colors to chase, given rent, set size and the wilds that cover them.
- [ ] How long games last, and how often the draw pile runs out.
