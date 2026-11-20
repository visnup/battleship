# games

A pnpm workspace of game simulators, each with its own `CLAUDE.md`, `README.md` and `TODO.md`:
`apps/monopoly-deal`, `apps/hilt`, `apps/fives` and `apps/battleship`. Node 26 (`.node-version`,
linked into each app for fnm, and each Vercel project's Node setting) runs the TypeScript
directly. pnpm is the root `packageManager`, which Vercel reads too. Install once at the root
with `fnm exec --using=26 pnpm install`, and run an app's scripts and checks from its own
directory.

- `packages/kit` is what the apps share, imported as `kit/<file>.ts`: `parallel.ts` and
  `worker.ts` (seeded chunks over a worker per core) and `words.ts` (table names). The Next apps
  list it in `transpilePackages`.
- A file moves to the kit once it's the same in every app that has it. Still copied, and
  drifting: `trees.ts` (fives' packs a features version), `status.ts`, `round.sh`, `learn.py`,
  `Game.tsx`, `Review.tsx` and `convex/`.
- Each app is its own Vercel project, rooted at `apps/<name>`, with its own Convex deployment.
  `pnpm exec vercel` from an app's directory acts on its project.
