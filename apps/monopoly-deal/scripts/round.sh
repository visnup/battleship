#!/bin/bash
# One round of training on the learned player's own games, from round $1's model, as $NEXT
# (default $1 + 1). Everything about the run is in dataset/r$NEXT/: log.txt, run.json (the knobs
# and the stages, for scripts/status.ts) and events.jsonl (when each stage started and ended).
#   1. A smoke test: this whole script at a tiny size, as round ${NEXT}smoke, unless SMOKE=0.
#   2. rollout model: with $STRONG, that many trees fit to the rounds before this one, to play
#      every seat of the playouts.
#   3. data: $GAMES new games a player count (10000), the model's top $TOP (6) moves (plus the
#      default's and one at random) played out on $DEALS deals (16), the mover paying, saying no
#      and discarding by the learned models, $EXTRA passed to dataset.ts. Stops after $HOURS (2),
#      and logs how many decisions it has written every 10 minutes, so a stall shows.
#   4. extract, then train: $TREES trees (1000) fit to the rounds in $WINDOW ($1 and this one).
#   5. The new model against the old on the same deals: against the default ($N deals, 50000),
#      against the old model's learned players ($FIELD deals, 40000), as playouts' filter
#      ($PLAYOUTS deals, 4000) only if the learned player gained, and with $BASE against that
#      round's model among its own learned players.
#   scripts/round.sh 4
#   NEXT=5b WINDOW="4 5b" DEALS=8 GAMES=20000 scripts/round.sh 4
#   NEXT=12 WINDOW="6-m 7 8 9 10 11 12" GAMES=20000 DEALS=2 TOP=4 HOURS=5 STRONG=200 EXTRA="--label 0.5" BASE=6m scripts/round.sh 11
set -e
prev=$1
next=${NEXT:-$((prev + 1))}
cd "$(dirname "$0")/.."
D=dataset
L=$D/r$next
games=${GAMES:-10000}
trees=${TREES:-1000}
window=${WINDOW:-$prev $next}

. ../../packages/kit/lock.sh
lock "monopoly-deal round $next"

if [ "${SMOKE:-1}" != 0 ]; then
  s=${next}smoke
  clean() { rm -rf $D/data-r$s $D/features-r$s $D/model-r$s.json $D/r$s ${STRONG:+$D/model-r$prev-10.json}; }
  clean
  SMOKE=0 ALL=1 NEXT=$s WINDOW="$(for r in $window; do [ "$r" = "$next" ] && echo $s || echo $r; done | xargs)" GAMES=32 DEALS=2 TREES=20 N=200 FIELD=200 PLAYOUTS=40 HOURS=1 STRONG=${STRONG:+10} bash scripts/round.sh $prev
  clean
fi

mkdir -p $L
exec > >(tee -a $L/log.txt) 2>&1
strong=${STRONG:+$D/model-r$prev-$STRONG.json}
start=$(date +%s)
rm -f $L/usage.jsonl
: >$L/events.jsonl
stages='"data", "extract", "train", "compare learned", "compare against learned", "compare playouts"'
[ -z "$STRONG" ] || stages="\"rollout model\", $stages"
[ -z "$BASE" ] || stages="$stages, \"compare against r$BASE\""
echo "{ \"round\": \"$next\", \"prev\": \"$prev\", \"start\": ${start}000, \"games\": $games, \"shards\": $((games < 256 ? games : 256)), \"trees\": $trees, \"strong\": ${STRONG:-0}, \"stages\": [$stages] }" >$L/run.json
echo "$(date) round $next: $games games, ${DEALS:-16} deals, top ${TOP:-6}, $trees trees, window $window${STRONG:+, $STRONG-tree rollouts}"

ev() { echo "{\"t\":$(date +%s)000,\"stage\":\"$stage\",\"state\":\"$1\"}" >>$L/events.jsonl; }
begin() { stage=$1 && ev start; }
end() { ev ${1:-done} && echo "  [$((($(date +%s) - start) / 60)) min, $(date +%H:%M)] $stage${1:+ $1}" && stage=; }
trap '[ -z "$stage" ] || ev failed; kill $progress 2>/dev/null || true' EXIT

if [ -n "$strong" ]; then
  begin "rollout model"
  if [ -f $strong ]; then
    end skipped
  else
    timeout 3600 uv run scripts/learn.py $STRONG $strong $(for r in $window; do [ "$r" != "$next" ] && [ -d $D/features-r$r ] && echo $D/features-r$r; done) >$L/rollout.txt 2>&1
    end
  fi
fi

begin data
(while sleep 600; do echo "  [$((($(date +%s) - start) / 60)) min, $(date +%H:%M)] $(cat $D/data-r$next/*.jsonl 2>/dev/null | wc -l | tr -d ' ') decisions so far"; done) &
progress=$!
timeout $((${HOURS:-2} * 3600)) node scripts/dataset.ts --games $games --deals ${DEALS:-16} --model $D/model-r$prev.json --top ${TOP:-6} --pay ${strong:+--strong $strong} $EXTRA --out $D/data-r$next
{ kill $progress && wait $progress; } 2>/dev/null || true
end

begin extract
timeout 3600 node scripts/learn.ts extract --n $((games < 256 ? games : 256)) --data $D/data-r$next --features $D/features-r$next
end

begin train
timeout 3600 uv run scripts/learn.py $trees $D/model-r$next.json $(for r in $window; do [ -d $D/features-r$r ] && echo $D/features-r$r; done) >$L/trees.txt 2>&1
grep -A5 '^held out' $L/trees.txt
end

begin "compare learned"
timeout 3600 node scripts/compare.ts $D/model-r$prev.json $D/model-r$next.json --n ${N:-50000} | tee $L/compare.txt
end

begin "compare against learned"
timeout 3600 node scripts/compare.ts $D/model-r$prev.json $D/model-r$next.json --field $D/model-r$prev.json --n ${FIELD:-40000} | tee $L/field.txt
end

begin "compare playouts"
if [ -n "$ALL" ] || awk '{ for (i = 1; i < NF; i++) if ($(i + 1) == "±") s += $i } END { exit !(s > 0) }' $L/compare.txt; then
  timeout 3600 node scripts/compare.ts $D/model-r$prev.json $D/model-r$next.json --strategy playouts --players 2,5 --n ${PLAYOUTS:-4000} | tee $L/playouts.txt
  end
else
  end skipped
fi

if [ -n "$BASE" ]; then
  begin "compare against r$BASE"
  timeout 3600 node scripts/compare.ts $D/model-r$BASE.json $D/model-r$next.json --field $D/model-r$BASE.json --n ${FIELD:-40000} | tee $L/base.txt
  end
fi
echo "$(date) round $next: done"
