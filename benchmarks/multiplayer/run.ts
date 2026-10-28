// Multiplayer scalability benchmark orchestrator.
//
//   npx tsx benchmarks/multiplayer/run.ts <scenario> [options]
//
// Scenarios: smoke | calibrate | baseline | ramp | connections | soak | crosscheck | overhead
// See benchmarks/multiplayer/README.md for what each one does and every option.

import { build } from "esbuild";
import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { mkdirSync, mkdtempSync, existsSync, writeFileSync } from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import {
  runLobbyStep,
  runStep,
  type LobbyResult,
  type ServerProbe,
  type ServerStats,
  type StepConfig,
  type StepResult,
} from "./loadgen";
import { linearSlope, median, round } from "./stats";
import {
  captureEnvironment,
  readOpenFileCount,
  readProcessCpuSeconds,
  readProcessRssBytes,
  readSystemCpu,
} from "./system";

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

type Options = {
  scenario: string;
  out: string;
  players: number;
  hz: number;
  warmup: number;
  measure: number;
  steps: number[];
  rampRate: number;
  sloP95: number;
  repeat: number;
  rooms: number;
  minutes: number;
  serverCore: number;
  clientCore: number;
  server: "harness" | "production";
  url: string | null;
  connectionSteps: number[];
  /** Output file name (without extension) for `soak`, so several soaks can sit in one results folder. */
  file: string;
};

function parseOptions(argv: string[]): Options {
  const scenario = argv[0] && !argv[0].startsWith("--") ? argv[0] : "smoke";
  const flags = new Map<string, string>();
  for (let i = scenario === argv[0] ? 1 : 0; i < argv.length; i++) {
    if (argv[i].startsWith("--")) flags.set(argv[i].slice(2), argv[i + 1] ?? "true");
  }
  const number = (name: string, fallback: number) => (flags.has(name) ? Number(flags.get(name)) : fallback);
  const list = (name: string, fallback: number[]) =>
    flags.has(name) ? flags.get(name)!.split(",").map(Number) : fallback;
  const day = new Date().toISOString().slice(0, 10);
  return {
    scenario,
    out: flags.get("out") ?? path.join("benchmarks", "multiplayer", "results", day),
    players: number("players", 4),
    hz: number("hz", 15),
    warmup: number("warmup", 8),
    measure: number("measure", 20),
    steps: list("steps", [1, 5, 10, 25, 50, 100, 150, 200, 250, 300, 350, 400, 450, 500, 600]),
    rampRate: number("ramp-rate", 25),
    sloP95: number("slo-p95", 100),
    repeat: number("repeat", 1),
    rooms: number("rooms", 50),
    minutes: number("minutes", 10),
    serverCore: number("server-core", 0),
    clientCore: number("client-core", 1),
    server: (flags.get("server") as Options["server"]) ?? "harness",
    url: flags.get("url") ?? null,
    connectionSteps: list("connection-steps", [100, 500, 1000, 2500, 5000, 8000, 12000, 16000]),
    file: flags.get("file") ?? "soak",
  };
}

// ---------------------------------------------------------------------------
// Managed server process
// ---------------------------------------------------------------------------

type ManagedServer = {
  pid: number;
  url: string;
  probe: ServerProbe;
  stop: () => Promise<void>;
};

let harnessBundle: string | null = null;

async function buildHarness() {
  if (harnessBundle) return harnessBundle;
  const dir = mkdtempSync(path.join(os.tmpdir(), "astrododge-bench-"));
  harnessBundle = path.join(dir, "server-harness.cjs");
  // Same bundling approach as the production build (script/build.ts): ws is
  // bundled, minified, NODE_ENV=production.
  await build({
    entryPoints: [path.join("benchmarks", "multiplayer", "server-harness.ts")],
    platform: "node",
    bundle: true,
    format: "cjs",
    outfile: harnessBundle,
    minify: true,
    define: { "process.env.NODE_ENV": '"production"' },
    logLevel: "error",
  });
  return harnessBundle;
}

function freePort() {
  return new Promise<number>((resolve, reject) => {
    const probe = net.createServer();
    probe.listen(0, "127.0.0.1", () => {
      const address = probe.address() as net.AddressInfo;
      probe.close(() => resolve(address.port));
    });
    probe.on("error", reject);
  });
}

