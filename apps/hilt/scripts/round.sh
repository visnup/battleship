#!/bin/bash
# Round $1 of training on learned players' games. Everything about the run is in dataset/r$1/:
# log.txt, run.json (the knobs and the stages, for scripts/status.ts) and events.jsonl (when each
# stage started and ended).
#   1. A smoke test: this whole script at a tiny size, as round $1smoke, unless SMOKE=0.
#   2. data: $GAMES games a player count (3000), played by the learned player of rounds 3 to
#      $1 - 1's model, each move labeled by playouts on $DEALS deals (16) among learned players of
#      its 200-tree version. Stops after $HOURS (3), and logs how many decisions it has written
#      every 10 minutes, so a stall shows.
#   3. train: $TREES trees (1000) fit to rounds 3 to $1 ($DIRS for the smoke test).
#   4. compare: the new model's learned player, $N games (20000), against each of the last four
#      models and the default.
#   5. train 200: the 200-tree version, for the next round's playouts and the review.
#   scripts/round.sh 9
set -e
round=$1
cd "$(dirname "$0")/.."
D=dataset
id=${NAME#r}
id=${id:-$round}
L=$D/r$id
games=${GAMES:-3000}
trees=${TREES:-1000}
# rounds 3 to $1 as a model's name: r345678s
name() { echo "r$(seq -s '' 3 "$1" | tr -d '\n')s"; }
prev=$(name $((round - 1)))
next=${NAME:-$(name "$round")}
dirs=${DIRS:-$(for r in $(seq 3 "$round"); do echo $D/data-r${r}s; done)}
data=$D/data-${DATA:-r${round}s}
fields=$(for r in $(seq $((round - 1)) -1 $((round > 6 ? round - 4 : 3))); do name "$r"; done)

. ../../packages/kit/lock.sh
lock "hilt round $round"

if [ "${SMOKE:-1}" != 0 ]; then
  s=${round}smoke
  clean() { rm -rf $D/data-r$s $D/model-r$s.json $D/model-r$s-200.json $D/r$s; }
  clean
  SMOKE=0 NAME=r$s DATA=r$s DIRS=$D/data-r$s GAMES=32 DEALS=2 TREES=20 N=40 bash scripts/round.sh "$round"
  clean
fi

mkdir -p $L
exec > >(tee -a $L/log.txt) 2>&1
start=$(date +%s)
rm -f $L/usage.jsonl
: >$L/events.jsonl
echo "{ \"round\": \"$id\", \"prev\": \"$((round - 1))\", \"start\": ${start}000, \"games\": $games, \"trees\": $trees, \"data\": \"$data\", \"compares\": $(($(echo $fields | wc -w) + 1)), \"stages\": [\"data\", \"train\", \"compare\", \"train 200\"] }" >$L/run.json
echo "$(date) round $id: $games games, ${DEALS:-16} deals, $trees trees, from $prev"

ev() { echo "{\"t\":$(date +%s)000,\"stage\":\"$stage\",\"state\":\"$1\"}" >>$L/events.jsonl; }
begin() { stage=$1 && ev start; }
end() { ev ${1:-done} && echo "  [$((($(date +%s) - start) / 60)) min, $(date +%H:%M)] $stage${1:+ $1}" && stage=; }
trap '[ -z "$stage" ] || ev failed; kill $progress 2>/dev/null || true' EXIT

begin data
(while sleep 600; do echo "  [$((($(date +%s) - start) / 60)) min, $(date +%H:%M)] $(cat $data/*.jsonl 2>/dev/null | wc -l | tr -d ' ') decisions so far"; done) &
progress=$!
timeout $((${HOURS:-3} * 3600)) node scripts/dataset.ts --games $games --deals ${DEALS:-16} --play $D/model-$prev.json --rollout $D/model-$prev-200.json --out $data
{ kill $progress && wait $progress; } 2>/dev/null || true
end

begin train
timeout 3600 uv run scripts/learn.py $trees $D/model-$next.json $dirs >$L/trees.txt 2>&1
grep -A5 '^held out' $L/trees.txt
end

begin compare
for f in $fields; do
  timeout 3600 node scripts/variants.ts --n ${N:-20000} --only "learned $next" --field "learned $f" | tee -a $L/compare.txt
done
timeout 3600 node scripts/variants.ts --n ${N:-20000} --only "learned $next" | tee -a $L/compare.txt
end

# after comparing, since --only "learned $next" would match it too
begin "train 200"
timeout 3600 uv run scripts/learn.py 200 $D/model-$next-200.json $dirs >$L/trees-200.txt 2>&1
end
echo "$(date) round $id: done"
