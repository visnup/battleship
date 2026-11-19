#!/bin/bash
# Round $1 of training on learned players' games: $GAMES games a player count (3000), played by
# the learned player of rounds 3 to $1 - 1's model, each move labeled by playouts on $DEALS deals
# (16) among learned players of its 200-tree version; then trees fit to rounds 3 to $1, 1,000 and
# 200 of them, and the new model played 20,000 games against each of the last four models and
# the default. Everything goes to dataset/r$1/log.txt, with a line every 10 minutes while games
# are labeled; `node scripts/status.ts --round $1` shows how far it's got.
#   scripts/round.sh 9
set -e
round=$1
cd "$(dirname "$0")/.."
D=dataset
L=$D/r$round
mkdir -p $L
exec > >(tee -a $L/log.txt) 2>&1
# rounds 3 to $1 as a model's name: r345678s
name() { echo "r$(seq -s '' 3 "$1" | tr -d '\n')s"; }
prev=$(name $((round - 1)))
next=$(name "$round")
start=$(date +%s)
lap() { echo "  [$((($(date +%s) - start) / 60)) min, $(date +%H:%M)] $1"; }
echo "$(date) round $round: start"
(while sleep 600; do lap "$(cat $D/data-r${round}s/*.jsonl 2>/dev/null | wc -l | tr -d ' ') decisions so far"; done) &
progress=$!
trap 'kill $progress 2>/dev/null || true' EXIT
node scripts/dataset.ts --games "${GAMES:-3000}" --deals "${DEALS:-16}" --play $D/model-$prev.json --rollout $D/model-$prev-200.json --out $D/data-r${round}s
{ kill $progress && wait $progress; } 2>/dev/null || true
lap data
dirs=$(for r in $(seq 3 "$round"); do echo $D/data-r${r}s; done)
uv run scripts/learn.py 1000 $D/model-$next.json $dirs >$L/trees.txt 2>&1
grep -A5 '^held out' $L/trees.txt
lap train
for r in $(seq $((round - 1)) -1 $((round > 6 ? round - 4 : 3))); do
  node scripts/variants.ts --n 20000 --only "learned $next" --field "learned $(name "$r")" | tee -a $L/compare.txt
done
node scripts/variants.ts --n 20000 --only "learned $next" | tee -a $L/compare.txt
lap compare
# after comparing, since --only "learned $next" would match it too
uv run scripts/learn.py 200 $D/model-$next-200.json $dirs >$L/trees-200.txt 2>&1
lap "train 200"
echo "$(date) round $round: done"
