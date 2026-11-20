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
