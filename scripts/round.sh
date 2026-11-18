#!/bin/bash
# One round of training on the learned player's own games, from round $1's model:
# $GAMES new games a player count (10000), only its top $TOP (6) moves (plus the default's and one at
# random) played out on $DEALS deals (16), the mover paying by src/pay.json, $EXTRA passed to
# dataset.ts, trees fit to the rounds in $WINDOW (the previous and this one), then the new model
# compared with the old on the same deals, and as playouts' filter only if the learned player
# gained. $NEXT names the round (default $1 + 1). Logs go to dataset/r$NEXT/. The data step
# stops after $HOURS (2), and every 10 minutes logs how many decisions it has written, so a
# stall shows.
#   scripts/round.sh 4
#   NEXT=5b WINDOW="4 5b" DEALS=8 GAMES=20000 scripts/round.sh 4
#   NEXT=7 HOURS=9 EXTRA="--strong dataset/model-r4.json" scripts/round.sh 4
set -e
prev=$1
next=${NEXT:-$((prev + 1))}
cd "$(dirname "$0")/.."
D=dataset
L=$D/r$next
mkdir -p $L
start=$(date +%s)
lap() { echo "  [$((($(date +%s) - start) / 60)) min] $1"; }
(while sleep 600; do lap "$(cat $D/data-r$next/*.jsonl 2>/dev/null | wc -l | tr -d ' ') decisions so far"; done) &
progress=$!
trap 'kill $progress 2>/dev/null' EXIT
timeout $((${HOURS:-2} * 3600)) node scripts/dataset.ts --games ${GAMES:-10000} --deals ${DEALS:-16} --model $D/model-r$prev.json --top ${TOP:-6} --pay $EXTRA --out $D/data-r$next
kill $progress
lap data
timeout 3600 node scripts/learn.ts extract --n 256 --data $D/data-r$next --features $D/features-r$next
lap extract
dirs=$(for r in ${WINDOW:-$prev $next}; do [ -d $D/features-r$r ] && echo $D/features-r$r; done)
timeout 3600 uv run scripts/learn.py 1000 $D/model-r$next.json $dirs >$L/trees.txt 2>&1
grep -A5 '^held out' $L/trees.txt
lap train
timeout 3600 node scripts/compare.ts $D/model-r$prev.json $D/model-r$next.json --n 50000 | tee $L/compare.txt
lap "compare learned"
if awk '{ for (i = 1; i < NF; i++) if ($(i + 1) == "±") s += $i } END { exit !(s > 0) }' $L/compare.txt; then
  timeout 3600 node scripts/compare.ts $D/model-r$prev.json $D/model-r$next.json --strategy playouts --players 2,5 --n 4000 | tee $L/playouts.txt
  lap "compare playouts"
fi
echo "round $next done"
