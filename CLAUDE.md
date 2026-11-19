# hilt

A simulator of CMYK's Hilt card game (Magenta line, designed by Dominique Ehrhard), laid out
like `../monopoly-deal`. Node 26 (`.node-version`) runs the TypeScript directly, and the engine
has no dependencies. Hilt is for 3 to 6 players.

The rules are the How to Play booklet (`rules/hilt.pdf`, from BoardGameGeek), not committed.
Its last page has the card list and each fate card's rule.

- `cards.ts`: the 96 cards dealt (the Favor card never goes in the deck).
- `game.ts`: the engine. `Game` deals and plays one game; `run()` plays it out, and
  `run(move)` makes a move first, so a player can play a move out on a `clone()`. A battle is
  `begin()`, `step()` per turn and `settle()`. A `Policy` makes every choice (which chip, play or
  pass, whether to discard a hand of no force cards), and `defaultPolicy` is a hand-written
  player made of named rules, `STEPS`, tried in order, each with a comment on why it's there.
  `heuristic(...)` makes a player from any list of steps. `Rules` holds the readings the
  booklet leaves open.
- `strategies.ts`: whole-game strategies in `STRATEGIES`, each with a comment saying how it
  plays. `playouts` plays every legal move out to the end on copies with the cards it can't see
  dealt again, optionally racing moves on shared deals (`z`). `headToHead` seats one player
  against `defaultPolicy` everywhere else.
- Improving `defaultPolicy`, like monopoly-deal's:
  1. `scripts/decisions.ts` plays out every legal move at each of the default player's decisions
     and groups, by situation, where playouts clearly prefer another move.
  2. Write the pattern as a variant in `scripts/variants.ts`.
  3. Adopt it in `STEPS` if it beats the default beyond the noise (±0.5 points at 40,000 games)
     and also wins against `--field league`, a default from every round in each other seat.
     Rules here cycle: each round's best answer to the default gets answered by the next, so a
     rule that only wins against today's default isn't adopted. The old behavior stays in
     `variants.ts` marked "(previous)", and the old default joins `LEAGUE`.
  4. Rerun the README's tables, since every one is played by or against the default.
  `--field playouts` rechecks against quick playouts in every other seat.
- `learned.ts`: the learned player. `board` and `move` turn a decision into numbers, and the
  LightGBM trees in `src/model.json` (flattened by `trees.ts`, copied from monopoly-deal) rank the moves.
  `scripts/dataset.ts` writes every decision of default games with each move's playout value as
  JSONL shards in `dataset/data*/` (not committed); `--play` has a model's learned player play
  the games and `--rollout` play inside the playouts. `uv run scripts/learn.py [trees] [out]
  [directories…]` fits the trees, holding out the last directory's last 8 shards a player count.
  Each round's data and model live in `dataset/data-rN/` and `dataset/model-rN.json` (not
  committed), an `s` for labels from learned players in the playouts and `-200` for the
  200-tree rollout models; `variants.ts` names them `learned rN` and takes any variant as
  `--field`. From round 4, round N's model is fit to rounds 3 to N's games, and its file is named for them
  (`model-r345678s` is round 8). `src/model.json` is round 8, 24 MB. `scripts/round.sh N` runs
  round N end to end, logging to `dataset/rN/log.txt`, and `node scripts/status.ts --round N`
  serves its progress and ETA at localhost:3002 (open it in the browser pane). Don't edit `src/`
  while a round runs: its workers load those files. A new round's results go in the README's
  "rounds" tables, one row each, which `charts.ts` draws as `charts/rounds.svg`.
- `scripts/cards.ts`: each card's value, as the wins one more copy in an opening hand adds, from
  the same deal played both ways.
- `parallel.ts` and `worker.ts` are monopoly-deal's: they split a script's games into seeded
  chunks across cores, so results don't depend on the core count. Scripts guard their main code
  with `if (import.meta.main)`.
