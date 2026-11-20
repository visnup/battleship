# Sourced by each app's scripts/round.sh: `lock` waits until no other app's round is running, so
# two rounds never split the cores. A round's data step stops after $HOURS, so sharing would
# quietly halve its data. The lock is a directory holding its owner's pid; a dead owner's lock is
# taken over. The smoke test's nested round.sh inherits ROUND_LOCK and doesn't wait on itself.
lock() {
  [ -n "$ROUND_LOCK" ] && return
  local d=/tmp/games-round.lock pid
  while ! mkdir $d 2>/dev/null; do
    pid=$(cat $d/pid 2>/dev/null)
    if [ -n "$pid" ] && ! kill -0 "$pid" 2>/dev/null; then
      rm -rf $d
      continue
    fi
    [ -n "$waiting" ] || echo "$(date) waiting for $(cat $d/what 2>/dev/null) to finish"
    waiting=1
    sleep 60
  done
  echo $$ >$d/pid
  echo "$1" >$d/what
  export ROUND_LOCK=$d
}
