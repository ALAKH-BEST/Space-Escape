// Linux process / machine sampling used by the benchmark (reads /proc directly,
// so there are no extra tools to install and no sampling overhead worth noting).

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import os from "node:os";

const CLOCK_TICKS_PER_SECOND = 100; // USER_HZ on Linux

/** Total CPU time (user + system) a process has used, in seconds. */
export function readProcessCpuSeconds(pid: number) {
  const stat = readFileSync(`/proc/${pid}/stat`, "utf8");
  // Fields after the "(comm)" entry; utime and stime are fields 14 and 15 (1-based).
  const fields = stat.slice(stat.lastIndexOf(")") + 2).split(" ");
  return (Number(fields[11]) + Number(fields[12])) / CLOCK_TICKS_PER_SECOND;
}

export function readProcessRssBytes(pid: number) {
  const status = readFileSync(`/proc/${pid}/status`, "utf8");
  const match = /VmRSS:\s+(\d+) kB/.exec(status);
  return match ? Number(match[1]) * 1024 : 0;
}

export function readOpenFileCount(pid: number) {
  try {
    return execFileSync("ls", [`/proc/${pid}/fd`], { encoding: "utf8" }).split("\n").filter(Boolean).length;
  } catch {
    return 0;
  }
}

export type SystemCpu = { total: number; idle: number; steal: number };

/** Aggregate CPU counters across all cores (jiffies). */
export function readSystemCpu(): SystemCpu {
  const line = readFileSync("/proc/stat", "utf8").split("\n")[0];
  const values = line.trim().split(/\s+/).slice(1).map(Number);
  const [user, nice, system, idle, iowait, irq, softirq, steal] = values;
  return {
    total: user + nice + system + idle + iowait + irq + softirq + steal,
    idle: idle + iowait,
    steal: steal ?? 0,
  };
}

export function stealPercent(before: SystemCpu, after: SystemCpu) {
  const total = after.total - before.total;
  return total > 0 ? (100 * (after.steal - before.steal)) / total : 0;
}

export function captureEnvironment() {
  const cpus = os.cpus();
  const cpuModel = cpus[0]?.model ?? "unknown";
  const kernel = os.release();
  let hypervisor = "unknown";
  try {
    hypervisor = readFileSync("/sys/hypervisor/type", "utf8").trim();
  } catch {
    // Not available in every VM.
  }
  return {
    capturedAt: new Date().toISOString(),
    node: process.version,
    v8: process.versions.v8,
    platform: `${os.platform()} ${os.arch()}`,
    kernel,
    cpuModel,
    logicalCpus: cpus.length,
    cpuMHz: cpus[0]?.speed ?? null,
    totalMemoryMB: Math.round(os.totalmem() / 1024 / 1024),
    loadAverageAtStart: os.loadavg(),
    hypervisor,
    wsVersion: JSON.parse(readFileSync("node_modules/ws/package.json", "utf8")).version as string,
  };
}
