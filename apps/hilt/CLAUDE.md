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
- `scripts/decisions.ts` plays out every legal move at each of the default player's decisions and
  groups, by situation, where playouts clearly prefer another move. `scripts/overrules.ts` groups
  where the learned model's pick differs from the default's, by the default rule that made its
  pick, and lists the model's most-used features. `scripts/variants.ts` plays each variant
  against `--field` (`default`, `league`, `playouts`, `learned` or any variant). "The loop" below
  says how they fit together.
- `learned.ts`: the learned player. `board` and `move` turn a decision into numbers, and the
  LightGBM trees in `src/model.json` (flattened by `trees.ts`, copied from monopoly-deal) rank the moves.
  One of a move's numbers is whether it's the default's pick, and `hint` is the default the
  models were trained with (before `hold`); move it to `defaultPolicy` once a round trains on the
  new default.
  `scripts/dataset.ts` writes every decision of default games with each move's playout value as
  JSONL shards in `dataset/data*/` (not committed); `--play` has a model's learned player play
  the games and `--rollout` play inside the playouts. `uv run scripts/learn.py [trees] [out]
  [directories…]` fits the trees, holding out the last directory's last 8 shards a player count.
  Each round's data and model live in `dataset/data-rN/` and `dataset/model-rN.json` (not
  committed), an `s` for labels from learned players in the playouts and `-200` for the
  200-tree rollout models; `variants.ts` names them `learned rN` and takes any variant as
  `--field`. From round 4, round N's model is fit to rounds 3 to N's games, and its file is named for them
  (`model-r345678s` is round 8). `src/model.json` is round 9, 24 MB. `scripts/round.sh N` runs
  round N end to end after a half-minute smoke test of itself (`SMOKE=0` skips it), writing
  `log.txt`, `run.json` and `events.jsonl` to `dataset/rN/`, and `node scripts/status.ts`
  (`status` in `.claude/launch.json`) serves the newest round's progress and ETA at
  localhost:3002. Don't edit `src/`
  while a round runs: its workers load those files. A new round's results go in the README's
  "rounds" tables, one row each, which `charts.ts` draws as `charts/rounds.svg`.
- `scripts/cards.ts`: each card's value, as the wins one more copy in an opening hand adds, from
  the same deal played both ways.
- `kit/parallel.ts` and `worker.ts` (`../../packages/kit`) split a script's games into seeded
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

## The loop

The goals, in order:

1. **A faithful engine.** The booklet's rules as tests, and every reading it leaves open as a
   `Rules` flag or an "Interpretations" entry. Every number below depends on this.
2. **Know how to play Hilt well, and say so to people.** The README is for someone who wants to
   play better: its rules list, strategies and prose say what wins and why, in a player's words.
3. **Strong bots online.** Easy is the first default, Medium the default, Hard the learned model.

The tools, cheapest first:

- **The default** (`defaultPolicy`): rules a person can follow. Costs minutes to improve, and a
  better default also makes Medium stronger and is what rounds play and label with.
- **Playouts**: the upper bound, too slow for anything but checking.
- **The learned model**: rounds of training on stronger and stronger play (`round.sh`), hours
  each.

The steps:

1. **Find a candidate rule**, from either source:
   - `scripts/overrules.ts`: where the model's pick differs from the default's, grouped by the
     default's rule. The biggest group is the first candidate. This found `hold` on
     2026-11-20: +5 to +17 points, from about 20 minutes' work.
   - `scripts/decisions.ts`: where playouts clearly prefer another move.
   - A person's game: a review that shows a costly move (`TODO.md` has some).
2. **Write it as a variant** in `scripts/variants.ts`, with a few alternatives (cheapest card or
   strongest, every situation or only one on one). Screen at 2,000 games, then run the best at
   40,000.
3. **Adopt it in `STEPS`** if it beats the default beyond the noise (±0.5 points at 40,000 games)
   and also wins against `--field league`, a default from every round in each other seat. Rules
   here cycle: each round's best answer to the default gets answered by the next, so a rule that
   only wins against today's default isn't adopted. Recheck it against `--field playouts` and
   `--field learned`, which say whether it's a bet on how weak players play. The old behavior
   stays in `variants.ts` marked "(previous)", and the old default joins `LEAGUE`. The step's
   comment gives its gains and where it came from.
4. **Rerun the README's tables**, since every one is played by or against the default:
   `sim.ts` (seats), `cards.ts`, `rules.ts`, `strategies.ts`, `variants.ts` for the chip,
   discard and strong-players tables, then `charts.ts`. The playouts tables take hours; when
   they aren't rerun, say which default they were played against.
