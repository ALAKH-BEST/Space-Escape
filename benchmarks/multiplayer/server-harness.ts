// The server under test: the real multiplayer module (server/multiplayer.ts,
// unchanged) behind a bare HTTP server. Express, sessions and the database are
// left out because the /ws path never touches them; a second benchmark mode
// runs the full production bundle to confirm that makes no material difference.
//
// It adds one thing the production server does not have: a stats endpoint that
// reports event-loop delay, garbage-collection time, memory and CPU for the
// process, so the benchmark can see how far behind the server's event loop is
// falling and why.

import { createServer } from "node:http";
import { constants, monitorEventLoopDelay, PerformanceObserver, type PerformanceEntry } from "node:perf_hooks";
import { setupMultiplayer } from "../../server/multiplayer";

const portArgument = process.argv.indexOf("--port");
const port = portArgument >= 0 ? Number(process.argv[portArgument + 1]) : 0;

// The 1 ms event-loop monitor wakes the loop 1000 times a second, which costs a few
// percent of a core by itself. --no-monitor turns it off for tests where that would
// distort the result (idle connections) or where its cost is being measured.
const monitorEnabled = !process.argv.includes("--no-monitor");
const eventLoop = monitorEventLoopDelay({ resolution: 1 });
if (monitorEnabled) eventLoop.enable();

// Garbage-collection time, so a slowdown can be attributed to the collector (or ruled out).
// Cumulative since process start; the benchmark takes differences. Like the event-loop
// monitor it is only active when instrumentation is on. It fires only when a GC happens.
const gcTotals = { minorCount: 0, minorMs: 0, majorCount: 0, majorMs: 0, otherCount: 0, otherMs: 0 };
function recordGc(entry: PerformanceEntry) {
  const kind = (entry as PerformanceEntry & { detail?: { kind?: number } }).detail?.kind;
  if (kind === constants.NODE_PERFORMANCE_GC_MINOR) {
    gcTotals.minorCount++;
    gcTotals.minorMs += entry.duration;
  } else if (kind === constants.NODE_PERFORMANCE_GC_MAJOR) {
    gcTotals.majorCount++;
    gcTotals.majorMs += entry.duration;
  } else {
    gcTotals.otherCount++; // incremental marking steps and weak-callback processing
    gcTotals.otherMs += entry.duration;
  }
}
const gcObserver = new PerformanceObserver((list) => list.getEntries().forEach(recordGc));
if (monitorEnabled) gcObserver.observe({ entryTypes: ["gc"] });

const server = createServer((request, response) => {
  const url = new URL(request.url ?? "/", "http://localhost");
  if (url.pathname !== "/__bench/stats") {
    response.writeHead(404).end();
    return;
  }

  if (monitorEnabled) gcObserver.takeRecords().forEach(recordGc); // flush GC events not yet delivered
  const memory = process.memoryUsage();
  const cpu = process.cpuUsage();
  const toMs = (nanoseconds: number) => nanoseconds / 1e6;
  const body = JSON.stringify({
    rssBytes: memory.rss,
    heapUsedBytes: memory.heapUsed,
    heapTotalBytes: memory.heapTotal,
    externalBytes: memory.external,
    cpuSeconds: (cpu.user + cpu.system) / 1e6,
    gc: monitorEnabled ? { ...gcTotals } : null,
    eventLoopDelayMs: monitorEnabled
      ? {
          mean: toMs(eventLoop.mean),
          p50: toMs(eventLoop.percentile(50)),
          p95: toMs(eventLoop.percentile(95)),
          p99: toMs(eventLoop.percentile(99)),
          max: toMs(eventLoop.max),
        }
      : null,
  });
  if (monitorEnabled && url.searchParams.get("reset") === "1") eventLoop.reset();
  response.writeHead(200, { "Content-Type": "application/json" }).end(body);
});

setupMultiplayer(server);

server.listen(port, "127.0.0.1", () => {
  const address = server.address();
  const actualPort = address && typeof address !== "string" ? address.port : port;
  console.log(`READY ${actualPort}`);
});