function waitForLine(child: ChildProcess, pattern: RegExp, timeoutMs: number) {
  return new Promise<RegExpExecArray>((resolve, reject) => {
    let output = "";
    const timer = setTimeout(() => reject(new Error(`server did not start: ${output.slice(-500)}`)), timeoutMs);
    const onData = (chunk: Buffer) => {
      output += chunk.toString();
      const match = pattern.exec(output);
      if (match) {
        clearTimeout(timer);
        resolve(match);
      }
    };
    child.stdout?.on("data", onData);
    child.stderr?.on("data", onData);
    child.once("exit", (code) => {
      clearTimeout(timer);
      reject(new Error(`server exited early (code ${code}): ${output.slice(-500)}`));
    });
  });
}

async function startServer(options: Options, kind: Options["server"], monitor = true): Promise<ManagedServer> {
  let child: ChildProcess;
  let port: number;

  if (kind === "production") {
    if (!existsSync("dist/index.cjs")) throw new Error("dist/index.cjs is missing; run `npm run build` first");
    port = await freePort();
    child = spawn("taskset", ["-c", String(options.serverCore), "node", "dist/index.cjs"], {
      env: {
        ...process.env,
        NODE_ENV: "production",
        PORT: String(port),
        DATABASE_URL: "postgres://bench:bench@127.0.0.1:1/bench", // never connected to: /ws does not use the database
        SESSION_SECRET: "benchmark-only-secret",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    await waitForLine(child, /serving on port/, 20_000);
  } else {
    const bundle = await buildHarness();
    child = spawn("taskset", ["-c", String(options.serverCore), "node", bundle, "--port", "0", ...(monitor ? [] : ["--no-monitor"])], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    const match = await waitForLine(child, /READY (\d+)/, 20_000);
    port = Number(match[1]);
  }

  const pid = child.pid!;
  const probe: ServerProbe = {
    sample: () => {
      try {
        return { cpuSeconds: readProcessCpuSeconds(pid), rssBytes: readProcessRssBytes(pid) };
      } catch {
        return null;
      }
    },
    stats: async (reset) => {
      if (kind !== "harness") return null;
      try {
        const response = await fetch(`http://127.0.0.1:${port}/__bench/stats?reset=${reset ? 1 : 0}`);
        return (await response.json()) as ServerStats;
      } catch {
        return null;
      }
    },
    system: () => {
      const cpu = readSystemCpu();
      return { total: cpu.total, steal: cpu.steal };
    },
  };

  return {
    pid,
    url: `ws://127.0.0.1:${port}/ws`,
    probe,
    stop: async () => {
      child.kill("SIGKILL");
      await new Promise((resolve) => child.once("exit", resolve));
    },
  };
}

/** Probe for a server we do not control (--url): latency only, no server-side metrics. */
function externalProbe(): ServerProbe {
  return {
    sample: () => null,
    stats: async () => null,
    system: () => ({ total: 0, steal: 0 }),
  };
}

// ---------------------------------------------------------------------------
// Steps and classification
// ---------------------------------------------------------------------------

type Verdict = "pass" | "slo-breach" | "failure" | "generator-limited";

function classify(result: StepResult, options: Options): { verdict: Verdict; reason: string } {
  // The generator is only a problem if its own event loop falls behind, which
  // would add its delay to every latency sample. (High CPU alone is expected:
  // it handles as many messages as the server does.)
  const g = result.generator;
  if (g.eventLoopP99Ms > 10 || g.cpuPercent > 97) {
    return {
      verdict: "generator-limited",
      reason: `load generator saturated (CPU ${g.cpuPercent.toFixed(0)}%, event-loop p99 ${g.eventLoopP99Ms.toFixed(1)} ms); results are not valid for the server`,
    };
  }
  const i = result.integrity;
  if (result.setup.setupFailures > 0) return { verdict: "failure", reason: `${result.setup.setupFailures} rooms failed to start` };
  if (i.eliminations > 0) return { verdict: "failure", reason: `${i.eliminations} pilots wrongly eliminated by the server heartbeat timeout` };
  if (i.unexpectedCloses > 0 || i.socketErrors > 0) {
    return { verdict: "failure", reason: `${i.unexpectedCloses} dropped connections, ${i.socketErrors} socket errors` };
  }
  if (i.sampleOverflow > 0) {
    return { verdict: "failure", reason: `${i.sampleOverflow} latency samples did not fit in the buffer; the run is invalid` };
  }
  if (result.throughput.sampleCoverage < 0.95) {
    return { verdict: "failure", reason: `only ${(100 * result.throughput.sampleCoverage).toFixed(1)}% of messages completed a round trip` };
  }
  const p95 = result.latencyMs.p95 ?? Infinity;
  if (p95 > options.sloP95) return { verdict: "slo-breach", reason: `p95 ${p95.toFixed(1)} ms exceeds the ${options.sloP95} ms objective` };
  return { verdict: "pass", reason: "" };
}

function stepConfig(options: Options, rooms: number, measureSeconds = options.measure): StepConfig {
  return {
    url: options.url ?? "",
    rooms,
    playersPerRoom: options.players,
    positionHz: options.hz,
    rampRoomsPerSecond: options.rampRate,
    warmupMs: options.warmup * 1000,
    measureMs: measureSeconds * 1000,
  };
}

async function loadStep(options: Options, rooms: number, measureSeconds?: number, subWindowSeconds?: number) {
  const config = stepConfig(options, rooms, measureSeconds);
  if (subWindowSeconds) config.subWindowMs = subWindowSeconds * 1000;

  let server: ManagedServer | null = null;
  let probe: ServerProbe;
  if (options.url) {
    probe = externalProbe();
  } else {
    server = await startServer(options, options.server);
    config.url = server.url;
    probe = server.probe;
  }
  try {
    const result = await runStep(config, probe);
    const { verdict, reason } = classify(result, options);
    return { ...result, verdict, reason };
  } finally {
    await server?.stop();
  }
}

type StepRecord = Awaited<ReturnType<typeof loadStep>>;

function describe(record: StepRecord) {
  const l = record.latencyMs;
  const s = record.server;
  return (
    `${String(record.config.rooms).padStart(4)} rooms / ${String(record.config.clients).padStart(4)} clients  ` +
    `p50 ${fmt(l.p50)}  p95 ${fmt(l.p95)}  p99 ${fmt(l.p99)}  max ${fmt(l.max)} ms  ` +
    `server CPU ${s.cpuPercent === null ? "n/a" : s.cpuPercent.toFixed(0) + "%"}  ` +
    `RSS ${s.rssMBEnd === null ? "n/a" : s.rssMBEnd.toFixed(0) + " MB"}  ` +
    `gen CPU ${record.generator.cpuPercent.toFixed(0)}%  -> ${record.verdict}${record.reason ? " (" + record.reason + ")" : ""}`
  );
}

const fmt = (value: number | null) => (value === null ? "n/a" : value.toFixed(1));

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------

function saveJson(options: Options, name: string, data: unknown) {
  mkdirSync(options.out, { recursive: true });
  writeFileSync(path.join(options.out, name), JSON.stringify(data, null, 2) + "\n");
}

function gitInfo() {
  const run = (...args: string[]) => {
    try {
      return execFileSync("git", args, { encoding: "utf8" }).trim();
    } catch {
      return "unknown";
    }
  };
  return { commit: run("rev-parse", "HEAD"), dirty: run("status", "--porcelain").length > 0 };
}

function writeEnvironment(options: Options) {
  const file = path.join(options.out, "environment.json");
  if (existsSync(file)) return;
  saveJson(options, "environment.json", {
    ...captureEnvironment(),
    git: gitInfo(),
    pinning: { serverCpu: options.serverCore, loadGeneratorCpu: options.clientCore },
    note: "Server and load generator are pinned to separate CPU cores and talk over the loopback interface.",
  });
}

function meta(options: Options) {
  return {
    scenario: options.scenario,
    startedAt: new Date().toISOString(),
    playersPerRoom: options.players,
    positionHz: options.hz,
    warmupSeconds: options.warmup,
    measureSeconds: options.measure,
    sloP95Ms: options.sloP95,
    server: options.url ? `external ${options.url}` : options.server,
  };
}

// ---------------------------------------------------------------------------
// Scenarios
// ---------------------------------------------------------------------------

async function scenarioSmoke(options: Options) {
  console.log("Smoke test: 2 rooms, short window");
  const record = await loadStep({ ...options, warmup: 2 }, 2, 6);
  console.log(describe(record));
  return record;
}

async function scenarioBaseline(options: Options) {
  const runs: StepRecord[] = [];
  for (let run = 1; run <= Math.max(1, options.repeat); run++) {
    console.log(`Baseline run ${run}: 1 room, ${options.measure} s window`);
    const record = await loadStep(options, 1);
    console.log(describe(record));
    runs.push(record);
    saveJson(options, "baseline.json", { meta: meta(options), runs });
  }
}

async function scenarioRamp(options: Options) {
  for (let run = 1; run <= Math.max(1, options.repeat); run++) {
    const steps: StepRecord[] = [];
    const file = options.repeat > 1 || run > 1 ? `ramp-${run}.json` : "ramp-1.json";
    const save = (extra: object = {}) => saveJson(options, file, { meta: meta(options), steps, ...extra });
    console.log(`\n=== Ramp ${run}/${options.repeat} ===`);

    let consecutiveBad = 0;
    for (const rooms of options.steps) {
      const record = await loadStep(options, rooms);
      console.log(describe(record));
      steps.push(record);
      save();
      consecutiveBad = record.verdict === "pass" ? 0 : consecutiveBad + 1;
      if (consecutiveBad >= 2) break;
    }

    // Narrow the gap between the last passing step and the first failing one.
    const passing = () => steps.filter((s) => s.verdict === "pass").map((s) => s.config.rooms);
    const failing = () => steps.filter((s) => s.verdict !== "pass").map((s) => s.config.rooms);
    for (let refine = 0; refine < 3 && failing().length > 0 && passing().length > 0; refine++) {
      const lowest = Math.max(...passing());
      const higher = failing().filter((rooms) => rooms > lowest);
      if (higher.length === 0) break;
      const upper = Math.min(...higher);
      if (upper - lowest <= Math.max(2, Math.round(lowest * 0.05))) break;
      const middle = Math.round((lowest + upper) / 2);
      console.log(`Refining between ${lowest} (pass) and ${upper} (not pass): trying ${middle}`);
      const record = await loadStep(options, middle);
      console.log(describe(record));
      steps.push(record);
      save();
    }

    steps.sort((a, b) => a.config.rooms - b.config.rooms);
    const lastPass = Math.max(0, ...steps.filter((s) => s.verdict === "pass").map((s) => s.config.rooms));
    const firstNotPass = steps.find((s) => s.config.rooms > lastPass && s.verdict !== "pass");
    save({
      breakingPoint: {
        lastPassingRooms: lastPass,
        lastPassingClients: lastPass * options.players,
        firstNonPassingRooms: firstNotPass?.config.rooms ?? null,
        firstNonPassingVerdict: firstNotPass?.verdict ?? null,
        firstNonPassingReason: firstNotPass?.reason ?? null,
      },
    });
    console.log(
      `Breaking point: last passing ${lastPass} rooms (${lastPass * options.players} clients); first non-passing ${firstNotPass?.config.rooms ?? "none reached"} ${firstNotPass ? `(${firstNotPass.verdict})` : ""}`,
    );
  }
}

async function scenarioConnections(options: Options) {
  const results: Array<LobbyResult & { verdict: string }> = [];
  for (const connections of options.connectionSteps) {
    const rooms = Math.ceil(connections / options.players);
    // No event-loop monitor here: its 1 ms timer would show up as "idle CPU".
    const server = await startServer(options, options.server, false);
    try {
      const config = { ...stepConfig(options, rooms), url: server.url, rampRoomsPerSecond: 200 };
      const result = await runLobbyStep(config, server.probe, () => readOpenFileCount(server.pid));
      const ok = result.failures === 0;
      results.push({ ...result, verdict: ok ? "pass" : "failure" });
      console.log(
        `${String(result.connections).padStart(6)} idle connections: connected ${result.connected}, failures ${result.failures}, ` +
          `${result.connectSeconds.toFixed(1)} s, server RSS ${result.server.rssMBAfter?.toFixed(0)} MB ` +
          `(${result.server.kbPerConnection?.toFixed(1)} kB/conn), idle CPU ${result.server.idleCpuPercent?.toFixed(2)}%`,
      );
      saveJson(options, "connections.json", { meta: meta(options), results });
      if (!ok) break;
    } finally {
      await server.stop();
    }
  }
}

async function scenarioSoak(options: Options) {
  const rooms = options.rooms;
  console.log(`Soak: ${rooms} rooms (${rooms * options.players} clients) for ${options.minutes} min`);
  const record = await loadStep(options, rooms, options.minutes * 60, 60);
  console.log(describe(record));
  const rss = record.timeline.map((p) => p.serverRssMB).filter((v): v is number => v !== null);
  const seconds = record.timeline.map((p) => p.tSeconds).slice(0, rss.length);
  const slopeMBPerMinute = linearSlope(seconds, rss) * 60;
  const first = record.subWindows[0]?.latencyMs;
  const last = record.subWindows[record.subWindows.length - 1]?.latencyMs;
  const summary = {
    rooms,
    clients: rooms * options.players,
    minutes: options.minutes,
    rssSlopeMBPerMinute: round(slopeMBPerMinute, 3),
    rssStartMB: round(rss[0] ?? null),
    rssEndMB: round(rss[rss.length - 1] ?? null),
    p95FirstWindowMs: round(first?.p95 ?? null),
    p95LastWindowMs: round(last?.p95 ?? null),
  };
  console.log("Soak summary", summary);
  saveJson(options, `${options.file}.json`, { meta: meta(options), summary, record });
}

/**
 * Cost of the measurement itself: an idle server with and without the 1 ms
 * event-loop monitor, so the report can state (and correct for) the CPU it adds.
 * Alternates the two so slow drift on the machine cannot favour one.
 */
async function scenarioOverhead(options: Options) {
  const seconds = 20;
  const rounds = 3;
  const samples: Array<{ monitor: boolean; cpuPercent: number }> = [];
  for (let round = 1; round <= rounds; round++) {
    for (const monitor of [false, true]) {
      const server = await startServer(options, "harness", monitor);
      try {
        await new Promise((resolve) => setTimeout(resolve, 2000));
        const start = server.probe.sample();
        await new Promise((resolve) => setTimeout(resolve, seconds * 1000));
        const end = server.probe.sample();
        if (!start || !end) throw new Error("could not read server CPU");
        const cpuPercent = (100 * (end.cpuSeconds - start.cpuSeconds)) / seconds;
        samples.push({ monitor, cpuPercent });
        console.log(`round ${round}: idle server, monitor ${monitor ? "on " : "off"} -> ${cpuPercent.toFixed(2)}% of one core`);
      } finally {
        await server.stop();
      }
    }
  }
  const medianOf = (monitor: boolean) => median(samples.filter((s) => s.monitor === monitor).map((s) => s.cpuPercent))!;
  const off = medianOf(false);
  const on = medianOf(true);
  console.log(`event-loop monitor overhead: ${(on - off).toFixed(2)} percentage points of one core`);
  saveJson(options, "overhead.json", {
    meta: meta(options),
    secondsPerSample: seconds,
    samples,
    monitorOffCpuPercent: round(off, 3),
    monitorOnCpuPercent: round(on, 3),
    overheadPercentagePoints: round(on - off, 3),
  });
}

/** A TCP relay that delays every chunk by `delayMs` in each direction (order preserved). */
function startDelayProxy(targetPort: number, delayMs: number) {
  const sockets = new Set<net.Socket>();
  const proxy = net.createServer((client) => {
    const upstream = net.connect(targetPort, "127.0.0.1");
    for (const socket of [client, upstream]) {
      socket.setNoDelay(true);
      sockets.add(socket);
      socket.on("error", () => {
        client.destroy();
        upstream.destroy();
      });
      socket.on("close", () => sockets.delete(socket));
    }
    const relay = (from: net.Socket, to: net.Socket) => {
      from.on("data", (chunk) => setTimeout(() => !to.destroyed && to.write(chunk), delayMs));
      from.on("end", () => setTimeout(() => !to.destroyed && to.end(), delayMs));
    };
    relay(client, upstream);
    relay(upstream, client);
  });
  return new Promise<{ port: number; close: () => void }>((resolve) => {
    proxy.listen(0, "127.0.0.1", () => {
      resolve({
        port: (proxy.address() as net.AddressInfo).port,
        close: () => {
          sockets.forEach((socket) => socket.destroy());
          proxy.close();
        },
      });
    });
  });
}

/**
 * Measurement validation: put a relay with a known delay between the load
 * generator and the server and check that the measured round trip equals the
 * injected delay (2 x one-way) plus the server's own tiny processing time.
 */
async function scenarioCalibrate(options: Options) {
  const results: Array<{ injectedRoundTripMs: number; measuredP50: number | null; measuredP95: number | null; errorMs: number | null }> = [];
  for (const oneWay of [0, 10, 25, 50]) {
    const server = await startServer(options, "harness");
    const proxy = await startDelayProxy(Number(new URL(server.url.replace("ws:", "http:")).port), oneWay);
    try {
      const config = { ...stepConfig(options, 1, 15), url: `ws://127.0.0.1:${proxy.port}/ws` };
      const record = await runStep(config, server.probe);
      const p50 = record.latencyMs.p50;
      const row = {
        injectedRoundTripMs: oneWay * 2,
        measuredP50: round(p50, 2),
        measuredP95: round(record.latencyMs.p95, 2),
        errorMs: p50 === null ? null : round(p50 - oneWay * 2, 2),
      };
      results.push(row);
      console.log(`injected ${row.injectedRoundTripMs} ms round trip -> measured p50 ${row.measuredP50} ms, p95 ${row.measuredP95} ms (error ${row.errorMs} ms), ${record.latencyMs.count} samples`);
    } finally {
      proxy.close();
      await server.stop();
    }
  }
  saveJson(options, "calibration.json", { meta: meta(options), results });
}

async function scenarioCrosscheck(options: Options) {
  const rounds = Math.max(1, options.repeat);
  const rooms = options.rooms;
  const runs: Array<{ server: string; record: StepRecord }> = [];
  for (let roundNumber = 1; roundNumber <= rounds; roundNumber++) {
    for (const kind of ["harness", "production"] as const) {
      console.log(`Cross-check round ${roundNumber}/${rounds}: ${kind} server, ${rooms} rooms`);
      const record = await loadStep({ ...options, server: kind }, rooms);
      console.log(describe(record));
      runs.push({ server: kind, record });
      saveJson(options, "crosscheck.json", { meta: meta(options), rooms, runs });
    }
  }
  const medianOf = (kind: string, pick: (r: StepRecord) => number | null) =>
    median(runs.filter((r) => r.server === kind).map((r) => pick(r.record)).filter((v): v is number => v !== null));
  for (const [label, pick] of [
    ["p50 ms", (r: StepRecord) => r.latencyMs.p50],
    ["p95 ms", (r: StepRecord) => r.latencyMs.p95],
    ["server CPU %", (r: StepRecord) => r.server.cpuPercent],
  ] as const) {
    console.log(`  ${label}: harness ${fmt(medianOf("harness", pick))}  production ${fmt(medianOf("production", pick))}`);
  }
}

// ---------------------------------------------------------------------------

async function main() {
  const options = parseOptions(process.argv.slice(2));
  if (!options.url) {
    try {
      execFileSync("taskset", ["-cp", String(options.clientCore), String(process.pid)], { stdio: "ignore" });
    } catch {
      console.warn("warning: could not pin the load generator to a CPU; results may be noisier");
    }
  }
  writeEnvironment(options);

  const scenarios: Record<string, (options: Options) => Promise<unknown>> = {
    smoke: scenarioSmoke,
    baseline: scenarioBaseline,
    ramp: scenarioRamp,
    connections: scenarioConnections,
    soak: scenarioSoak,
    calibrate: scenarioCalibrate,
    crosscheck: scenarioCrosscheck,
    overhead: scenarioOverhead,
  };
  const run = scenarios[options.scenario];
  if (!run) {
    console.error(`Unknown scenario "${options.scenario}". Choose: ${Object.keys(scenarios).join(", ")}`);
    process.exit(2);
  }
  await run(options);
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
