#!/bin/bash
# Reruns every README table that plays against the default player, after the default changes:
# first each script at a tiny size, so a mistake shows in a minute, then for real. Logs to
# dataset/r$ROUND/log.txt (status.ts --round $ROUND) and the tables to dataset/r$ROUND/tables.md.
#   ROUND=8t scripts/tables.sh
set -e
cd "$(dirname "$0")/.."
L=dataset/r${ROUND:-8t}
mkdir -p $L
exec > >(tee -a $L/log.txt) 2>&1
start=$(date +%s)
lap() { echo "  [$((($(date +%s) - start) / 60)) min, $(date +%H:%M)] $1"; }
run() {
  local name=$1
  shift
  echo "### $name" >>$L/tables.md
  timeout 3h "$@" | tee -a $L/tables.md
  lap "$name"
}
echo "$(date) round ${ROUND:-8t}: smoke test"
for s in sim strategies variants strong cards colors decided payments openings sensitivity field; do
  node scripts/$s.ts --n 64 >/dev/null
done
node scripts/learn.ts --n 64 >/dev/null
echo "$(date) round ${ROUND:-8t}: the real thing"
: >$L/tables.md
for p in 2 3 4 5; do run "sim $p" node scripts/sim.ts --players $p; done
run strategies node scripts/strategies.ts
run "playouts" node scripts/strategies.ts --only "playouts,quick playouts" --n 10000
run variants node scripts/variants.ts
for v in "pay by the learned model" "Just Say No by the learned model" "discard by the learned model"; do run "$v" node scripts/variants.ts --players 2,3,4,5 --only "$v"; done
run "learned player" node scripts/learn.ts --n 100000
run field node scripts/field.ts --only default
run cards node scripts/cards.ts
run colors node scripts/colors.ts
run decided node scripts/decided.ts
run payments node scripts/payments.ts
run openings node scripts/openings.ts
run sensitivity node scripts/sensitivity.ts
run strong node scripts/strong.ts --n 8000
run "strong findings" node scripts/strong.ts --n 8000 --only "default|builder|build houses and hotels, never bank them (previous)|bank all money before laying down properties (previous)|lay down properties before banking (previous)|keep one Just Say No for a Deal Breaker|hold the card that completes a set unless it wins"
echo "$(date) round ${ROUND:-8t}: done"
