# monopoly-deal

A simulator of Hasbro's Monopoly Deal card game, in the vein of `../magical-athlete`. Node 24 runs
the TypeScript directly, and the engine has no dependencies.

The rules are the 2014 US edition's sheet (B0965), photographed in `rules/b0965-*.jpg` (not
committed). The deck in `src/cards.ts` follows its contents list, with values and rent tables
from photos of one card of each property color and each wild (`rules/properties.jpg`,
`rules/wilds.jpg`).

- `cards.ts`: the 106 playing cards.
- `game.ts`: the engine. `Game` deals and plays one game; `run()` plays it out. A `Policy` makes
  every choice (what to play, how to pay, when to Just Say No, what to discard), and
  `defaultPolicy` is a hand-written player: complete a set, Deal Breaker, Sly Deal, lay down
  properties, build, charge rent, then bank. `arrange` moves wilds on your turn to make the most
  full sets. `Rules` holds the readings the sheet leaves open.
- `sim.ts`: quick Monte Carlo. `node scripts/sim.ts --n 100000 --players 4` prints wins by seat;
  `--log` prints every play and `--csv` a row per game, both on one core with `--seed`.
- `parallel.ts` and `worker.ts` are magical-athlete's: they split a script's games into seeded
  chunks across cores, so results don't depend on the core count. Scripts guard their main code
  with `if (import.meta.main)`.
- `node --test` runs `cards.test.ts`, the contents list, and `game.test.ts`, the sheet's rules.
- `TODO.md` is the plan: checking the model first, then the analysis.

## Rules worth knowing

Some of these differ from house rules and other editions:

- A two-color Rent card charges every other player; the multicolored one charges one player.
- Overflow from the 7-card hand limit goes to the bottom of the draw pile, not a discard pile.
- An empty hand draws 5 at the start of a turn instead of 2.
- No change is given. Payment comes from your bank and properties, the payer's choice, and
  properties paid go into the receiver's collection.
- The two multicolored Property Wild Cards are worth nothing and can't be used to pay.
- Properties, wilds included, can only be rearranged on your own turn, and a win is only declared
  on your own turn.
- A house needs a full set, a hotel needs a house, and neither goes on railroads or utilities.
- Sly Deal and Forced Deal can't take a card from a full set; Deal Breaker takes a whole full set.
- Just Say No cancels any action against you and can itself be cancelled by another.

## Interpretations

- A win is checked at the start of your turn, after wilds are rearranged, and after each play.
- Just Say No doesn't count as a play, on your turn or anyone's.
- Double the Rent counts as a play, and two can go on one Rent card, for 4× rent.
- Deal Breaker takes the set's house and hotel with it. A house or hotel paid as money goes to
  the receiver's bank. One left on a set that's no longer full stays, adding no rent until the
  set is full again.
- Extra properties of a color past a full set start a second set. Sly Deal and Forced Deal can
  take one of those.
- A set of only multicolored wilds isn't full (`Rules.wildOnlySets`).
- When the draw pile runs out, the play pile is shuffled into a new one (`Rules.reshuffle`).
- A game with no winner after 1,000 turns counts as `stalled`.
