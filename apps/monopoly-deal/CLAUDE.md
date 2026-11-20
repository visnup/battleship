# monopoly-deal

A simulator of Hasbro's Monopoly Deal card game, in the vein of `../../../magical-athlete`. Node 26 (`.node-version`) runs
the TypeScript directly, and the engine has no dependencies.

The rules are the 2023 US edition's sheet (G0351, `rules/g0351.pdf`), which settles three
things the 2014 sheet (B0965, `rules/b0965-*.jpg`) left open or read otherwise. Neither is
committed. Most of `README.md` was measured under B0965; switching changed the first player's
share by at most 0.4 points and games by 0.1 turns, so it wasn't rerun. The deck in
`src/cards.ts` follows B0965's contents list (G0351's has none), with values and rent tables
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
  `builder` plays roughly like the first `defaultPolicy`. `playouts` plays moves out on copies
  with the cards it can't see reshuffled, for two rounds, then scores the board with `chance`.
  `moves` in `game.ts` lists every legal move. `scripts/chance.ts` fits `chance`'s weights to
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
- `scripts/overrules.ts`: where a model's pick differs from the default's on a dataset's
  held-out decisions, grouped by what each picks, with the stored value gained. It found
  "properties before wilds" in round 4's model.
- `scripts/pay.ts` and `scripts/sayno.ts`: playouts at each of the default player's payments and
  Just Say No decisions, found by replaying the game from its seed (`scripts/midturn.ts`), since
  they come mid-turn and a copy can't play on from there.
- `scripts/dataset.ts`: every move decision of default games, with each move's two-round
  playout value, as JSONL shards in `dataset/data/` (not committed), or `--out`. With `--model`
  the learned player plays the games, and with `--top` only its top moves are played out.
  `uv run dataset/parquet.py` joins them into Parquet, and `dataset/README.md` is the Hugging
  Face dataset card. Publish with
  `uvx --from huggingface_hub hf upload visnup/monopoly-deal dataset . --repo-type dataset --include README.md --include 'data/*.parquet'`.
- `learned.ts`: the learned player, and the features it scores moves by. `scripts/learn.ts
  extract --data --features` turns dataset shards into features; `uv run scripts/learn.py
  [trees] [out] [features directories…]` fits LightGBM trees (needs `brew install libomp`),
  adopted as `src/packed/model.ts`, which the `playouts` strategy uses to pick the 5 moves it plays out, and
  `uv run scripts/learn_mlx.py` a network on the GPU. Both read the features through
  `scripts/shards.py`, holding out the last directory's last 8 shards a player count.
  `scripts/learn.ts --model` plays one head to head, and `scripts/compare.ts a.json b.json`
  plays two models on the same deals. Each round of training on stronger play lives in
  `dataset/data-rN/`, `features-rN/` and `model-rN.json`, and `scripts/round.sh N` runs the
  next one (its header lists the knobs and stages) after a smoke test of itself, writing its
  log, `run.json` (the knobs and stages) and `events.jsonl` (each stage's start and end) to
  `dataset/rN/`. Launch it bare: anything a round needs before or after belongs in it as a
  stage, not chained around it. Rounds 0 to 8's data is on
  Hugging Face as `rounds/rN.tar.zst` (`tar -cf - -C dataset data-rN | zstd -9`), and only
  rounds 6 on are still on disk. Don't edit `src/` or what
  it imports while a round runs: its workers load those files. `STRONG=200` labels
  it by playouts among learned players (`dataset.ts --strong`), and `node scripts/status.ts`
  serves the newest round's progress and ETA at localhost:3011, from those two files.
  `scripts/field.ts` plays one player against learned players, and
  `scripts/plan.ts` tests looking ahead to the end of the turn.
- `trees.ts` flattens LightGBM's trees into typed arrays and packs them as base64;
  `scripts/pack.ts` writes a model to `src/packed/`, which `learned.ts` reads by default and
  `hard.ts` imports for the online game's hard bots without a file system. Rerun it after
  retraining a model. The models' JSON stays in `dataset/` (`model-rN.json`, `model-pay.json`,
  `model-sayno.json`, `model-discard.json`), out of git.
- `paying.ts`: the ways to pay worth considering, and each as numbers. `scripts/paydata.ts`
  plays each out (in `dataset/pay/`), `learn.py … dataset/pay` fits `src/packed/pay.ts`, and
  `paid()` in `learned.ts` pays by it, for the learned player and `playouts`.
- `refusing.ts`: whether to Just Say No, as numbers, the same way. `scripts/saynodata.ts` plays
  out both answers at every chance (in `dataset/sayno/`), `learn.py … dataset/sayno` fits
  `src/packed/sayno.ts`, and `said()` in `learned.ts` answers by it.
- `discarding.ts`: what to discard past 7, as numbers, the same way. `scripts/discarddata.ts`
  plays out each discard (in `dataset/discard/`), `learn.py … dataset/discard` fits
  `src/packed/discard.ts`, and `discarded()` in `learned.ts` discards by it.
- `memory.ts`: card memory, what a player hasn't seen yet, appended to the move, Just Say No and
  discard numbers. `scripts/memory.sh` refit the last two with it.
- `scripts/cards.ts`: each card's value, as the wins one more copy in an opening hand adds.
  A card that's worth less than nothing shows where the default player misplays it.
- `sim.ts`: quick Monte Carlo. `node scripts/sim.ts --n 100000 --players 4` prints wins by seat;
  `--log` prints every play and `--csv` a row per game, both on one core with `--seed`.
- `sensitivity.ts`: each game played as read and with one `Rules` flag flipped, from the same
  seed, for the "Rule readings" section of `README.md`.
