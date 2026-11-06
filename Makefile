# Regenerates results/ and charts/ from whatever changed.
SRC := $(filter-out %.test.ts,$(wildcard src/*.ts))

.PHONY: all test
all: charts/matrix.svg cheat/public/library.bin

test:
	node --test

results/arrangements.parquet: scripts/count.ts src/arrangements.ts src/board.ts
	node scripts/count.ts
results/placements.parquet: scripts/placements.ts results/arrangements.parquet $(SRC)
	node scripts/placements.ts
results/shots.parquet: scripts/games.ts results/placements.parquet $(SRC)
	node scripts/games.ts
cheat/public/library.bin: scripts/library.ts results/placements.parquet
	node scripts/library.ts
charts/matrix.svg: scripts/charts.ts scripts/equilibrium.ts results/shots.parquet
	node scripts/charts.ts
