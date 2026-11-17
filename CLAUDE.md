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
  `defaultPolicy` is a hand-written player made of named rules, `STEPS`, tried in order, each
  with a comment on why it's there. `heuristic(...)` makes a player from any list of steps.
  `arrange` moves wilds on your turn to make the most full sets. `Rules` holds the readings the
  sheet leaves open. `clone()` and `run(move)` let a player play a move out on a copy.
- `strategies.ts`: whole-game strategies in `STRATEGIES`, like magical-athlete's `RACERS`: each
  has a comment saying how it plays and a short definition, mostly `STEPS` in another order.
  `builder` plays roughly like the first `defaultPolicy`. `moves` lists every legal move, for `random` and
  `playouts`, which plays each one out on copies with the cards it can't see reshuffled, for two
  rounds, then scores the board with `chance`. `scripts/chance.ts` fits `chance`'s weights to
  default-player games; refit them after changing `defaultPolicy`.
  `headToHead` seats one player against `defaultPolicy` everywhere else.
- Improving `defaultPolicy`, like magical-athlete's "Finding better choices":
  1. `scripts/decisions.ts` plays out every legal move at each of the default player's decisions
     and groups where playouts clearly disagree (rechecked on fresh deals, since the best of 30
     noisy estimates overstates its gain).
  2. Write the pattern as a variant in `scripts/variants.ts`, or reorder steps with
     `scripts/order.ts`, which moves one step at a time and keeps what wins at 2 and 5 players.
  3. Adopt it in `STEPS` if it beats the default beyond the noise (±0.3 points at 100,000
     games); the old behavior stays in `variants.ts` marked "(previous)".
  4. Rerun the README's tables, since every one is played by or against the default.
- `scripts/strategies.ts`: one player of each strategy against the default in every other seat,
  for the "Strategies" section of `README.md`.
- `scripts/colors.ts`: the colors of winners' and losers' full sets at the end of a game.
- `scripts/decided.ts`: after each round, how often the player ahead by `chance` wins.
- `scripts/payments.ts` and `scripts/openings.ts`: who pays what, and wins by opening hand.
- `scripts/strong.ts`: findings rechecked against quick playouts in every other seat.
- `scripts/pay.ts` and `scripts/sayno.ts`: playouts at each of the default player's payments and
  Just Say No decisions, found by replaying the game from its seed (`scripts/replay.ts`), since
  they come mid-turn and a copy can't play on from there.
- `scripts/dataset.ts`: every move decision of default games, with each move's two-round
  playout value, as JSONL shards in `dataset/data/` (not committed). `uv run dataset/parquet.py`
  joins them into Parquet, and `dataset/README.md` is the Hugging Face dataset card. Publish with
  `uvx --from huggingface_hub hf upload visnup/monopoly-deal dataset . --repo-type dataset --exclude '*.jsonl' --exclude '*.py'`.
- `learned.ts`: the learned player, and the features it scores moves by. `scripts/learn.ts
  extract` and `boards` turn dataset shards into features in `dataset/features/`;
  `uv run scripts/learn.py` fits trees to `src/model.json`, which the `playouts` strategy uses
  to pick the 5 moves it plays out. `scripts/learn_mlx.py`
  fits a network on the GPU to `dataset/mlp.json`, and `scripts/learn_value.py` a board score
  to `dataset/value.json` (neither committed). `--model` plays one head to head. Retrain after
  regenerating the dataset.
- `scripts/cards.ts`: each card's value, as the wins one more copy in an opening hand adds.
  A card that's worth less than nothing shows where the default player misplays it.
- `sim.ts`: quick Monte Carlo. `node scripts/sim.ts --n 100000 --players 4` prints wins by seat;
  `--log` prints every play and `--csv` a row per game, both on one core with `--seed`.
- `sensitivity.ts`: each game played as read and with one `Rules` flag flipped, from the same
  seed, for the "Rule readings" section of `README.md`.
- `parallel.ts` and `worker.ts` are magical-athlete's: they split a script's games into seeded
  chunks across cores, so results don't depend on the core count. Scripts guard their main code
  with `if (import.meta.main)`.
- `scripts/charts.ts` draws `charts/*.svg` from the tables in `README.md`, with Observable Plot
  and jsdom, the repo's only (dev) dependencies. Rerun it after updating a table.
- `node --test` runs `cards.test.ts`, the contents list, and `game.test.ts`, the sheet's rules
  and the default player's.
- `TODO.md` is the plan: checking the model first, then the analysis.
- `README.md` is what the simulator has shown so far.

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
Hasbro publishes no FAQ, and fan sites disagree, so each of these that's a `Rules` flag is
measured both ways in `README.md`.

- Just Say No doesn't count as a play, on your turn or anyone's (`noIsPlay`).
- Double the Rent counts as a play, and two can go on one Rent card, for 4× rent (`doubles`).
- Deal Breaker takes the set's house and hotel with it (`breakerTakesBuildings`). A house or
  hotel paid as money goes to the receiver's bank. One left on a set that's no longer full
  stays, adding no rent until the set is full again (`strandedToBank`).
- Extra properties of a color past a full set start a second set. Sly Deal and Forced Deal can
  take one of those.
- A set of only multicolored wilds isn't full (`Rules.wildOnlySets`).
- When the draw pile runs out, the play pile is shuffled into a new one (`Rules.reshuffle`).
- A game with no winner after 200 turns counts as `stalled`.