- `kit/parallel.ts` and `worker.ts` (`../../packages/kit`) split a script's games into seeded
  chunks across cores, so results don't depend on the core count. Scripts guard their main code
  with `if (import.meta.main)`.
- `scripts/charts.ts` draws `charts/*.svg` from the tables in `README.md`, with Observable Plot
  and jsdom. Rerun it after updating a table.
- `node --test 'src/*.test.ts'` runs `cards.test.ts`, the contents list, `game.test.ts`, the
  sheet's rules and the default player's, and `replay.test.ts`. `pnpm test` runs those, then
  Playwright.
- `TODO.md` is the plan: checking the model first, then the analysis.
- `README.md` is what the simulator has shown so far.

## Long runs

Anything that takes more than an hour (a round, a dataset, a big table) gets these, so a
mistake costs minutes, not the night:

- **A smoke test first:** the whole pipeline at a tiny size (a few dozen games, 2 deals), end
  to end, before the real run starts. `round.sh` does this; 2026-11-18 it caught a
  hard-coded shard count and an exit trap that failed the script, both of which would only have
  broken after hours.
- **Progress in a log file:** a line at least every 10 minutes, with what's been written so far,
  appended to `dataset/rN/log.txt` (`round.sh` does this during the data step), so a stall shows.
- **A status page:** `node scripts/status.ts` at localhost:3011, with a bar per stage and an ETA
  from the recent rate. Open it in the browser pane. It reads only what the run wrote for it
  (`run.json`, `events.jsonl`), so a run it can't show is missing those, not misparsed.
- **Timeouts sized to the run** (`HOURS=` for `round.sh`'s data step), and a timing run on a
  sample first: learned-player rollouts were 30–60× the default's, not the 9–20× measured
  earlier for small models inside quick playouts.
- **Nothing in `src/` changes** while it runs, unless the change can't alter results.

## Playing online

A Next.js (pages router) and Convex app laid out like `../poker`: `pnpm dev` runs both, against
the Convex dev deployment in `.env.local`. `vercel.json` deploys Convex to production as part of
Vercel's build, so a local `pnpm build` never does. Other players' hands aren't hidden from
their browsers; it's for friends.

- `replay.ts`: a game is its seed and every decision made in it, and its state is the game
  replayed through them, stopped at the next decision nobody has made (`Prompt`). Decisions
  (`Choice`) name cards by position, and a move is only taken if `moves()` lists it. A bot
  seat names its kind: `builder` (Easy), `default` (Medium) or `learned` (Hard, `hard.ts`).
- `convex/`: `players` is poker's join and ping. `games` holds the seed, first player, seats and
  the deck as dealt; `decisions` every choice in order, whether a bot made it, and every hand at
  the time. `games.decide` checks a choice by replaying with it, then plays the bots up to the
  next person. Clients replay the log themselves.
- `review.ts` plays out every move a player could have made at each of their plays, on 400
  deals (100 with Hard bots) like the `playouts` strategy but with each bot at its level, for
  the "How you played" report at a game's end. Payments, Just Say No and discards too, up to 8
  ways on a quarter of the deals, each a replay of the game to that moment, as
  `scripts/midturn.ts` does. `Review.tsx` splits it across a web worker per core
  (`review.worker.ts`). The Hard bot's pick each play is compared with, and a Hard bot's plays
  in the playouts, come from `src/packed/light.ts`, a 200-tree model
  (`node scripts/pack.ts dataset/model-r10-200.json src/packed/light.ts`), the only model a
  browser loads; the Hard bot itself plays on Convex.
- `src/pages/` and `src/components/`: `Game` joins and shows the lobby, `Board` the table and
  the prompt. Playwright specs sit next to components and need `pnpm dev` running.
  `src/streets.ts` gives each property in an online game its street name, and `kit/words.ts`
  names new tables.
- Prettier is 220 wide, to match the engine.

## Rules worth knowing

Some of these differ from house rules and other editions:

- A two-color Rent card charges every other player; the multicolored one charges one player.
- Overflow from the 7-card hand limit goes on the discard pile (`overflowToPile`; B0965 put it
  under the draw pile).
- An empty hand draws 5 at the start of a turn instead of 2.
- No change is given. Payment comes from your bank and properties, the payer's choice, and
  properties paid go into the receiver's collection.
- The two multicolored Property Wild Cards are worth nothing and can't be used to pay.
- Properties, wilds included, can only be rearranged on your own turn, and a win is only declared
  on your own turn.
- A house needs a full set, a hotel needs a house, and neither goes on railroads or utilities.
- Sly Deal and Forced Deal can't take a card from a full set; Deal Breaker takes a whole full set.
- Just Say No cancels any action against you and can itself be cancelled by another. On your
  own turn it counts as one of your three plays (`noIsPlay`).
- A house or hotel on a set that's no longer full is discarded (`stranded`).

## Interpretations

- A win is checked at the start of your turn, after wilds are rearranged, and after each play.
Hasbro publishes no FAQ, and fan sites disagree, so each of these that's a `Rules` flag is
measured both ways in `README.md`.

- Double the Rent counts as a play, and two can go on one Rent card, for 4× rent (`doubles`).
- Deal Breaker takes the set's house and hotel with it (`breakerTakesBuildings`), as G0351's
  card says. A house or hotel paid as money goes to the receiver's bank.
- Extra properties of a color past a full set start a second set. Sly Deal and Forced Deal can
  take one of those.
- A set of only multicolored wilds isn't full (`Rules.wildOnlySets`).
- When the draw pile runs out, the play pile is shuffled into a new one (`Rules.reshuffle`).
  Neither sheet says; it's our house rule, and without it a third of 5-player games run dry.
- A game with no winner after 200 turns counts as `stalled`.
