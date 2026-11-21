# fives

A simulator of CMYK's Fives card game (Magenta line, designed by Taiki Shinzawa), laid out like
`../hilt` and `../monopoly-deal`. Node 26 (`.node-version`) runs the TypeScript directly, and the
engine has no dependencies. Fives is for 3 or 4 players.

The rules are the How to Play booklet (`rules/fives.pdf`, from gamers-hq.de), not committed. Its
last page has the components and a summary.

- `cards.ts`: the 52 cards, each with its `id`, its place in `DECK`. `deck(3)` drops the 10s to
  13s.
- `game.ts`: the engine. `Game` deals and plays one game of four hands; `run()` plays it out,
  `run(play)` makes a play first, and `run(play, 1)` stops once the next hand is dealt. A play is
  a card face up or `down`, as the magenta 5 on its back; `legal()` lists them and `allowed()`
  checks one. A `Policy` picks each play, and `defaultPolicy` is a hand-written player made of
  named rules, `STEPS`, tried in order. `heuristic(...)` makes a player from any list of steps.
  `Rules` holds the readings the booklet leaves open. Each player's `voids` are the colors they've
  shown they're out of, and `hidden` the cards they played face down, which only they know.
- The engine is the cost of everything else, so it's kept fast: plays are shared objects
  (`up()`, `down()`), `top()` is the highest unseen card of each color, worked out once a
  decision, and the steps are loops, not sorts. A default game is about 0.5 ms, a game among
  round 9's learned players 26 ms (90% of it scoring trees, which `scoreAll` does for all of a
  decision's plays at once), among its rollout players 3.4 ms, and a 16-deal hand-playouts game
  about 2.4 s. `node scripts/bench.ts [games] [learned|rollout|playouts]` times them and prints a
  checksum of the winners to compare before and after; profile (`node --cpu-prof`) a change
  there.
- `strategies.ts`: whole-game strategies in `STRATEGIES`. `playouts` plays every legal play out on
  copies with the cards it can't see dealt again (`sample`, which respects `voids`), optionally
  racing plays (`z`), and with `hand` only to the end of the hand, scored by `chance`: the win
  chance from the chips, a softmax fit by `scripts/chance.ts`. Refit it after changing the
  default. `headToHead` seats one player against `defaultPolicy` everywhere else; a shared win
  counts its share.
- Improving `defaultPolicy`, like hilt's: `scripts/decisions.ts` plays out every legal play at
  each of the default player's decisions and groups, by situation and by what each play does
  (taking or under the trick, face up or down, trump, led or off color), where playouts clearly
  prefer another. "The loop" below says what to do with one.
- `learned.ts`: the learned player. `board` and `move` turn a decision into numbers, and the
  LightGBM trees (flattened by `trees.ts`, copied from hilt) rank the plays. The features are
  versioned: `dataset.ts` writes `VERSION` into each row, `learn.py` into the model, and
  `learned()` reads a model's version to pick `features(v)`, so models fit to older versions keep
  playing. Version 2 adds card counting (`board2`, `move2`). A new version can't train on older
  rounds' rows, so its first round is `FROM=` itself. The "is the default's pick" flag stays the
  last number, where `learn.py` looks for it.
  `scripts/dataset.ts` writes every decision of default games with each play's hand-playout value
  as JSONL shards in `dataset/data-rN/` (not committed); `--play` has a model's learned player
  play the games and `--rollout` play inside the playouts. `uv run scripts/learn.py [trees] [out]
  [directories…]` fits the trees, holding out the last directory's last 8 shards a player count.
  The playouts inside a round use each model's rollout version, 50 trees of 31 leaves
  (`LEAVES=31`): a 200-tree, 63-leaf model made a learned game 50 times the default's cost, and
  this one about 8, for a little less accuracy.
  `scripts/round.sh N` runs round N end to end after a smoke test of itself (`SMOKE=0` skips it),
  writing `log.txt`, `run.json` and `events.jsonl` to `dataset/rN/`, and `node scripts/status.ts`
  serves the newest round's progress at localhost:3031. Don't edit `src/` while a round runs: its
  workers load those files.
- `kit/parallel.ts` and `worker.ts` (`../../packages/kit`) split a script's games into seeded chunks across
  cores, so results don't depend on the core count. Scripts guard their main code with
  `if (import.meta.main)`.
- `scripts/sim.ts`: quick Monte Carlo, wins by seat, busts and 25s. `--log` prints every play.
- `scripts/strategies.ts`: one player of each strategy against the default in every other seat.
- `node --test 'src/*.test.ts'` runs the booklet's rules, scoring examples, replays and reviews.
  `pnpm test` runs those, then Playwright.
- `TODO.md` is the plan, `README.md` what the simulator has shown so far.

## The loop

The goals, in order:

1. **A faithful engine.** The booklet's rules as tests, and every reading it leaves open as a
   `Rules` flag or an "Interpretations" entry. Every number below depends on this.
2. **Know how to play Fives well, and say so to people.** The README is for someone who wants to
   play better: its rules list, strategies and prose say what wins and why, in a player's words.
3. **Strong bots online.** Easy is face up only, Medium the default, Hard the learned model.

The tools, cheapest first:

- **The default** (`defaultPolicy`): rules a person can follow. Costs minutes to improve, and a
  better default also makes Medium stronger.
- **Playouts**: the upper bound, too slow for anything but checking and labeling.
- **The learned model**: rounds of training on stronger and stronger play (`round.sh`), hours
  each.

The steps:

