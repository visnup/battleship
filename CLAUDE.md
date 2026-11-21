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

The goal is acceleration: how fast an idea becomes a measured result. Each strategy, feature
and check costs a little compute in every game simulated, and as ideas pile up the sims slow
down, rounds get fewer games, and improvement slows with them. So speed is part of the work,
not an afterthought. Do a speed pass regularly, and before adding to a hot path, and measure
games per second before and after.

- **Don't compute what won't matter.** Skip work whose result can't change the decision: score
  only legal moves, stop a rollout once the outcome is settled, cut a search when no remaining
  branch can win, and compute features only for the model that reads them.
- **Cache what repeats.** Memoize pure functions of state that recur within a game or across
  games (hand values, set completions, deal tables), and hoist anything constant out of the
  per-move loop.
- **Write once, read many.** When several jobs need the same data (dataset shards, features,
  playouts), one step writes it to `dataset/` and the others read it, rather than each
  regenerating it. A changed upstream step invalidates what it wrote; name the outputs so
  that's obvious.
- **Smaller before slower.** Prefer a smoke test, fewer games or a held-out slice to answer a
  question, and spend a full round only on what survived that.
- **Delete what lost.** A strategy, feature or variant that didn't help still costs time on
  every run. Remove it, and leave the result in `README.md` or history.