5. **Write it up for people.** Add the rule to the README's numbered list in plain words, say
   what it changes about how to play and why (passing is final, so...), and update every bit of
   prose a rerun table contradicts: a card's value, which seat is best, what a strategy is worth.
   A finding that doesn't become a rule, like "waiting is a bet on how the others play", goes in
   the prose too. Then `TODO.md`.
6. **Train a round** when the default or the data changes, and adopt it if it beats the last
   round beyond the noise without losing ground to older ones (see `learned.ts` above). Then go
   back to step 1 with the new model.

When to dig in, and when to stop:

- Mine the model (step 1) after every adopted round and every new default: it's minutes, and
  until `hold` the default had never learned from the model.
- Stop training rounds once one gains less than twice the noise over the last. Round 9 gained
  0.5 to 0.9, and round 10, on twice the games, 0.3 to 0.7. Before another round, change one
  lever and say why: labels from the new default, more deals a label, new features (card memory,
  as in `../fives`), or bigger trees. First check what caps it, as `../fives`' TODO "Headroom"
  does: if playouts among the rollout players lose to the model, it's the labels.
- Dig into a decision when a person's game shows a costly one, or a card's value in `cards.ts`
  looks wrong for how people play it: a card worth less than nothing is one the default misplays.
- Don't rerun the analysis tables except after the default changes. They report; they don't
  improve anything.
- Long runs (a round, a big table) follow `../monopoly-deal`'s "Long runs": a smoke test first,
  progress in a log, a status page, sized timeouts, nothing in `src/` changing. Run them at nice
  10 under `caffeinate -i`, and don't start one that can't finish before it's needed.

## Playing online

A Next.js (pages router) and Convex app copied from `../monopoly-deal`: `pnpm dev` runs both.
The engine still runs on Node alone; the app's packages are only for the site. Locally it runs
against an anonymous local Convex backend (`CONVEX_AGENT_MODE=anonymous`, as
`.claude/launch.json` starts it), which needs no Convex account. `vercel.json` deploys Convex to
production as part of Vercel's build: hilt.visnup.com, from `main`, with `CONVEX_DEPLOY_KEY` set in
Vercel's production environment. `vercel.json` names the framework, since a project made from
the CLI has no preset and served 404s; `.vercelignore` keeps the 2 GB `dataset/` out of CLI
uploads, which hit the free plan's 5,000-files-a-day limit.
Other players' hands aren't hidden from their browsers; it's for friends.

- `replay.ts`: a game is its seed and every decision made in it (the Favor holder's chip, each
  play or pass, each discard on passing), and its state is the game replayed through them,
  stopped at the next decision nobody has made. Bots decide for their seats as they come up:
  `first default` (Easy), `default` (Medium) or `learned` (Hard, `hard.ts`).
- `review.ts` plays out every option at each decision a player made, on 400 deals of the cards
  they couldn't see (200 with Hard bots), each bot at its level, for the "How you played" report
  at a game's end. `Review.tsx` splits it across a web worker per core (`review.worker.ts`).
  Hard bots there play by the 200-tree model in `src/packed/rollout.ts`, 181 KB gzipped, which
  only the worker loads, and only for a game with one: `node scripts/pack.ts
  dataset/model-rN-200.json src/packed/rollout.ts` after a new model is adopted. `replay()` takes its `settle` wrapper
  back off the game it returns, or the game's clones would settle it instead of themselves.
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
- `next dev` under Turbopack goes stale in a long session: a new Tailwind class is on the element
  with no CSS rule for it, or a new export renders as "Element type is invalid … got: undefined".
  Restart the dev server. We already use `@tailwindcss/postcss`, the fix for
  [tailwindcss#20581](https://github.com/tailwindlabs/tailwindcss/issues/20581); others report
  the rest unsolved ([next.js#90034](https://github.com/vercel/next.js/discussions/90034)), and
  `next dev --webpack` avoids it, which we passed on to keep Turbopack (2026-11-19, Next 16.4.6).

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
- A player with no cards is out of a battle from its start and never asked to move. Before
  2026-11-19 the first turn went left of the Favor holder regardless, so bots passed with
  nothing and people were asked to; default games came out the same, and `replay()` skips those
  passes in games saved then.
- The game is checked for a winner as each chip is won. A game with no winner after 500
  battles counts as stalled; none has.
