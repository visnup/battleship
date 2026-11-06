# battleship

An analysis of Battleship (Hasbro rules: 10×10, ships of 5, 4, 3, 3 and 2 that may touch, and a
sunk ship is named). Node 24 runs the TypeScript directly. The engine has no dependencies; the
scripts need `pnpm install` (DuckDB, hyparquet-writer, Observable Plot and jsdom). It follows
`../magical-athlete`'s layout and chart conventions.

- `src/board.ts`: the grid, the fleet, and every placement of each ship. A cell is
  `row * 10 + col`; a fleet is a placement index per ship.
- `src/arrangements.ts`: the exact count of arrangements and of how many put each ship on each
  cell. It lays all but the last two ships and counts those two's pairs from per-cell coverage.
- `src/fleets.ts`: placers. `uniform` redraws the whole fleet on any overlap; `naive`, which
  retries only the overlapping ship, is kept to show its bias.
- `src/shooters.ts`: shooters and `play`. `density` takes optional per-placement weights, which
  is how the "tuned" shooters know a placer's habits. `posterior` samples the exact posterior;
  `adaptive` infers the placer from `model`s of sampled fleets.
- `cheat/`: the cheat sheet page, served and built by Vite (`pnpm cheat`, `pnpm build`), which
  is what lets it import `src/`'s TypeScript. `public/library.bin` is 20,000 fleets per placer
  from `scripts/library.ts`, a byte per ship in `PLACERS` order.
- `src/parallel.ts` and `worker.ts` are magical-athlete's: seeded chunks over a worker per core.
- `scripts/`: `count.ts` → `results/arrangements.parquet`, `placements.ts` → `placements.parquet`,
  `games.ts` → `games.parquet` and `shots.parquet`, `equilibrium.ts` prints the mixed strategies,
  and `charts.ts` draws `charts/`. `posterior.ts` and `adaptive.ts` print the README's tables
  for those shooters' variants, and take minutes, so `make` skips them. `make` reruns what's stale (a few
  minutes, mostly adaptive in `games.ts`), `node --test` the tests.
- `README.md` quotes numbers from `results/`; rerun its queries after a change to `src/`.

Charts: the box's sea blue is a sequential amount (occupancy, shots); red pegs to white to blue
is a signed difference, red meaning the fleet sinks sooner. Color scales step into 10 bins,
since Plot's continuous legend needs a canvas and jsdom has none.