- `scripts/sim.ts`: quick Monte Carlo. `node scripts/sim.ts --n 100000 --players 4` prints wins
  by seat; `--log` prints every play and `--csv` a row per game, both on one core with `--seed`.
- `scripts/strategies.ts`: one player of each strategy against the default in every other seat.
- `scripts/charts.ts` draws `charts/*.svg` from the tables in `README.md`, with Observable Plot
  and jsdom, following magical-athlete's chart rules: magenta to blue through white for a loss
  or gain, magenta shades for player counts. Rerun it after updating a table.
- `scripts/rules.ts`: default games with each `Rules` flag both ways.
- `node --test 'src/*.test.ts'` runs the deck, the booklet's rules and `replay.test.ts`.
  `pnpm test` runs those, then Playwright.
- `TODO.md` is the plan, `README.md` what the simulator has shown so far.

## Playing online

A Next.js (pages router) and Convex app copied from `../monopoly-deal`: `pnpm dev` runs both.
The engine still runs on Node alone; the app's packages are only for the site. Locally it runs
against an anonymous local Convex backend (`CONVEX_AGENT_MODE=anonymous`, as
`.claude/launch.json` starts it), which needs no Convex account. `vercel.json` deploys Convex to
production as part of Vercel's build, once the repo is linked to a Convex project and Vercel.
Other players' hands aren't hidden from their browsers; it's for friends.

- `replay.ts`: a game is its seed and every decision made in it (the Favor holder's chip, each
  play or pass, each discard on passing), and its state is the game replayed through them,
  stopped at the next decision nobody has made. Bots decide for their seats as they come up:
  `first default` (Easy), `default` (Medium) or `learned` (Hard, `hard.ts`).
- `hard.ts` loads `src/packed/model.ts`, the model as base64 that Convex can bundle;
  `node scripts/pack.ts` rewrites it after the model is retrained. `learned.ts` reads JSON
  models through `process.getBuiltinModule` and finds `src/model.json` lazily, since Convex's
  bundler can't take `node:fs` or `import.meta` at load.
- `convex/`: `players` is the join and ping. `games` holds the seed, the Favor's first seat and
  the seats; `decisions` every choice in order and whether a bot made it. `games.decide` checks
  a choice by replaying with it, then plays the bots up to the next person. Clients replay the
  log themselves.
- `src/pages/` and `src/components/`: `Game` joins and shows the lobby, `Board` the table and
  the prompt. Playwright specs sit next to components and need `pnpm dev` running.
- Prettier is 220 wide, to match the engine, and leaves Markdown alone.

## Rules worth knowing

- A battle goes around the table from the Favor holder's left. Each turn you play a card or
  pass, and passing is for the rest of the battle. It ends when everyone has passed, or at once
  on Crows or Doves.
- The Favor holder picks the chip and has the Favor's 1 strength in their row.
- Highest strength wins the chip and the Favor. Ties go to fewer cards played, then the highest
  single card, then clockwise from the Favor holder.
- Played cards are discarded. Nobody draws until a battle leaves only one player with cards;
  they discard theirs, and everyone is dealt 10 again plus one per chip.
- Winter (once a battle) makes every force card 1; Fury (once a player a battle) doubles your
  force cards, so 2 each in Winter; Legend is 10 whatever happens; Bait is discarded to take a
  force card from your row back to your hand.
- Three chips of a color, or one of each, wins.

## Interpretations

- Bait needs a force card in your row to take back; without one it can't be played.
- Fate cards played to your row (Fury, Legend, Crows, Doves) count as cards played for the
  tie-break; Bait and Winter don't stay in a row and don't. The Favor isn't a card played.
- "Highest single value card" is the printed value (Legend 10), not Winter's 1.
- A Favor holder with no cards still has the Favor's 1 strength (`Rules.emptyFavor`).
- A battle that leaves nobody with cards also ends the round.
- The game is checked for a winner as each chip is won. A game with no winner after 500
  battles counts as stalled; none has.
