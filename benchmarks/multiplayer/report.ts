// Turns the raw benchmark JSON in a results directory into REPORT.md plus SVG
// charts. Every number in the report is computed from the recorded data, so the
// report can be regenerated (and checked) at any time:
//
//   npx tsx benchmarks/multiplayer/report.ts benchmarks/multiplayer/results/<date>

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { correlation, linearFit, linearSlope, median, permutationPValue } from "./stats";

// ---------------------------------------------------------------------------
// Loading
// ---------------------------------------------------------------------------

const dir = process.argv[2];
if (!dir) {
  console.error("usage: report.ts <results-directory>");
  process.exit(2);
}

function load<T = any>(name: string): T | null {
  const file = path.join(dir, name);
  return existsSync(file) ? (JSON.parse(readFileSync(file, "utf8")) as T) : null;
}

const environment = load("environment.json");
const calibration = load("calibration.json");
const baseline = load("baseline.json");
const connections = load("connections.json");
const crosscheck = load("crosscheck.json");
const soak = load("soak.json");
const soak50 = load("soak-50pct.json");
const overhead = load("overhead.json");
/** CPU (percentage points of one core) the in-process event-loop monitor adds to every harness run. */
const monitorOverhead: number = overhead?.overheadPercentagePoints ?? 0;
const ramps = readdirSync(dir)
  .filter((file) => /^ramp-\d+\.json$/.test(file))
  .sort()
  .map((file) => load(file));

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

const f = (value: number | null | undefined, digits = 1) =>
  value === null || value === undefined || !Number.isFinite(value) ? "n/a" : value.toFixed(digits);
const f0 = (value: number | null | undefined) => f(value, 0);
const pct = (value: number | null | undefined) => (value === null || value === undefined ? "n/a" : `${value.toFixed(0)}%`);
const med = (values: Array<number | null | undefined>) =>
  median(values.filter((v): v is number => v !== null && v !== undefined && Number.isFinite(v)));

function table(headers: string[], rows: Array<Array<string | number>>) {
  const line = (cells: Array<string | number>) => `| ${cells.join(" | ")} |`;
  return [line(headers), line(headers.map(() => "---")), ...rows.map(line)].join("\n");
}

// ---------------------------------------------------------------------------
// SVG charts (dependency-free)
// ---------------------------------------------------------------------------

type Series = { name: string; color: string; points: Array<[number, number]>; dashed?: boolean };
type Chart = {
  title: string;
  xLabel: string;
  yLabel: string;
  series: Series[];
  logY?: boolean;
  hLines?: Array<{ y: number; label: string }>;
  xMax?: number;
};

const COLORS = { blue: "#2563eb", orange: "#ea580c", red: "#dc2626", green: "#15803d", gray: "#6b7280", purple: "#7c3aed" };

function niceTicks(max: number, count = 6) {
  const rough = max / count;
  const magnitude = 10 ** Math.floor(Math.log10(rough || 1));
  const step = [1, 2, 5, 10].map((m) => m * magnitude).find((s) => s >= rough) ?? magnitude * 10;
  const ticks: number[] = [];
  for (let v = 0; v <= max + step * 0.01; v += step) ticks.push(v);
  return ticks;
}

