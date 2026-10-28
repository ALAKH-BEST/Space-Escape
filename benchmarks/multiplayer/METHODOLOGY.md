# Multiplayer scalability benchmark: methodology

This document explains exactly how the numbers in each `results/<date>/REPORT.md` are produced, what they do and do not show, and how to check them.

## Questions the benchmark answers

1. How many concurrent rooms and clients can one server process carry before real-time play degrades?
2. What are the message latencies (p50 / p95 / p99) at each load level?
3. How much CPU and memory does that load use?
4. What happens at the limit: gradual slowdown, errors, dropped connections?
5. Is the server stable over a longer run (memory growth, latency drift)?
6. What does an idle connection cost?

## System under test

The multiplayer server is `server/multiplayer.ts`: a `ws` WebSocket server on `/ws`, in-memory rooms of up to 4 players, one 250 ms tick that scores rooms, and a broadcast of the sender's state to the whole room for every position update. The endpoint does not authenticate and never touches the database, so it can be tested directly.

Two ways of running it are used:

- **Harness** (`server-harness.ts`, used for the ramp, soak, baseline and connection tests): imports the real `setupMultiplayer` unchanged, behind a bare Node HTTP server. It is bundled with esbuild the same way `script/build.ts` bundles production (bundled, minified, `NODE_ENV=production`). It adds a `/__bench/stats` endpoint that reports event-loop delay, memory and CPU; production has no such endpoint.
- **Production bundle** (`dist/index.cjs`, used for the cross-check): the full server (Express, sessions, everything) started the way Render starts it, with a dummy database URL that is never contacted. The cross-check compares both on the same load to show the harness does not flatter the results.

## Workload model

The workload is modelled on the real client (`GameCanvas.tsx`, `use-multiplayer.ts`):

- Rooms of 4 (the maximum, which is the heaviest case per room).
- Each pilot sends `player:position` every 1000/15 ≈ 66.7 ms (the game sends when more than 60 ms have passed since the last update, which at 60 fps is every 4th frame). Pilot start times are staggered randomly within one interval so traffic is not artificially synchronised.
- Rooms are created and joined through the real protocol (`room:create`, `room:join`, `room:ready`) and every pilot stays alive for the whole measurement.

Delivered traffic is larger than the send rate suggests: each position update is broadcast to all 4 players, and the server also broadcasts score changes (the score ticks 12 times per second) each time any position arrives and on the 250 ms tick. The report states the measured messages per client per second.

## How latency is measured

Latency is the **round trip of one application message**: from the moment the client calls `send` until the moment it receives the server's broadcast of that message's effect.

Technique: each position update carries a tag in its `y` coordinate, drawn from a repeating ramp of 24 values spaced 0.005 apart. The server accepts a position only within a movement limit per message (an anti-cheat clamp; the minimum is 0.125 per message), and the tag ramp spans 0.115, so tags are never altered by the clamp. The server stores the accepted `y` and broadcasts the player state, so the sender sees its own tag come back and matches it to the timestamp it recorded when sending. Because the sender and receiver are the same process, one monotonic clock (`performance.now()`) is used and there is no clock skew.

Details that keep this honest:

- Only the first appearance of a tag counts; later broadcasts that repeat the same `y` (from the server tick) are ignored.
- The initial server position `y = 0.5` is a reserved tag slot that is not used until the ramp has moved on.
- The generator reports **sample coverage** (samples collected ÷ messages sent). A step with less than 95% coverage is a failure; this also catches tag aliasing, which only happens if latency exceeds about 1.6 s.
- Percentiles are exact over every recorded sample, by the nearest-rank method. Nothing is bucketed or sampled. Each measurement window typically holds hundreds of thousands of samples.

**Calibration:** a TCP relay adds a known delay in each direction between the generator and the server. The tool must read back the injected round trip. The result is published in every report. The pass standard is that readings rise one millisecond per millisecond injected: the slope of a least-squares fit to the 20, 50 and 100 ms cases must be within 1% of 1. Any constant offset is the relay's own cost and is reported separately, not counted as error: every relayed packet takes two extra hops and a Node timer, and timers cannot fire sooner than 1 ms, so the 0 ms case (shown, not fitted) reads at least 2 ms above the relay-free baseline.

## How CPU, memory and event-loop delay are measured

