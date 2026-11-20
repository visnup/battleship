#!/bin/bash
# The Just Say No and discard models refit with card memory among their numbers: their data
# regenerated (dataset/sayno-m, discard-m), trees fit, and each played against today's model.
# A smoke test of every step first. Logs to dataset/r7m/log.txt, which `status.ts --round 7m`
# shows.
set -e
cd "$(dirname "$0")/.."
L=dataset/r7m
mkdir -p $L
exec > >(tee -a $L/log.txt) 2>&1
start=$(date +%s)
lap() { echo "  [$((($(date +%s) - start) / 60)) min, $(date +%H:%M)] $1"; }
echo "$(date) round 7m: smoke test"
S=dataset/smoke-m
rm -rf $S && mkdir -p $S
node scripts/saynodata.ts --n 256 --players 2,5 --deals 2 --out $S/sayno
node scripts/discarddata.ts --n 256 --players 2,5 --deals 2 --out $S/discard
uv run scripts/learn.py 20 $S/sayno.json $S/sayno | tail -3
uv run scripts/learn.py 20 $S/discard.json $S/discard | tail -3
rm -rf $S
echo "$(date) round 7m: the real thing"
(while sleep 600; do lap "$(ls dataset/sayno-m dataset/discard-m 2>/dev/null | grep -c '\.g$') shards so far"; done) &
progress=$!
trap 'kill $progress 2>/dev/null || true' EXIT
timeout 3h node scripts/saynodata.ts --n 131072 --out dataset/sayno-m
lap "Just Say No data"
timeout 3h node scripts/discarddata.ts --n 262144 --out dataset/discard-m
lap "discard data"
for m in sayno discard; do
  timeout 1h uv run scripts/learn.py 1000 dataset/$m-m.json dataset/$m-m > $L/trees-$m.txt 2>&1
  grep -A5 '^held out' $L/trees-$m.txt
done
lap train
for v in "Just Say No by the learned model" "Just Say No by the card-memory model" "discard by the learned model" "discard by the card-memory model"; do
  timeout 2h node scripts/variants.ts --n 400000 --players 2,3,4,5 --only "$v" | tail -1
done
lap compare
echo "$(date) round 7m: done"
