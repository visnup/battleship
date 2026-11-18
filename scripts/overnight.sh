#!/bin/bash
# Expert iteration: round $NEXT's moves labeled by playouts where everyone is the learned player
# (src/model.json), not the default. First a tiny run of the whole pipeline, so a mistake shows in
# minutes, then the real one. Everything goes to dataset/r$NEXT/log.txt, with a line every 10
# minutes while games are labeled.
#   NEXT=7 WINDOW="6-m 7" scripts/overnight.sh
set -e
next=${NEXT:-7}
cd "$(dirname "$0")/.."
mkdir -p dataset/r$next
exec > >(tee -a dataset/r$next/log.txt) 2>&1
echo "$(date) round $next: smoke test"
rm -rf dataset/data-r${next}smoke dataset/features-r${next}smoke
NEXT=${next}smoke WINDOW="${next}smoke" GAMES=32 DEALS=2 HOURS=1 EXTRA="--strong src/model.json --label 0.5" scripts/round.sh 4
rm -rf dataset/data-r${next}smoke dataset/features-r${next}smoke dataset/model-r${next}smoke.json dataset/r${next}smoke
echo "$(date) round $next: the real thing"
NEXT=$next WINDOW="${WINDOW:-6 $next}" GAMES=${GAMES:-5000} DEALS=8 HOURS=9 EXTRA="--strong src/model.json --label 0.5" TOP=4 scripts/round.sh 4
echo "$(date) round $next: trained on its own data alone"
uv run scripts/learn.py 1000 dataset/model-r${next}only.json dataset/features-r$next > dataset/r$next/trees-only.txt 2>&1
grep -A5 '^held out' dataset/r$next/trees-only.txt
node scripts/compare.ts dataset/model-r4.json dataset/model-r${next}only.json --n 50000
echo "$(date) round $next: done"