- **Server CPU**: user + system time of the server process, read from `/proc/<pid>/stat` at the start and end of the window and every second for the timeline; reported as a percentage of one core (100% = one core fully busy).
- **Server memory**: resident set size (`VmRSS`) from `/proc/<pid>/status`, sampled the same way. Heap use comes from the server's own stats endpoint.
- **Event-loop delay**: Node's `perf_hooks.monitorEventLoopDelay` with 1 ms resolution, reset at the start of the window, on both the server and the load generator. It shows how far behind the single thread is falling. The 1 ms resolution gives a floor of roughly 1 ms on an idle process.
- **CPU steal**: from `/proc/stat`, per step, to show interference from the virtual machine's host.
- **Garbage collection**: while the monitor is on, the server records every GC event through a `PerformanceObserver` (minor, major and other, with durations). The benchmark takes differences of the cumulative counters per measurement window and per soak minute and reports GC time as a share of wall time, so latency swings can be tested against the collector (correlation of per-minute GC share with per-minute p95; a correlation does not by itself prove cause). The idle-connection test and the production cross-check have no observer.
- **Cost of the monitor itself**: the 1 ms event-loop timer wakes the server 1000 times a second, so it adds a fixed amount of CPU even on an idle server. The `overhead` scenario measures an idle server with and without it (alternating, 3 rounds of 20 s) and the report states the difference. Server CPU in the ramp, baseline and soak includes this overhead; the cost-per-message figure subtracts it; the idle-connection test runs without the monitor, and the production cross-check has none.

## Procedure

Every load step is an **independent run on a freshly started server process**, so an overloaded step cannot contaminate the next one.

1. Start the server pinned to one CPU core; start the generator pinned to another.
2. Create rooms at 25 rooms per second until the requested number of rooms are flying.
3. Warm up for 8 s (JIT, connection setup effects) and discard it.
4. Measure for 20 s (30 s for the baseline; 10 minutes for the soak).
5. Classify the step and tear everything down.

**Ramp**: load levels increase (1, 5, 10, 25, 50, 100, 150, 200, 250, 300, 350, 400, 450, 500, 600 rooms) until two consecutive levels do not pass. The gap between the last passing and first non-passing level is then narrowed by bisection (up to three steps, stopping at 5%). The whole ramp is repeated three times, independently, and results are reported as medians with min–max for p95.

**Idle connections**: lobbies of 4 waiting pilots, no traffic, at 100 up to 16,000 connections, each size on a fresh server without the event-loop monitor. Memory per connection is the least-squares slope of resident memory against connection count (a single division would include one-off warm-up memory at small sizes); idle CPU is measured over 10 s after connections settle.

**Soak**: two runs of 10 minutes, one at 70% and one at 50% of the median breaking point, each on a fresh server, so the report can say how far below the breaking point latency stays within the objective for a sustained period (short ramp steps can flatter sustained capacity). Memory is reported over the whole run and over its second half (after warm-up). Latency is summarised per one-minute window; because a single-threaded server near its limit queues messages in bursts, minute-to-minute p95 can vary a lot, so stability is judged by the least-squares trend of the per-minute p95 with its standard error, not by comparing two individual minutes. A trend is called a drift only if its magnitude exceeds two standard errors.

**Cross-check**: five alternating pairs of harness and production-bundle runs at 70% of the median breaking point, a load that is heavy but not past the knee, where results are not dominated by queueing noise. Whether the two servers differ is decided by an exact permutation test (all ways of re-splitting the ten runs into groups of five; no distribution assumed) on p95 latency and on CPU, with the harness figure adjusted for the monitor's measured cost. With three runs per side or fewer the test cannot reach p < 0.05 and the report says so rather than claiming a difference or its absence.

## Pass criteria and the breaking point

A step **passes** only if all of the following hold:

- p95 round-trip latency ≤ 100 ms (`--slo-p95` changes it);
- no pilot is wrongly eliminated by the server's 1.2 s silence timeout;
- no dropped connections or socket errors, and every room started;
- sample coverage ≥ 95%, and no latency sample was dropped for lack of buffer space (the buffer is sized from the planned load, and any overflow invalidates the step);
- the load generator is healthy: its event-loop p99 delay ≤ 10 ms and its CPU ≤ 97%. If the generator is the bottleneck the step is marked invalid instead of blamed on the server.

The **breaking point** is the highest tested load that passes. The 100 ms p95 objective is a conventional budget for fast-paced real-time games, chosen before the runs, and is not derived from user research; because the full distribution is published, anyone can apply a different threshold.

## Threats to validity

- **Hardware**: results describe the machine in `environment.json` only. Single-core speed determines capacity.
- **Loopback**: no internet latency, TLS termination or reverse proxy.
- **Synthetic clients**: fixed-rate, never-crashing Node pilots, not browsers.
- **Shared machine**: generator and server run on one virtual machine. They are pinned to separate cores and the generator is checked for health, but host-level noise is possible. CPU steal and run-to-run spread are reported.
- **Few repetitions**: three ramp runs give a spread (min–max), not a confidence interval.
- **Scope**: only the WebSocket multiplayer path is tested; login, score submission and static files are not.
- **Server timer resolution**: event-loop delay has a 1 ms floor.

## Testing a different machine or a deployed server

Run `benchmarks/multiplayer/run-all.sh` on the machine you want to measure. To test a remote server with the generator only, use `--url ws://host/ws` (latency and delivered throughput are measured; server CPU and memory are not available). Do not point it at a production service you do not want to load: it creates real rooms and sustained traffic.
