# games

A pnpm workspace of game simulators, each with its own `CLAUDE.md`, `README.md` and `TODO.md`:
`apps/monopoly-deal`, `apps/hilt`, `apps/fives` and `apps/battleship`. Node 26 (`.node-version`,
linked into each app for fnm, and each Vercel project's Node setting) runs the TypeScript
directly. pnpm is the root `packageManager`, which Vercel reads too. Install once at the root
with `fnm exec --using=26 pnpm install`, and run an app's scripts from its own directory.

- The toolchain lives at the root, once: its `devDependencies` (TypeScript, ESLint, Prettier,
  Playwright, Tailwind, concurrently, jsdom, vercel), `eslint.config.mjs`, `.prettierrc.json`,
  `.prettierignore` and `tsconfig.base.json`, which each package's `tsconfig.json` extends. An
  app's `package.json` lists only what it runs. At the root, `pnpm lint` and `pnpm check` (tsc)
  run in every package, and `pnpm format` runs Prettier over everything.
- `packages/kit` is what the apps share, imported as `kit/<file>.ts`: `parallel.ts` and
  `worker.ts` (seeded chunks over a worker per core), `table.ts` (the markdown table header
  scripts print under) and `words.ts` (table names). The Next apps list it in
  `transpilePackages`.
- A file moves to the kit once it's the same in every app that has it. Still copied, and
  drifting: `trees.ts` (fives' packs a features version), `status.ts`, `round.sh`, `learn.py`,
  `Game.tsx`, `Review.tsx` and `convex/`.
- Each app is its own Vercel project, rooted at `apps/<name>`, and each Next app has its own
  Convex deployment.
  `pnpm exec vercel` from an app's directory acts on its project.

## Working on several apps at once

One session per app, all in this checkout, each touching only its own `apps/<name>`. Worktrees
don't work here: `dataset/` is ignored and holds every model and shard.

- Commits: stage only your own app's paths (`git add apps/<name>`), never `git add -A` or
  `git commit -a`, which would take the other sessions' unfinished edits. Pull before pushing.

- Ports: app N's Next is on 30N0 and its round status page on 30N1. monopoly-deal is 3010 and
  3011, hilt 3020 and 3021, fives 3030 and 3031. Convex's local backends pick free ports
  themselves.
- Rounds run one at a time. Each `round.sh` calls `lock` from `packages/kit/lock.sh` before its
  smoke test, and waits until no other app's round is running. A round's data step stops after
  `HOURS`, so two sharing the cores would each quietly get half the data. A queued round
  starts within a minute of the last one exiting; with several queued, the order isn't
  first-come.
- Quick experiments (variants, mining the model) can run beside a round and each other: results
  don't depend on the core count. `WORKERS=n` caps `parallel`'s workers to leave a round room.
- While any round runs, nobody edits `packages/kit` or runs `pnpm up`: every app's workers load
  those files.

## Keeping the loop fast

The overriding goal is acceleration: how fast an idea becomes a measured result. Every rule,
strategy, feature and check costs a little in every game simulated, and the engine runs inside
everything else: playouts run it per move, datasets per playout, rounds per dataset. As ideas
accrete the sims slow down, each experiment gets fewer games or longer waits, and the rate of
improvement falls with them. A speedup compounds the other way, so it's part of the work, not
an afterthought.

### When

- **A speed pass every so often**, like a cleanup pass: profile the hot paths of each app (the
  engine, `playouts`, the learned player, dataset generation) and take what's cheap.
- **Before a long run.** A round or a playouts table is where a 2× pays most, and a timing run
  on a sample is due anyway (see monopoly-deal's "Long runs").
- **After adding to a hot path.** A new step in `STEPS`, a new feature or a new check runs
  millions of times. Time a game before and after, and if it got slower, say by how much in
  the commit.

### How

- **Measure, don't guess.** `node --cpu-prof` on a single-core run (`sim.ts --seed`), then
  open the profile; time a fixed benchmark of plain and playouts games before and after.
- **Same games, row for row.** A speedup must not change a result: run the same seeds before
  and after and compare every game or table row, and say so in the commit ("1.75× without
  changing a result"). A change that trades accuracy for speed is an experiment instead, and
  gets measured like one, against the noise.
- **Record the number.** Put the before and after in the commit message (ms a game, s a
  chunk, minutes a table), and the current figure in the app's `CLAUDE.md` when the engine's
  cost matters (fives: "a default game is about 0.5 ms").

### What has worked

- **Don't compute what can't change the decision.** Playouts stop after two rounds and score
  the board with `chance` instead of playing to the end (2.5× faster, and stronger); they race
  moves on shared deals and drop one once it's 2 standard errors behind (3.5 s to 1.5 s a
  game); the dataset can play out only the model's top moves; battleship's density skips
  placements a miss ruled out. Skip a step whose answer is already known: monopoly-deal skips
  `arrange` after banking, and Debt Collector doesn't pick a target without the card.
- **Compute once, use many times.** Memoize on exactly what the answer depends on
  (monopoly-deal's `arrange`); score each player once rather than once per comparison; work
  out a per-decision value once (fives' `top()`); fit weights from the full sample once
  instead of querying again (battleship's shooters).
- **Don't allocate in the inner loop.** Count, pay and key without building arrays; share
  immutable objects (fives' plays); copy bitsets only when they change; loops over sorts.
- **Flat data over objects.** The learned player's trees evaluate from typed arrays (1.7×
  in rollouts), and battleship keeps a bit per sample fleet.
- **Count instead of search.** Arranging wilds by counting colors was 3× faster than trying
  arrangements.

### Data shared between jobs

- **Write once, read many.** When several scripts need the same thing (dataset shards,
  features, playout values, sample fleets, a fitted model), one step writes it to `dataset/`
  and the others read it, instead of each regenerating it. Rounds already do this:
  `data-rN/` feeds `features-rN/`, which several `learn.py` fits read, holding out the same
  shards.
- **Rerun only what's stale.** battleship's `make` rebuilds what changed and skips what
  didn't; reach for the same before rerunning a whole pipeline by hand.
- **Make staleness visible.** Name outputs after what made them (round, model, knobs), and
  write the knobs beside them (`run.json`), so a changed upstream step can't be mistaken for
  the old one. A cache that can silently serve stale data costs more than it saves.
- **Keep what's expensive to remake.** Old rounds' data goes to Hugging Face rather than being
  deleted; a playouts table that took hours is worth a file.

### Smaller before slower

- Answer a question with the fewest games that can: a smoke test, a few thousand games, a
  held-out slice, `WORKERS=n` beside a round. Spend a full round or a 100,000-game table only
  on what survived that.
- Prefer the cheap player for exploring: the default costs minutes to improve, the learned
  model hours, playouts are for checking.

### Delete what lost

A strategy, variant, feature or rule that didn't help still costs time on every run, and its
features cost every model that reads them. Remove it, keep the result in `README.md` or the
commit, and keep the old behavior in `variants.ts` only when it's a baseline something is still
measured against.
