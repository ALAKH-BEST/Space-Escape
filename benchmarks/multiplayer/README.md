# Multiplayer load tests

Reproducible load tests for the multiplayer WebSocket server: concurrent rooms and clients, message latency (p50/p95/p99), CPU, memory and the breaking point. Results are in `results/<date>/REPORT.md`; method and limits are in [METHODOLOGY.md](METHODOLOGY.md).

## Requirements

Linux with 2+ cores and `taskset`, Node 22, `npm ci`, and an otherwise idle machine.

## Run

```sh
benchmarks/multiplayer/run-all.sh [output-dir]   # full suite, about 65 minutes
```

Builds the app, runs every scenario below and writes `REPORT.md` and `charts/`. It is resumable: re-running with the same directory skips finished steps.

One scenario:

```sh
npm run bench:multiplayer -- <scenario> [options]
```

| Scenario | Purpose |
| --- | --- |
| `smoke` | Quick check that the setup works |
| `calibrate` | Checks the tool reads back an injected delay |
| `baseline` | One room, uncontended latency |
| `overhead` | CPU cost of the event-loop monitor |
| `ramp` | Raises load until the server stops passing, then finds the breaking point |
| `connections` | Idle lobby connections: memory and CPU |
| `soak` | Long run at fixed load |
| `crosscheck` | Isolated module vs full production bundle |

| Option | Default | Meaning |
| --- | --- | --- |
| `--out` | `results/<UTC date>` | Output directory |
| `--players` / `--hz` | 4 / 15 | Players per room / position updates per second |
| `--warmup` / `--measure` | 8 / 20 | Seconds discarded / measured per step |
| `--steps` | 1,5,10,25,50,… | Room counts for `ramp` |
| `--repeat` | 1 | Repeats for `ramp`, `baseline`, `crosscheck` |
| `--rooms` | 50 | Rooms for `soak` and `crosscheck` |
| `--minutes` / `--file` | 10 / soak | Soak length / output file name |
| `--slo-p95` | 100 | p95 objective in ms that defines "pass" |
| `--server` | `harness` | `harness` or `production` (needs `npm run build`) |
| `--url` | none | Load an existing `ws://host/ws` (no server metrics); only use on services you own |

Regenerate a report: `npx tsx benchmarks/multiplayer/report.ts benchmarks/multiplayer/results/<date>`