function escapeXml(text: string) {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function lineChart(chart: Chart) {
  const width = 760;
  const height = 400;
  const margin = { top: 44, right: 24, bottom: 56, left: 64 };
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  const allPoints = chart.series.flatMap((s) => s.points);
  const xMax = chart.xMax ?? Math.max(1, ...allPoints.map((p) => p[0]));
  const yValues = [...allPoints.map((p) => p[1]), ...(chart.hLines ?? []).map((l) => l.y)].filter((v) => v > 0 || !chart.logY);
  const yMaxData = Math.max(1, ...yValues);

  let yTicks: number[];
  let yScale: (v: number) => number;
  if (chart.logY) {
    const lowExponent = Math.floor(Math.log10(Math.max(0.01, Math.min(...yValues))));
    const highExponent = Math.ceil(Math.log10(yMaxData));
    yTicks = [];
    for (let e = lowExponent; e <= highExponent; e++) yTicks.push(10 ** e);
    const low = Math.log10(yTicks[0]);
    const high = Math.log10(yTicks[yTicks.length - 1]);
    yScale = (v) => margin.top + plotHeight * (1 - (Math.log10(Math.max(v, 10 ** low)) - low) / (high - low || 1));
  } else {
    yTicks = niceTicks(yMaxData * 1.05);
    const top = yTicks[yTicks.length - 1];
    yScale = (v) => margin.top + plotHeight * (1 - v / top);
  }
  const xTicks = niceTicks(xMax);
  const xTop = xTicks[xTicks.length - 1];
  const xScale = (v: number) => margin.left + (plotWidth * v) / xTop;

  const parts: string[] = [];
  parts.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" font-family="system-ui, -apple-system, Segoe UI, sans-serif">`);
  parts.push(`<rect width="${width}" height="${height}" fill="#ffffff"/>`);
  parts.push(`<text x="${margin.left}" y="26" font-size="15" font-weight="600" fill="#111827">${escapeXml(chart.title)}</text>`);

  for (const tick of yTicks) {
    const y = yScale(tick);
    parts.push(`<line x1="${margin.left}" x2="${width - margin.right}" y1="${y}" y2="${y}" stroke="#e5e7eb"/>`);
    parts.push(`<text x="${margin.left - 8}" y="${y + 4}" font-size="11" text-anchor="end" fill="#374151">${tick >= 1000 ? tick / 1000 + "k" : tick}</text>`);
  }
  for (const tick of xTicks) {
    const x = xScale(tick);
    parts.push(`<line x1="${x}" x2="${x}" y1="${margin.top + plotHeight}" y2="${margin.top + plotHeight + 4}" stroke="#9ca3af"/>`);
    parts.push(`<text x="${x}" y="${margin.top + plotHeight + 18}" font-size="11" text-anchor="middle" fill="#374151">${tick}</text>`);
  }
  parts.push(`<line x1="${margin.left}" x2="${margin.left}" y1="${margin.top}" y2="${margin.top + plotHeight}" stroke="#9ca3af"/>`);
  parts.push(`<line x1="${margin.left}" x2="${width - margin.right}" y1="${margin.top + plotHeight}" y2="${margin.top + plotHeight}" stroke="#9ca3af"/>`);
  parts.push(`<text x="${margin.left + plotWidth / 2}" y="${height - 12}" font-size="12" text-anchor="middle" fill="#111827">${escapeXml(chart.xLabel)}</text>`);
  parts.push(`<text transform="translate(16 ${margin.top + plotHeight / 2}) rotate(-90)" font-size="12" text-anchor="middle" fill="#111827">${escapeXml(chart.yLabel)}</text>`);

  for (const line of chart.hLines ?? []) {
    const y = yScale(line.y);
    parts.push(`<line x1="${margin.left}" x2="${width - margin.right}" y1="${y}" y2="${y}" stroke="${COLORS.gray}" stroke-dasharray="6 4"/>`);
    parts.push(`<text x="${width - margin.right - 4}" y="${y - 5}" font-size="11" text-anchor="end" fill="${COLORS.gray}">${escapeXml(line.label)}</text>`);
  }

  for (const series of chart.series) {
    if (series.points.length === 0) continue;
    const sorted = [...series.points].sort((a, b) => a[0] - b[0]);
    const path = sorted.map(([x, y], i) => `${i === 0 ? "M" : "L"}${xScale(x).toFixed(1)} ${yScale(y).toFixed(1)}`).join(" ");
    parts.push(`<path d="${path}" fill="none" stroke="${series.color}" stroke-width="2.2"${series.dashed ? ' stroke-dasharray="5 3"' : ""}/>`);
    for (const [x, y] of sorted) parts.push(`<circle cx="${xScale(x).toFixed(1)}" cy="${yScale(y).toFixed(1)}" r="3" fill="${series.color}"/>`);
  }

  let legendX = margin.left;
  for (const series of chart.series) {
    parts.push(`<rect x="${legendX}" y="${height - 36}" width="12" height="4" fill="${series.color}"/>`);
    parts.push(`<text x="${legendX + 17}" y="${height - 31}" font-size="11" fill="#374151">${escapeXml(series.name)}</text>`);
    legendX += 30 + series.name.length * 6.2;
  }
  parts.push("</svg>");
  return parts.join("\n");
}

const chartsDir = path.join(dir, "charts");
mkdirSync(chartsDir, { recursive: true });
function writeChart(name: string, chart: Chart) {
  writeFileSync(path.join(chartsDir, name), lineChart(chart));
  return `![${chart.title}](charts/${name})`;
}

// ---------------------------------------------------------------------------
// Ramp aggregation
// ---------------------------------------------------------------------------

type Step = any;
const allSteps: Step[] = ramps.flatMap((ramp) => ramp?.steps ?? []);
const roomLevels = Array.from(new Set<number>(allSteps.map((s) => s.config.rooms))).sort((a, b) => a - b);
const byRooms = (rooms: number) => allSteps.filter((s) => s.config.rooms === rooms);

type Row = {
  rooms: number;
  clients: number;
  runs: number;
  passes: number;
  p50: number | null;
  p95: number | null;
  p95Min: number | null;
  p95Max: number | null;
  p99: number | null;
  max: number | null;
  serverCpu: number | null;
  rssMB: number | null;
  serverLoopP99: number | null;
  generatorCpu: number | null;
  generatorLoopP99: number | null;
  recvPerSecond: number | null;
  steal: number | null;
  /** Number of runs per verdict, e.g. "2 pass, 1 generator-limited". */
  verdictText: string;
  generatorLimited: number;
  /** Dropped connections, socket errors and wrongful eliminations summed over the runs. */
  integrityProblems: number;
  /** Server garbage-collection time as a share of the measured window (median over runs). */
  gcPercent: number | null;
  setupFailures: number;
  drops: number;
  socketErrors: number;
  eliminations: number;
};

const rows: Row[] = roomLevels.map((rooms) => {
  const steps = byRooms(rooms);
  const p95s = steps.map((s) => s.latencyMs.p95).filter((v: number | null) => v !== null) as number[];
  return {
    rooms,
    clients: steps[0].config.clients,
    runs: steps.length,
    passes: steps.filter((s) => s.verdict === "pass").length,
    p50: med(steps.map((s) => s.latencyMs.p50)),
    p95: med(p95s),
    p95Min: p95s.length ? Math.min(...p95s) : null,
    p95Max: p95s.length ? Math.max(...p95s) : null,
    p99: med(steps.map((s) => s.latencyMs.p99)),
    max: med(steps.map((s) => s.latencyMs.max)),
    serverCpu: med(steps.map((s) => s.server.cpuPercent)),
    rssMB: med(steps.map((s) => s.server.rssMBEnd)),
    serverLoopP99: med(steps.map((s) => s.server.eventLoopDelayMs?.p99)),
    generatorCpu: med(steps.map((s) => s.generator.cpuPercent)),
    generatorLoopP99: med(steps.map((s) => s.generator.eventLoopP99Ms)),
    recvPerSecond: med(steps.map((s) => s.throughput.messagesReceivedPerSecond)),
    steal: med(steps.map((s) => s.machine.stealPercent)),
    verdictText: Object.entries(
      steps.reduce((counts: Record<string, number>, s) => ({ ...counts, [s.verdict]: (counts[s.verdict] ?? 0) + 1 }), {}),
    )
      .map(([verdict, count]) => `${count} ${verdict}`)
      .join(", "),
    generatorLimited: steps.filter((s) => s.verdict === "generator-limited").length,
    gcPercent: med(
      steps.map((s) => (s.server.gc ? (100 * (s.server.gc.minorMs + s.server.gc.majorMs + s.server.gc.otherMs)) / s.config.measureMs : null)),
    ),
    setupFailures: steps.reduce((sum, s) => sum + s.setup.setupFailures, 0),
    drops: steps.reduce((sum, s) => sum + s.integrity.unexpectedCloses, 0),
    socketErrors: steps.reduce((sum, s) => sum + s.integrity.socketErrors, 0),
    eliminations: steps.reduce((sum, s) => sum + s.integrity.eliminations, 0),
    integrityProblems: steps.reduce(
      (sum, s) => sum + s.integrity.eliminations + s.integrity.unexpectedCloses + s.integrity.socketErrors + s.setup.setupFailures,
      0,
    ),
  };
});

// ---------------------------------------------------------------------------
// Soak and calibration analysis (computed here from the raw data)
// ---------------------------------------------------------------------------

type SoakMinute = {
  minute: number;
  p50: number;
  p95: number;
  p99: number;
  max: number;
  samples: number;
  cpu: number | null;
  rssMB: number | null;
  heapMB: number | null;
  /** Garbage-collection time inside this minute as a share of the minute (null for the first minute and when not recorded). */
  gcPercent: number | null;
};

function analyseSoak(data: any) {
  const record = data.record;
  const windows = (record.subWindows ?? []) as any[];
  const totalGcMs = (g: any) => (g ? g.minorMs + g.majorMs + g.otherMs : null);
  const minutes: SoakMinute[] = windows.map((w: any, i: number) => {
    const timeline = (record.timeline as any[]).filter((p) => p.tSeconds > i * 60 && p.tSeconds <= (i + 1) * 60 + 0.5);
    const mean = (get: (p: any) => number | null) => {
      const values = timeline.map(get).filter((v): v is number => v !== null && Number.isFinite(v));
      return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
    };
    // GC counters are cumulative since the server started, so a minute's GC is the difference
    // between two consecutive snapshots (the first minute has no earlier snapshot).
    const here = totalGcMs(w.serverGc);
    const before = i > 0 ? totalGcMs(windows[i - 1].serverGc) : null;
    const seconds = i > 0 ? w.tSeconds - windows[i - 1].tSeconds : 0;
    return {
      minute: i + 1,
      p50: w.latencyMs.p50,
      p95: w.latencyMs.p95,
      p99: w.latencyMs.p99,
      max: w.latencyMs.max,
      samples: w.latencyMs.count,
      cpu: mean((p) => p.serverCpuPercent),
      rssMB: mean((p) => p.serverRssMB),
      heapMB: w.serverHeapUsedMB ?? null,
      gcPercent: here !== null && before !== null && seconds > 0 ? (100 * (here - before)) / (seconds * 1000) : null,
    };
  });
  const trend =
    minutes.length >= 3
      ? linearFit(
          minutes.map((m) => m.minute),
          minutes.map((m) => m.p95),
        )
      : null;
  const half = Math.floor(minutes.length / 2);
  const firstHalfP95 = minutes.length >= 4 ? med(minutes.slice(0, half).map((m) => m.p95)) : null;
  const secondHalfP95 = minutes.length >= 4 ? med(minutes.slice(minutes.length - half).map((m) => m.p95)) : null;
  /** Memory slope over the second half of the soak, after warm-up growth has finished. */
  const lateMemorySlope = (() => {
    const timeline = (record.timeline ?? []) as any[];
    if (timeline.length < 20) return null;
    const late = timeline.slice(Math.floor(timeline.length / 2)).filter((p) => p.serverRssMB !== null);
    return linearSlope(late.map((p) => p.tSeconds), late.map((p) => p.serverRssMB)) * 60;
  })();
  const trendSignificant = trend?.slopeStdError != null && Math.abs(trend.slope) > 2 * trend.slopeStdError;
  const withGc = minutes.filter((m) => m.gcPercent !== null);
  const gcCorrelation = withGc.length >= 6 ? correlation(withGc.map((m) => m.gcPercent!), withGc.map((m) => m.p95)) : null;
  const meanGcPercent = withGc.length ? withGc.reduce((sum, m) => sum + m.gcPercent!, 0) / withGc.length : null;
  const maxGcPercent = withGc.length ? Math.max(...withGc.map((m) => m.gcPercent!)) : null;
  return { data, minutes, trend, firstHalfP95, secondHalfP95, lateMemorySlope, trendSignificant, gcCorrelation, meanGcPercent, maxGcPercent };
}
type SoakAnalysis = ReturnType<typeof analyseSoak>;

// Calibration: a faithful tool reads back injected delay with slope 1. Any constant offset is the
// test relay's own overhead (Node timers and two extra hops), so the 0 ms row is shown but not fitted.
const calibrationFit = (() => {
  const points = (calibration?.results ?? []).filter((r: any) => r.injectedRoundTripMs > 0 && r.measuredP50 !== null);
  if (points.length < 3) return null;
  return linearFit(
    points.map((r: any) => r.injectedRoundTripMs),
    points.map((r: any) => r.measuredP50),
  );
})();
const calibrationPasses = calibrationFit !== null && Math.abs(calibrationFit.slope - 1) <= 0.01;

/** Marginal server memory per idle connection: least-squares slope of RSS against connection count. */
function marginalKbPerConnection(results: any[]) {
  const usable = results.filter((r) => r.server.rssMBAfter !== null);
  return linearSlope(
    usable.map((r) => r.connected),
    usable.map((r) => r.server.rssMBAfter),
  ) * 1024;
}

const breakingPoints = ramps.map((ramp) => ramp?.breakingPoint).filter(Boolean);
const lastPassing = breakingPoints.map((b: any) => b.lastPassingRooms as number);
const players = ramps[0]?.meta.playersPerRoom ?? 4;
const hz = ramps[0]?.meta.positionHz ?? 15;
const slo = ramps[0]?.meta.sloP95Ms ?? 100;
// Headline capacity is the lowest per-run breaking point: a level every run actually sustained
// (a median of two runs could land on a load level nobody tested).
const conservativeCapacity = lastPassing.length ? Math.min(...lastPassing) : null;
const lastPassingRow = rows.find((r) => r.rooms === conservativeCapacity) ?? rows.filter((r) => r.passes === r.runs).pop();
const medianCapacity = med(lastPassing);
// Heaviest soak first.
const soaks: SoakAnalysis[] = [soak, soak50]
  .filter((d) => d?.record && d?.summary)
  .map(analyseSoak)
  .sort((x, y) => y.data.summary.rooms - x.data.summary.rooms);
const soakShare = (a: SoakAnalysis) => (medianCapacity ? `, ${f0((100 * a.data.summary.rooms) / medianCapacity)}% of the median breaking point` : "");
const soakChartPrefix = (a: SoakAnalysis) => (a.data === soak ? "soak" : "soak-50pct");

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

const out: string[] = [];
const add = (...lines: string[]) => out.push(...lines);

add("# ASTRODODGE multiplayer scalability report", "");
add(
  `Generated from the raw data in this directory by \`benchmarks/multiplayer/report.ts\`. ` +
    `Nothing here is hand-edited: delete this file and run the generator to reproduce it.`,
  "",
);

if (environment) {
  add(
    `- **Run date (UTC):** ${environment.capturedAt}`,
    `- **Code under test:** commit \`${environment.git.commit.slice(0, 10)}\`${environment.git.dirty ? " (working tree had uncommitted benchmark files)" : ""}, \`server/multiplayer.ts\` served by Node ${environment.node}, ws ${environment.wsVersion}`,
    `- **Machine:** ${environment.logicalCpus} vCPU ${environment.cpuModel}, ${environment.totalMemoryMB} MB RAM, ${environment.platform}, kernel ${environment.kernel} (virtual machine, hypervisor: ${environment.hypervisor})`,
    `- **Pinning:** server on CPU ${environment.pinning.serverCpu}, load generator on CPU ${environment.pinning.loadGeneratorCpu}, over the loopback interface`,
    "",
  );
}

// ---- Headline ----
add("## Headline results", "");
if (rows.length && lastPassingRow) {
  const nextFail = rows.find((r) => r.rooms > lastPassingRow.rooms && r.passes < r.runs);
  add(
    `- **Capacity:** one server process (one CPU core) held the **p95 round-trip latency under ${slo} ms at ${f0(conservativeCapacity)} concurrent ` +
      `${players}-player rooms (${f0((conservativeCapacity ?? 0) * players)} simultaneously flying clients) or more** in each of ${lastPassing.length} independent ramp run${lastPassing.length === 1 ? "" : "s"}. ` +
      `The highest level that passed in each run was ${lastPassing.join(", ")} rooms, so the breaking point on this machine is about ${Math.min(...lastPassing)}–${Math.max(...lastPassing)} rooms ` +
      `(${Math.min(...lastPassing) * players}–${Math.max(...lastPassing) * players} clients).` +
      (nextFail ? ` The first level above that where any run did not pass was ${nextFail.rooms} rooms (${nextFail.clients} clients; ${nextFail.verdictText}).` : ""),
    `- **Latency at ${lastPassingRow.rooms} rooms** (${lastPassingRow.runs} run${lastPassingRow.runs === 1 ? "" : "s"} at this level): p50 ${f(lastPassingRow.p50)} ms, p95 ${f(lastPassingRow.p95)} ms, p99 ${f(lastPassingRow.p99)} ms.`,
  );
}
const floor = baseline?.runs?.length ? med(baseline.runs.map((r: any) => r.latencyMs.p50)) : null;
const floor99 = baseline?.runs?.length ? med(baseline.runs.map((r: any) => r.latencyMs.p99)) : null;
if (floor !== null) add(`- **Uncontended latency:** one room on an idle server has a median round trip of ${f(floor, 2)} ms (p99 ${f(floor99, 2)} ms).`);

const saturated = rows.filter((r) => r.serverLoopP99 !== null && r.serverLoopP99 > 100);
if (saturated.length) {
  const first = saturated[0];
  const beyond = rows.filter((r) => r.rooms >= first.rooms);
  const problems = beyond.reduce((sum, r) => sum + r.integrityProblems, 0);
  const sumOf = (get: (r: Row) => number) => beyond.reduce((sum, r) => sum + get(r), 0);
  add(
    `- **Failure mode:** at ${first.rooms} rooms the single-threaded server's own event loop stalls (server event-loop delay p99 ${f0(first.serverLoopP99)} ms) ` +
      `with CPU at ${pct(first.serverCpu)} of one core, so messages queue and latency climbs. ` +
      (problems === 0
        ? `Across the ${beyond.reduce((sum, r) => sum + r.runs, 0)} runs at ${first.rooms} rooms and above there were no dropped connections, socket errors or wrongly eliminated players: the server slows down rather than failing.`
        : `Across the runs at ${first.rooms} rooms and above there were ${sumOf((r) => r.setupFailures)} failed room starts (a room whose players could not all join and ready up in time), ` +
          `${sumOf((r) => r.drops)} dropped connections, ${sumOf((r) => r.socketErrors)} socket errors and ${sumOf((r) => r.eliminations)} wrongly eliminated players (breakdown by level below the ramp table).`),
  );
}
const perMessage = rows.filter((r) => r.serverCpu && r.recvPerSecond && r.rooms >= 50 && r.passes === r.runs);
if (perMessage.length) {
  // Server CPU includes the constant cost of the event-loop monitor; remove it so the figure is per message.
  const cost = med(perMessage.map((r) => (((r.serverCpu! - monitorOverhead) / 100) / r.recvPerSecond!) * 1e6));
  const perClient = med(perMessage.map((r) => r.recvPerSecond! / r.clients));
  add(
    `- **Cost per message:** about ${f(cost)} µs of server CPU per delivered message, and each client receives about ${f0(perClient)} messages per second ` +
      `(the ${hz} Hz position stream from ${players} players is ${hz * players} messages per second; the rest are score-change broadcasts).`,
  );
}
const memoryClients = rows.filter((r) => r.rssMB !== null && r.passes === r.runs);
if (memoryClients.length >= 2) {
  const low = memoryClients[0];
  const high = memoryClients[memoryClients.length - 1];
  add(`- **Memory:** server resident memory grew from ${f0(low.rssMB)} MB at ${low.clients} clients to ${f0(high.rssMB)} MB at ${high.clients} clients.`);
}
if (connections?.results?.length) {
  const last = connections.results[connections.results.length - 1];
  const okRows = connections.results.filter((r: any) => r.failures === 0);
  const biggest = okRows[okRows.length - 1];
  if (biggest) {
    add(
      `- **Idle connections:** ${biggest.connected} lobby connections were held with ${f0(biggest.server.rssMBAfter)} MB resident ` +
        `(about ${f(marginalKbPerConnection(okRows), 1)} kB per additional connection) and ${f(biggest.server.idleCpuPercent, 2)}% idle CPU` +
        (last.failures > 0 ? `; ${last.connections} failed (${last.failures} errors).` : "; no failures up to the largest size tested."),
    );
  }
}
for (const a of soaks) {
  const sm = a.data.summary;
  const rec = a.data.record;
  const p95s = a.minutes.map((m) => m.p95);
  const within = a.minutes.filter((m) => m.p95 <= slo).length;
  const problems = rec.integrity.eliminations + rec.integrity.unexpectedCloses + rec.integrity.socketErrors;
  add(
    `- **Sustained load (${sm.rooms} rooms, ${sm.clients} clients${soakShare(a)}, ${sm.minutes} minutes):** ${problems} dropped connections, errors or wrongful eliminations. ` +
      `${within} of ${a.minutes.length} one-minute windows kept p95 within ${slo} ms (minute-to-minute p95 ranged ${f(Math.min(...p95s))}–${f(Math.max(...p95s))} ms)` +
      (a.trend?.slopeStdError != null
        ? `, trend ${a.trend.slope >= 0 ? "+" : ""}${f(a.trend.slope, 2)} ± ${f(a.trend.slopeStdError, 2)} ms per minute (1 standard error): ${a.trendSignificant ? `a drift distinguishable from the noise (about ${f(a.trend.slope * (a.minutes.length - 1), 1)} ms over the run)` : "no drift distinguishable from the minute-to-minute noise"}. `
        : ". ") +
      `Memory went from ${f0(sm.rssStartMB)} MB to ${f0(sm.rssEndMB)} MB` +
      (a.lateMemorySlope !== null ? ` (${f(a.lateMemorySlope, 2)} MB/min over the second half, after warm-up).` : ".") +
      (a.meanGcPercent !== null ? ` Garbage collection took ${f(a.meanGcPercent, 2)}% of wall time on average.` : ""),
  );
}
if (calibrationFit) {
  add(
    `- **Measurement accuracy:** with a known delay of 20–100 ms injected between client and server, the tool's readings rise with slope ${f(calibrationFit.slope, 4)} ` +
      `(1.0000 is exact; ${calibrationPasses ? "within the 1% standard" : "outside the 1% standard"}) plus a constant offset of ${f(calibrationFit.intercept, 2)} ms, which comes from the test relay itself.`,
  );
}
add("");

// ---- Workload ----
add(
  "## What was tested",
  "",
  `Each simulated pilot behaves like the real game client: it opens a WebSocket, joins a room of ${players}, readies up, and then sends a position ` +
    `update about ${hz} times per second (the real client sends one roughly every 66 ms while flying). The server answers each update by broadcasting that player's ` +
    `state to everyone in the room, and a 250 ms server tick scores rooms and eliminates silent players. All pilots stay alive for the whole measurement, ` +
    `which is the worst case for the server (real runs end when a ship crashes).`,
  "",
  `**Latency** is the full round trip of a single message: send, server queueing and processing, broadcast, receive. Each position update carries a tag ` +
    `that comes back in the server's broadcast, so every message is timed individually using one clock. Percentiles are exact over every sample ` +
    `(nearest-rank), not estimates. See [METHODOLOGY.md](../../METHODOLOGY.md) for the full method and its limits.`,
  "",
  `A load level **passes** when: p95 latency ≤ ${slo} ms; no pilot is wrongly eliminated; no connection drops or socket errors; every room starts; ` +
    `at least 95% of messages complete a measured round trip; and the load generator itself is healthy (its event loop stays responsive, so it is not distorting results). ` +
    `The **breaking point** is the highest tested load level that passes, with the gap to the first failing level narrowed by bisection to about 5%.`,
  "",
);

// ---- Ramp ----
if (rows.length) {
  add("## Load ramp: concurrent rooms", "");
  add(
    `Every row is a fresh server process. Latency and CPU are medians across the ${ramps.length} independent ramp run${ramps.length === 1 ? "" : "s"} ` +
      `(p95 min–max shown to expose run-to-run variation). Server CPU is a percentage of one core` +
      (overhead
        ? ` and includes about ${f(monitorOverhead, 1)} percentage points of constant overhead from the benchmark's own event-loop monitor (measured below; the production server does not have it).`
        : `.`),
    "",
  );
  add(
    table(
      ["Rooms", "Clients", "p50 ms", "p95 ms", "p95 min–max", "p99 ms", "max ms", "Server CPU", "Server RSS MB", "Server loop p99 ms", "Server GC %", "Verdict"],
      rows.map((r) => [
        r.rooms,
        r.clients,
        f(r.p50, 2),
        f(r.p95),
        `${f(r.p95Min)}–${f(r.p95Max)}`,
        f(r.p99),
        f0(r.max),
        pct(r.serverCpu),
        f0(r.rssMB),
        f(r.serverLoopP99),
        r.gcPercent === null ? "n/a" : f(r.gcPercent, 2),
        r.verdictText,
      ]),
    ),
    "",
    "Server GC % is the share of the measured window the server spent in garbage collection.",
    "",
    "Levels that are not round numbers exist because each run narrowed down its own breaking point by bisection, so they were only tested in the runs whose bisection reached them; the Verdict column shows how many runs each level has.",
    "",
    "A *generator-limited* run means the load generator, not the server, was saturated (its CPU above 97% or its event loop more than 10 ms behind), so that run's latency is not a valid measurement of the server and is not counted as a pass or a server failure. Latency columns are medians over all runs at that level, including such runs.",
    "",
  );
  const notPassing = rows.filter((r) => r.passes < r.runs);
  if (notPassing.length) {
    add("### What happened at the levels that did not pass", "");
    add(
      "Counts are summed over every run at that level. Failed room starts are rooms whose four players could not all join and ready up within the setup timeout, which happens when the server's event loop is stalled for seconds at a time.",
      "",
      table(
        ["Rooms", "Verdicts", "Failed room starts", "Dropped connections", "Socket errors", "Wrongly eliminated"],
        notPassing.map((r) => [r.rooms, r.verdictText, r.setupFailures, r.drops, r.socketErrors, r.eliminations]),
      ),
      "",
    );
  }
  add(
    writeChart("latency-vs-load.svg", {
      title: "Message round-trip latency vs load (log scale)",
      xLabel: "Concurrent clients",
      yLabel: "Latency (ms)",
      logY: true,
      hLines: [{ y: slo, label: `${slo} ms objective` }],
      series: [
        { name: "p50", color: COLORS.green, points: rows.filter((r) => r.p50 !== null).map((r) => [r.clients, r.p50!]) },
        { name: "p95", color: COLORS.blue, points: rows.filter((r) => r.p95 !== null).map((r) => [r.clients, r.p95!]) },
        { name: "p99", color: COLORS.red, points: rows.filter((r) => r.p99 !== null).map((r) => [r.clients, r.p99!]) },
      ],
    }),
    "",
  );
  add(
    writeChart("cpu-vs-load.svg", {
      title: "CPU use vs load (percent of one core)",
      xLabel: "Concurrent clients",
      yLabel: "CPU %",
      series: [
        { name: "Server", color: COLORS.blue, points: rows.filter((r) => r.serverCpu !== null).map((r) => [r.clients, r.serverCpu!]) },
        { name: "Load generator", color: COLORS.orange, dashed: true, points: rows.filter((r) => r.generatorCpu !== null).map((r) => [r.clients, r.generatorCpu!]) },
      ],
      hLines: [{ y: 100, label: "one core" }],
    }),
    "",
  );
  add(
    writeChart("event-loop-vs-load.svg", {
      title: "Event-loop delay (p99) vs load, server and load generator (log scale)",
      xLabel: "Concurrent clients",
      yLabel: "Delay (ms)",
      logY: true,
      series: [
        { name: "Server", color: COLORS.blue, points: rows.filter((r) => r.serverLoopP99 !== null).map((r) => [r.clients, Math.max(0.1, r.serverLoopP99!)]) },
        { name: "Load generator", color: COLORS.orange, dashed: true, points: rows.filter((r) => r.generatorLoopP99 !== null).map((r) => [r.clients, Math.max(0.1, r.generatorLoopP99!)]) },
      ],
    }),
    "",
  );
  // Is the server or the test tool the bottleneck? Shown from the data, not asserted.
  const nearLimit = rows.filter((r) => r.rooms >= Math.max(50, 0.5 * (conservativeCapacity ?? 0)));
  if (nearLimit.length) {
    add("### Is the server or the test tool the limit?", "");
    add(
      "The load generator is one Node process and does about as much work as the server (it receives every broadcast), so near the limit both approach a full core. " +
        "The server's own event-loop delay is measured inside the server process and does not depend on the generator, so it shows which side is actually falling behind.",
      "",
      table(
        ["Rooms", "Server CPU", "Server loop p99 ms", "Server loop max ms", "Generator CPU", "Generator loop p99 ms"],
        nearLimit.map((r) => [
          r.rooms,
          pct(r.serverCpu),
          f(r.serverLoopP99),
          f0(med(byRooms(r.rooms).map((s) => s.server.eventLoopDelayMs?.max))),
          pct(r.generatorCpu),
          f(r.generatorLoopP99),
        ]),
      ),
      "",
    );
    const stalled = nearLimit.find((r) => r.serverLoopP99 !== null && r.serverLoopP99 > 100);
    if (stalled) {
      add(
        `At ${stalled.rooms} rooms the server's event loop is a median of ${f0(stalled.serverLoopP99)} ms behind at p99 while the generator's is ${f(stalled.generatorLoopP99)} ms: ` +
          `the delay is being added by the server. Below that, the two sides rise together, and the exact level where p95 crosses ${slo} ms carries the uncertainty described in the limitations.`,
        "",
      );
    } else {
      add("The server's event loop never stalled badly at the levels tested, so a server limit was not reached.", "");
    }
  }
  add(
    writeChart("memory-vs-load.svg", {
      title: "Server resident memory vs load",
      xLabel: "Concurrent clients",
      yLabel: "RSS (MB)",
      series: [{ name: "Server RSS", color: COLORS.purple, points: rows.filter((r) => r.rssMB !== null).map((r) => [r.clients, r.rssMB!]) }],
    }),
    "",
  );

  add("### Breaking point per run", "");
  add(
    table(
      ["Run", "Last passing rooms", "Last passing clients", "First non-passing rooms", "Why it did not pass"],
      breakingPoints.map((b: any, i: number) => [
        i + 1,
        b.lastPassingRooms,
        b.lastPassingClients,
        b.firstNonPassingRooms ?? "not reached",
        b.firstNonPassingReason ?? "",
      ]),
    ),
    "",
  );
}

// ---- Baseline ----
if (baseline?.runs?.length) {
  add("## Uncontended baseline: one room", "");
  add(
    table(
      ["Run", "Samples", "p50 ms", "p95 ms", "p99 ms", "max ms", "Server CPU", "Server RSS MB"],
      baseline.runs.map((r: any, i: number) => [
        i + 1,
        r.latencyMs.count,
        f(r.latencyMs.p50, 2),
        f(r.latencyMs.p95, 2),
        f(r.latencyMs.p99, 2),
        f(r.latencyMs.max, 1),
        pct(r.server.cpuPercent),
        f0(r.server.rssMBEnd),
      ]),
    ),
    "",
  );
}

// ---- Connections ----
if (connections?.results?.length) {
  add("## Idle connection capacity", "");
  add(
    `Pilots connected and waiting in lobbies (${players} per room), nobody flying. Measures what a connection costs when nothing is happening. ` +
      `Each size is a fresh server process, so "kB / connection" at small sizes includes one-off warm-up memory; the marginal cost per additional connection ` +
      `(least-squares slope of memory against connections across all sizes) is **${f(marginalKbPerConnection(connections.results.filter((r: any) => r.failures === 0)), 1)} kB**.`,
    "",
  );
  add(
    table(
      ["Connections", "Connected", "Failures", "Connect time s", "Server RSS MB", "kB / connection", "Idle CPU", "Server open files"],
      connections.results.map((r: any) => [
        r.connections,
        r.connected,
        r.failures,
        f(r.connectSeconds),
        f0(r.server.rssMBAfter),
        f(r.server.kbPerConnection),
        `${f(r.server.idleCpuPercent, 2)}%`,
        r.server.openFiles,
      ]),
    ),
    "",
  );
  add(
    writeChart("connections-memory.svg", {
      title: "Server memory vs idle connections",
      xLabel: "Idle connections",
      yLabel: "RSS (MB)",
      series: [
        { name: "Server RSS", color: COLORS.purple, points: connections.results.filter((r: any) => r.server.rssMBAfter !== null).map((r: any) => [r.connected, r.server.rssMBAfter]) },
      ],
    }),
    "",
  );
}

// ---- Soak ----
function renderSoak(a: SoakAnalysis) {
  const record = a.data.record;
  const sm = a.data.summary;
  const timeline = record.timeline as any[];
  const prefix = soakChartPrefix(a);
  const hasGc = a.minutes.some((m) => m.gcPercent !== null);
  add(`## Soak test: ${sm.rooms} rooms`, "");
  add(
    `${sm.rooms} rooms (${sm.clients} clients)${soakShare(a)}, for ${sm.minutes} minutes on one server process.`,
    "",
    table(
      ["Metric", "Value"],
      [
        ["Memory at start / end", `${f0(sm.rssStartMB)} MB / ${f0(sm.rssEndMB)} MB`],
        ["Memory trend, whole run / second half (least squares)", `${f(sm.rssSlopeMBPerMinute, 2)} / ${a.lateMemorySlope === null ? "n/a" : f(a.lateMemorySlope, 2)} MB per minute (the whole-run figure includes warm-up growth)`],
        ["p95 latency per minute: lowest / median / highest", a.minutes.length ? `${f(Math.min(...a.minutes.map((m) => m.p95)))} / ${f(med(a.minutes.map((m) => m.p95)))} / ${f(Math.max(...a.minutes.map((m) => m.p95)))} ms` : "n/a"],
        ["Minutes with p95 within the objective", `${a.minutes.filter((m) => m.p95 <= slo).length} of ${a.minutes.length} (objective ${slo} ms)`],
        ["p95 latency, median of first half / second half", a.firstHalfP95 === null ? "n/a" : `${f(a.firstHalfP95)} ms / ${f(a.secondHalfP95)} ms`],
        ["p95 trend (least squares over the minutes)", a.trend?.slopeStdError != null ? `${a.trend.slope >= 0 ? "+" : ""}${f(a.trend.slope, 2)} ± ${f(a.trend.slopeStdError, 2)} ms per minute (1 standard error)` : "n/a"],
        ["Whole-run p50 / p95 / p99 / max", `${f(record.latencyMs.p50, 2)} / ${f(record.latencyMs.p95)} / ${f(record.latencyMs.p99)} / ${f0(record.latencyMs.max)} ms`],
        ["Server CPU (mean)", pct(record.server.cpuPercent)],
        ...(hasGc
          ? [
              ["Garbage collection, share of wall time: mean / highest minute", `${f(a.meanGcPercent, 2)}% / ${f(a.maxGcPercent, 2)}%`],
              [
                "Correlation of per-minute p95 with per-minute GC share",
                a.gcCorrelation === null
                  ? "n/a"
                  : `r = ${f(a.gcCorrelation, 2)} over ${a.minutes.filter((m) => m.gcPercent !== null).length} minutes (${
                      a.gcCorrelation >= 0.7
                        ? "latency rises and falls with GC time, consistent with GC contributing"
                        : Math.abs(a.gcCorrelation) < 0.5
                          ? "GC time does not explain the minute-to-minute latency"
                          : "a moderate relationship; correlation alone does not show cause"
                    })`,
              ],
            ]
          : []),
        ["Wrongly eliminated / dropped / errors", `${record.integrity.eliminations} / ${record.integrity.unexpectedCloses} / ${record.integrity.socketErrors}`],
      ] as string[][],
    ),
    "",
  );
  if (a.minutes.length) {
    add(
      "Latency per one-minute window. The minute-to-minute spread can be large because a single-threaded server running near its limit queues messages in bursts, so no single minute should be compared with another in isolation; the trend line above uses all of them." +
        (hasGc ? " GC % is the share of that minute the server spent in garbage collection (the first minute has no earlier snapshot to subtract)." : ""),
      "",
      table(
        ["Minute", "Samples", "p50 ms", "p95 ms", "p99 ms", "max ms", "Server CPU", "Server RSS MB", ...(hasGc ? ["Heap MB", "GC %"] : [])],
        a.minutes.map((m) => [
          m.minute,
          m.samples,
          f(m.p50, 2),
          f(m.p95),
          f(m.p99),
          f0(m.max),
          pct(m.cpu),
          f(m.rssMB),
          ...(hasGc ? [f(m.heapMB), m.gcPercent === null ? "n/a" : f(m.gcPercent, 2)] : []),
        ]),
      ),
      "",
    );
  }
  add(
    writeChart(`${prefix}-memory.svg`, {
      title: `Soak (${sm.rooms} rooms): server memory over time`,
      xLabel: "Seconds into the test",
      yLabel: "RSS (MB)",
      series: [{ name: "Server RSS", color: COLORS.purple, points: timeline.filter((p) => p.serverRssMB !== null).map((p) => [p.tSeconds, p.serverRssMB]) }],
    }),
    "",
    writeChart(`${prefix}-latency.svg`, {
      title: `Soak (${sm.rooms} rooms): p50 / p95 / p99 latency per minute (log scale)`,
      xLabel: "Seconds into the test",
      yLabel: "Latency (ms)",
      logY: true,
      series: [
        { name: "p50", color: COLORS.green, points: record.subWindows.map((w: any) => [w.tSeconds, Math.max(0.1, w.latencyMs.p50)]) },
        { name: "p95", color: COLORS.blue, points: record.subWindows.map((w: any) => [w.tSeconds, Math.max(0.1, w.latencyMs.p95)]) },
        { name: "p99", color: COLORS.red, points: record.subWindows.map((w: any) => [w.tSeconds, Math.max(0.1, w.latencyMs.p99)]) },
      ],
    }),
    "",
  );
}
for (const a of soaks) renderSoak(a);

// ---- Cross-check ----
if (crosscheck?.runs?.length) {
  add("## Cross-check: isolated server vs full production server", "");
  add(
    `The ramp uses the multiplayer module on its own (no Express, sessions or database), because the WebSocket path does not use them. To check that this does not flatter the results, ` +
      `${crosscheck.rooms} rooms were run alternately against that harness and against the real production bundle (\`dist/index.cjs\`, started exactly as on Render, with a dummy database address that is never contacted).`,
    "",
  );
  const kinds = ["harness", "production"] as const;
  const pick = (kind: string, get: (r: any) => number | null) => med(crosscheck.runs.filter((r: any) => r.server === kind).map((r: any) => get(r.record)));
  const spread = (kind: string, get: (r: any) => number | null) => {
    const values = crosscheck.runs
      .filter((r: any) => r.server === kind)
      .map((r: any) => get(r.record))
      .filter((v: number | null): v is number => v !== null);
    return values.length ? `${f(Math.min(...values))}–${f(Math.max(...values))}` : "n/a";
  };
  add(
    table(
      ["Server", "Runs", "p50 ms", "p95 ms", "p95 min–max", "p99 ms", "Server CPU", "Server RSS MB"],
      kinds.map((kind) => [
        kind === "harness" ? "multiplayer module only (with event-loop monitor)" : "full production bundle",
        crosscheck.runs.filter((r: any) => r.server === kind).length,
        f(pick(kind, (r) => r.latencyMs.p50), 2),
        f(pick(kind, (r) => r.latencyMs.p95)),
        spread(kind, (r) => r.latencyMs.p95),
        f(pick(kind, (r) => r.latencyMs.p99)),
        pct(pick(kind, (r) => r.server.cpuPercent)),
        f0(pick(kind, (r) => r.server.rssMBEnd)),
      ]),
    ),
    "",
  );
  const values = (kind: string, get: (r: any) => number | null) =>
    crosscheck.runs
      .filter((r: any) => r.server === kind)
      .map((r: any) => get(r.record))
      .filter((v: number | null): v is number => v !== null);
  const harnessP95s = values("harness", (r) => r.latencyMs.p95);
  const productionP95s = values("production", (r) => r.latencyMs.p95);
  // The harness carries the event-loop monitor's CPU cost; production does not, so compare like with like.
  const harnessCpus = values("harness", (r) => (r.server.cpuPercent === null ? null : r.server.cpuPercent - monitorOverhead));
  const productionCpus = values("production", (r) => r.server.cpuPercent);
  const choose = (n: number, k: number) => {
    let result = 1;
    for (let i = 1; i <= k; i++) result = (result * (n - k + i)) / i;
    return Math.round(result);
  };
  const smallestP = (a: number[], b: number[]) => (a.length && b.length ? 2 / choose(a.length + b.length, a.length) : 1);
  const compare = (name: string, unit: string, a: number[], b: number[], digits: number) => {
    const ma = med(a);
    const mb = med(b);
    const p = permutationPValue(a, b);
    if (ma === null || mb === null || p === null) return `${name}: not enough runs to compare.`;
    const change = ma > 0 ? (100 * (mb - ma)) / ma : 0;
    const verdict =
      p >= 0.05
        ? smallestP(a, b) > 0.05
          ? `too few runs (${a.length} and ${b.length}) for the test to be able to reach p < 0.05, so no difference can be claimed`
          : "not distinguishable from run-to-run variation"
        : mb > ma
          ? "production is measurably higher"
          : "production is measurably lower";
    return `${name}: median ${f(ma, digits)} ${unit} (isolated module) vs ${f(mb, digits)} ${unit} (production), ${change >= 0 ? "+" : ""}${f(change, 0)}%; exact permutation test over all ${a.length + b.length} runs p = ${f(p, 3)}, ${verdict}.`;
  };
  add(
    "Comparison by exact permutation test (the share of all ways of re-splitting the runs into two groups that differ at least as much as the observed split; no distribution assumed):",
    "",
    `- ${compare("p95 latency", "ms", harnessP95s, productionP95s, 1)}`,
    `- ${compare(`Server CPU (isolated module's figure has the event-loop monitor's measured ${f(monitorOverhead, 1)} percentage points removed)`, "%", harnessCpus, productionCpus, 1)}`,
    `- Memory: production resident memory is ${f0(pick("production", (r) => r.server.rssMBEnd))} MB against ${f0(pick("harness", (r) => r.server.rssMBEnd))} MB for the isolated module; the difference is the Express, session and database-client code that the bundle loads.`,
    "",
    "Where the test finds no difference, the ramp's capacity figures for the isolated module carry over to the production bundle within the run-to-run spread; where it finds one, the figures should be adjusted by about the stated percentage.",
    "",
  );
}

// ---- Calibration ----
if (calibration?.results?.length) {
  add("## Measurement calibration", "");
  add(
    `A relay that adds a fixed delay in each direction was placed between the load generator and the server. If the tool measures time correctly, the readings must rise one millisecond for every millisecond injected (slope 1). ` +
      `Any constant offset is the relay's own cost (two extra hops, and Node timers that cannot fire sooner than 1 ms), so it is reported separately instead of being counted as measurement error. ` +
      `The 0 ms row is shown for reference but not fitted, because a 0 ms timer is rounded up to 1 ms.`,
    "",
    table(
      ["Injected round trip ms", "Measured p50 ms", "Measured p95 ms", "Reading minus injected, ms"],
      calibration.results.map((r: any) => [r.injectedRoundTripMs, f(r.measuredP50, 2), f(r.measuredP95, 2), f(r.errorMs, 2)]),
    ),
    "",
  );
  if (calibrationFit) {
    add(
      `Least-squares fit of the 20, 50 and 100 ms readings: **slope ${f(calibrationFit.slope, 4)}**, constant offset ${f(calibrationFit.intercept, 2)} ms. ` +
        `The standard is a slope within 1% of 1: **${calibrationPasses ? "met" : "not met"}**. ` +
        (baseline?.runs?.length
          ? `For comparison, the same measurement without any relay (the uncontended baseline) reads about ${f(med(baseline.runs.map((r: any) => r.latencyMs.p50)), 2)} ms.`
          : ""),
      "",
    );
  }
}

// ---- Measurement overhead ----
if (overhead?.samples?.length) {
  add("## Measurement overhead", "");
  add(
    `The load-test server reports its own event-loop delay using Node's \`monitorEventLoopDelay\` with a 1 ms timer. That timer wakes the process 1000 times a second, so it costs CPU even when nothing is happening. ` +
      `An idle server was measured with and without it (${overhead.samples.length / 2} alternating rounds of ${overhead.secondsPerSample} s):`,
    "",
    table(
      ["Server", "Idle CPU (median)"],
      [
        ["monitor off", `${f(overhead.monitorOffCpuPercent, 2)}% of one core`],
        ["monitor on (used in ramp, soak, baseline)", `${f(overhead.monitorOnCpuPercent, 2)}% of one core`],
        ["overhead", `${f(overhead.overheadPercentagePoints, 2)} percentage points`],
      ],
    ),
    "",
    `The idle-connection test runs with the monitor off, so its idle CPU is not affected, and the production bundle in the cross-check has no monitor either.`,
    "",
  );
}

// ---- Limits ----
add(
  "## Limitations and how to read these numbers",
  "",
  "- **These are measurements of this machine, not of your Render instance.** Capacity scales with single-core speed. A fractional-CPU or throttled plan will be lower, a faster one higher. " +
    "The suite is designed to be re-run on the machine you care about (see the README in this folder); nothing here should be quoted as a guarantee for production.",
  "- **Loopback network.** There is no internet latency, TLS or reverse proxy in these round-trip times. A real player adds their own network delay on top, and Render's proxy adds its own overhead.",
  "- **Synthetic players.** Pilots are Node processes sending a fixed-rate position stream and never crash. Real sessions are shorter and burstier, and browsers add their own timing, so treat the figures as an upper bound on per-room load, not a forecast of real traffic.",
  "- **One server process.** The server is single-threaded and keeps all rooms in memory, so capacity is per process and rooms cannot be spread across instances without changes to the design.",
  "- **Load generator shares the machine.** Server and generator run on separate pinned cores of the same virtual machine. The report checks that the generator's event loop stays responsive, but noisy neighbours on the host can still add variation; the per-run CPU steal and the min–max columns show how large it was.",
  "- **The breaking point is a range, not an exact number.** The generator and the server both approach a full core near the limit, so some runs there are discarded as generator-limited. The reported capacity is the highest level at which every validity condition held; the server's own event-loop delay (see the section above) shows where it genuinely stalls, and the true limit lies between the two.",
  "- **The idle-connection test stopped by design.** It was run up to 16,000 connections because the test machine allows about 20,000 open files per process; no limit was reached, so the real ceiling is unknown and higher than the largest size shown.",
  "- **Only the multiplayer WebSocket path was measured.** Login, score submission, leaderboard and static file serving were not load tested here, and they share the same Node event loop in production.",
  "",
);

add(
  "## Reproduce",
  "",
  "```sh",
  "npm ci",
  `benchmarks/multiplayer/run-all.sh ${dir.replace(/\/$/, "")}   # about 50 minutes; keep the machine idle`,
  "```",
  "",
  "Individual scenarios and every option are documented in [README.md](../../README.md) next to the scripts. Raw data (every step, with per-second timelines) is in the JSON files in this directory.",
  "",
);

writeFileSync(path.join(dir, "REPORT.md"), out.join("\n"));

if (rows.length) {
  const header = [
    "rooms", "clients", "runs", "runs_passing", "p50_ms", "p95_ms", "p95_min_ms", "p95_max_ms", "p99_ms", "max_ms",
    "server_cpu_percent", "server_rss_mb", "server_event_loop_p99_ms", "generator_cpu_percent",
    "generator_event_loop_p99_ms", "messages_delivered_per_second", "cpu_steal_percent",
  ];
  const csvRows = rows.map((r) =>
    [
      r.rooms, r.clients, r.runs, r.passes, r.p50, r.p95, r.p95Min, r.p95Max, r.p99, r.max, r.serverCpu, r.rssMB,
      r.serverLoopP99, r.generatorCpu, r.generatorLoopP99, r.recvPerSecond, r.steal,
    ]
      .map((v) => (v === null ? "" : typeof v === "number" ? Number(v.toFixed(3)) : v))
      .join(","),
  );
  writeFileSync(path.join(dir, "ramp-summary.csv"), [header.join(","), ...csvRows].join("\n") + "\n");
}

console.log(`wrote ${path.join(dir, "REPORT.md")} and ${readdirSync(chartsDir).length} charts`);
