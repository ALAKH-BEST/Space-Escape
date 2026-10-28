#!/usr/bin/env bash
# Reproduces the whole multiplayer scalability suite and its report.
#
#   benchmarks/multiplayer/run-all.sh [output-directory]
#
# Needs a Linux machine with at least 2 CPU cores (the server and the load
# generator are pinned to different cores), `taskset`, and Node 22. Takes about
# 50 minutes. Keep the machine otherwise idle while it runs.
#
# Resumable: every finished step leaves a marker file (.done-<name>) in the
# output directory, and re-running the script with the same directory skips the
# steps that already finished. Delete the directory (or the marker) to redo one.
set -euo pipefail
cd "$(dirname "$0")/../.."

OUT="${1:-benchmarks/multiplayer/results/$(date -u +%F)}"
mkdir -p "$OUT"
ulimit -n 20000 2>/dev/null || true
RUN="npx tsx benchmarks/multiplayer/run.ts"

# step <name> <command...>: run once, remember that it finished.
step() {
  local name="$1"
  shift
  if [ -e "$OUT/.done-$name" ]; then
    echo "== $name: already done, skipping =="
    return
  fi
  echo "== $name =="
  "$@"
  touch "$OUT/.done-$name"
}

# 70% of the median breaking point found by the ramps: a heavy but sustainable
# load, used for the soak and the cross-check so both are sized to this machine.
rooms_at_percent() {
  node -e '
    const fs = require("fs");
    const dir = process.argv[1];
    const points = fs.readdirSync(dir).filter((f) => /^ramp-\d+\.json$/.test(f))
      .map((f) => JSON.parse(fs.readFileSync(dir + "/" + f, "utf8")).breakingPoint.lastPassingRooms)
      .sort((a, b) => a - b);
    console.log(Math.round(points[Math.floor(points.length / 2)] * Number(process.argv[2]) / 100));
  ' "$OUT" "$1"
}

crosscheck() {
  local rooms
  rooms=$(rooms_at_percent 70)
  echo "cross-check rooms (70% of the median breaking point): $rooms"
  $RUN crosscheck --rooms "$rooms" --repeat 5 --out "$OUT"
}

soak() {
  local rooms
  rooms=$(rooms_at_percent 70)
  echo "soak rooms (70% of the median breaking point): $rooms"
  $RUN soak --rooms "$rooms" --minutes 10 --out "$OUT"
}

soak_half() {
  local rooms
  rooms=$(rooms_at_percent 50)
  echo "second soak rooms (50% of the median breaking point): $rooms"
  $RUN soak --rooms "$rooms" --minutes 10 --file soak-50pct --out "$OUT"
}

# The production bundle is used by the cross-check.
step 0-build npm run build
step 1-calibration $RUN calibrate --out "$OUT"
step 2-baseline $RUN baseline --repeat 3 --measure 30 --out "$OUT"
step 2b-overhead $RUN overhead --out "$OUT"
step 3-ramp $RUN ramp --repeat 3 --out "$OUT"
step 4-connections $RUN connections --out "$OUT"
step 5-crosscheck crosscheck
step 6-soak soak
step 7-soak-50pct soak_half

echo "== report =="
npx tsx benchmarks/multiplayer/report.ts "$OUT"
echo "done: $OUT/REPORT.md"