1. **Find a candidate rule**, from any source:
   - Where the model's pick differs from the default's, grouped by the default's step
     (`scripts/overrules.ts`). It found `leadDown` and `take`'s wait.
   - `scripts/decisions.ts`: where playouts clearly prefer another play.
   - A person's game: a review that shows a costly play (`TODO.md` has some).
2. **Write it as a variant** in `scripts/variants.ts`, with a few alternatives (cheapest card or
   biggest, every situation or only near 25). Screen at 2,000 games, then run the best at 40,000.
3. **Adopt it in `STEPS`** if it beats the default beyond the noise (±0.5 points at 40,000 games)
   and also wins against `--field league`, a default from every round in each other seat. Rules
   cycle: each round's best answer to the default gets answered by the next, so a rule that only
   wins against today's default isn't adopted. Recheck it against `--field playouts` and
   `--field learned`, which say whether it's a bet on how weak players play. The old behavior
   stays in `variants.ts` marked "(previous)", and the old default joins `LEAGUE`. The step's
   comment gives its gains and where it came from. Refit `chance` after (`scripts/chance.ts`).
4. **Rerun the README's tables**, since every one is played by or against the default:
   `sim.ts`, `strategies.ts`, `variants.ts`, then `charts.ts`. The playouts tables take hours;
   when they aren't rerun, say which default they were played against.
5. **Write it up for people.** Add the rule to the README in plain words, say what it changes
   about how to play and why, and update every bit of prose a rerun table contradicts. A finding
   that doesn't become a rule goes in the prose too. Then `TODO.md`.
6. **Train a round** when the default or the data changes, and adopt it if it beats the last
   round beyond the noise without losing ground to older ones. Then go back to step 1 with the
   new model.

When to dig in, and when to stop:

- Mine the model (step 1) after every adopted round and every new default: it's minutes.
- Stop training rounds once one gains less than twice the noise over the last. Rounds 5–8 gained
  0 to 1.5 points each. Before another round, change one lever and say why: labels from the new
  default, more deals or hands a label, new features, or bigger trees (round 8's refit gained
  1.8 and 0.5 that way). First check what caps it, as `TODO.md`'s "Headroom" does: if playouts
  among the rollout players lose to the model, it's the labels.
- Dig into a decision when a person's game shows a costly one.
- Don't rerun the analysis tables except after the default changes. They report; they don't
  improve anything.
- Long runs (a round, a big table) follow `../monopoly-deal`'s "Long runs": a smoke test first,
  progress in a log, a status page, sized timeouts, nothing in `src/` changing. Run them at nice
  10 under `caffeinate -i` when sharing the machine, and don't start one that can't finish before
  it's needed.

## Playing online

A Next.js (pages router) and Convex app copied from `../hilt`: `pnpm dev` runs both, Next on port
3030 (see the games `CLAUDE.md` for every app's ports). Locally it runs against an anonymous local Convex backend
(`CONVEX_AGENT_MODE=anonymous`, as `.claude/launch.json` starts it). `vercel.json` deploys Convex
to production as part of Vercel's build: fives.visnup.com, from `main`, with `CONVEX_DEPLOY_KEY`
set in Vercel's production environment (Convex project `fives`, team visnup). A CLI deploy from
this directory fails, since the Vercel project is rooted at `apps/fives` of the repo. Other
players' hands aren't hidden from their browsers; it's for friends.

- `replay.ts`: a game is its seed and every play made in it (a card by its place in hand, and
  whether face down), and its state is the game replayed through them. Bots decide for their
  seats as they come up: `face up` (Easy), `default` (Medium) or `learned` (Hard, `hard.ts`).
- `hard.ts` loads `src/packed/model.ts`, the model as base64 that Convex can bundle, and the
  review's Hard bots `src/packed/rollout.ts`, its 50-tree version, which only the review's workers
  load: `node scripts/pack.ts dataset/model-rN.json src/packed/model.ts` and
  `node scripts/pack.ts dataset/model-rN-rollout.json src/packed/rollout.ts` after a model is
  adopted. `learned.ts` reads JSON models through `process.getBuiltinModule`, since Convex's
  bundler can't take `node:fs`.
- `review.ts` plays out every option at each decision with a choice, for the "How you played"
  report at a game's end, in a web worker per core.
- `src/components/Board.tsx`: the table as a 3×3 grid, the trick in the middle
  with each card toward its player, and the seats around it, you at the bottom. A hand's scores
  hold the playback until you continue.
- Prettier is 220 wide, to match the engine, and leaves Markdown alone.
- Tailwind under Turbopack can miss a class added while `pnpm dev` runs: restart the dev server
  before deciding a class doesn't work.

## Rules worth knowing

- The magenta 0's holder leads the first trick of each hand, with any card. You must follow the
  led color if you can; silver is trump. The highest silver wins, else the highest of the led
  color. The winner keeps the card they played as a scoring card and leads next.
- Any card can be played face down as a magenta 5, at most one a trick: when leading, when
  magenta is led (even holding magenta), when you can't follow, or when your one card of the led
  color is the one you flip.
- A hand's total is the cards that won tricks for you. Closest to 25 without going over scores
  most (3, 2, 1 at 4 players; 2, 1 at 3), plus 1 for exactly 25. A bust gives a chip to the one
  closest; if that's tied, to a pot for the next hand's closest. Four hands, then most chips wins,
  then closest to 25 in the last hand, then a shared win.

## Interpretations

- Players tied for a place all take the lowest of the places they tie for, as the booklet says,
  also when they tie for first (`Rules.tiesLow`).
- A bust with no chips gives nothing. When everyone busts, the chips go to the pot.
- A pot no one wins in the last hand is lost.
- Chips are unlimited; the box's 42 never run out in practice.
