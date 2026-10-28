// Load generator: simulated pilots that behave like the real game client.
//
// Each pilot opens a WebSocket, joins a room of `playersPerRoom`, readies up and
// then streams a position update at `positionHz` (the real client sends one
// roughly every 66 ms while flying). The server answers every position update
// by broadcasting that player's state to the whole room.
//
// Latency is measured end to end, per message: every position update carries a
// tag in its `y` value (a repeating 24-step ramp that stays inside the server's
// anti-cheat movement clamp). The server echoes the accepted y back in its
// broadcast, so when a pilot sees its own tag come back it knows exactly which
// message that was and how long the round trip took (send -> server queue ->
// server processing -> broadcast -> receive). Timestamps are taken with
// performance.now() in a single process, so there is no clock skew.

import { monitorEventLoopDelay, performance } from "node:perf_hooks";
import { WebSocket, type RawData } from "ws";
import { summarizeLatencies, type LatencySummary } from "./stats";

const TAG_SLOTS = 24;
const TAG_BASE = 0.44; // 24 slots of 0.005 span 0.115, inside the 0.125 minimum clamp
const TAG_STEP = 0.005;
const FIRST_SLOT = 13; // slot 12 is y = 0.5, the server's initial position
const SETUP_TIMEOUT_MS = 20_000;
// Upper bound on the samples kept for one step (8 bytes each). The real size is
// computed from the planned load; this only guards against a runaway configuration.
const MAX_LATENCY_SAMPLES_LIMIT = 60_000_000;

/** Samples a step can produce: one per position update sent, plus a margin. */
function sampleCapacity(config: Pick<StepConfig, "rooms" | "playersPerRoom" | "positionHz" | "measureMs">) {
  const expected = config.rooms * config.playersPerRoom * config.positionHz * (config.measureMs / 1000);
  return Math.min(MAX_LATENCY_SAMPLES_LIMIT, Math.max(100_000, Math.ceil(expected * 1.5) + 10_000));
}

export type StepConfig = {
  url: string;
  rooms: number;
  playersPerRoom: number;
  positionHz: number;
  rampRoomsPerSecond: number;
  warmupMs: number;
  measureMs: number;
  /** When set, also report latency per sub-window (used by the soak test to show drift). */
  subWindowMs?: number;
};

/** Cumulative garbage-collection counters reported by the server harness (milliseconds of pause). */
export type GcTotals = {
  minorCount: number;
  minorMs: number;
  majorCount: number;
  majorMs: number;
  otherCount: number;
  otherMs: number;
};

export type SubWindow = {
  tSeconds: number;
  latencyMs: LatencySummary;
  /** Server GC counters at the end of this window (cumulative; null without instrumentation). */
  serverGc: GcTotals | null;
  serverHeapUsedMB: number | null;
};

export type ServerStats = {
  rssBytes: number;
  heapUsedBytes: number;
  heapTotalBytes: number;
  externalBytes: number;
  cpuSeconds: number;
  gc: GcTotals | null;
  /** null when the server was started without the event-loop monitor. */
  eventLoopDelayMs: { mean: number; p50: number; p95: number; p99: number; max: number } | null;
};

export type ServerProbe = {
  /** CPU seconds and RSS of the server process, read from the OS. */
  sample: () => { cpuSeconds: number; rssBytes: number } | null;
  /** The server's own stats endpoint (null for servers we do not control). */
  stats: (reset: boolean) => Promise<ServerStats | null>;
  /** Aggregate CPU steal for the machine, to flag noisy-neighbour interference. */
  system: () => { total: number; steal: number };
};

export type TimelinePoint = {
  tSeconds: number;
  serverCpuPercent: number | null;
  serverRssMB: number | null;
  generatorCpuPercent: number;
  positionsPerSecond: number;
  messagesReceivedPerSecond: number;
};

export type StepResult = {
  config: StepConfig & { clients: number };
  setup: { roomsReady: number; setupFailures: number; setupSeconds: number };
  latencyMs: LatencySummary;
  throughput: {
    positionsSentPerSecond: number;
    expectedPositionsPerSecond: number;
    messagesReceivedPerSecond: number;
    /** Latency samples captured divided by position updates sent (1 = every message measured). */
    sampleCoverage: number;
  };
  integrity: { eliminations: number; unexpectedCloses: number; socketErrors: number; sampleOverflow: number };
  generator: { cpuPercent: number; eventLoopP99Ms: number; eventLoopMaxMs: number };
  server: {
    cpuPercent: number | null;
    rssMBStart: number | null;
    rssMBEnd: number | null;
    rssMBMax: number | null;
    heapUsedMB: number | null;
    eventLoopDelayMs: ServerStats["eventLoopDelayMs"];
    /** Garbage-collection work done during the measurement window (null without instrumentation). */
    gc: GcTotals | null;
  };
  machine: { stealPercent: number };
  timeline: TimelinePoint[];
  subWindows: SubWindow[];
};

type Shared = {
  recording: boolean;
  latencies: Float64Array;
  latencyCount: number;
  /** Samples that did not fit in the buffer. Must stay 0 or the step is invalid. */
  latencyOverflow: number;
  positionsSent: number;
  messagesReceived: number;
  eliminations: number;
  unexpectedCloses: number;
  socketErrors: number;
  stopping: boolean;
};

function createShared(capacity: number): Shared {
  return {
    recording: false,
    latencies: new Float64Array(capacity),
    latencyCount: 0,
    latencyOverflow: 0,
    positionsSent: 0,
    messagesReceived: 0,
    eliminations: 0,
    unexpectedCloses: 0,
    socketErrors: 0,
    stopping: false,
  };
}

function deferred<T = void>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function withTimeout<T>(promise: Promise<T>, ms: number, what: string) {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`timed out waiting for ${what}`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

class Pilot {
  private socket!: WebSocket;
  private playerId: Buffer | null = null;
  private roomIdValue = "";
  private playersSeen = 0;
  private flying = false;
  private closing = false;
  private seq = 0;
  private nextAt = 0;
  private timer: NodeJS.Timeout | null = null;
  private readonly sentAt = new Float64Array(TAG_SLOTS).fill(Number.NaN);
  private readonly intervalMs: number;
  private readonly created = deferred<string>();
  private readonly lobbyFull = deferred();
  readonly running = deferred();

  constructor(
    private readonly shared: Shared,
    private readonly url: string,
    private readonly name: string,
    private readonly roomSize: number,
    positionHz: number,
  ) {
    this.intervalMs = 1000 / positionHz;
    // Only the room creator awaits this; for everyone else a rejection is expected and ignored.
    this.created.promise.catch(() => undefined);
  }

  async open() {
    this.socket = new WebSocket(this.url, {
      perMessageDeflate: false,
      skipUTF8Validation: true,
      handshakeTimeout: 15_000,
    });
    this.socket.on("message", (data) => this.onMessage(data));
    this.socket.on("close", () => {
      if (!this.closing && !this.shared.stopping) this.shared.unexpectedCloses++;
      this.stopFlying();
    });
    this.socket.on("error", () => {
      if (!this.shared.stopping) this.shared.socketErrors++;
    });
    await new Promise<void>((resolve, reject) => {
      this.socket.once("open", () => resolve());
      this.socket.once("error", reject);
    });
  }

  createRoom() {
    this.send({ type: "room:create", username: this.name });
    return this.created.promise;
  }

  joinRoom(roomId: string) {
    this.send({ type: "room:join", roomId, username: this.name });
  }

  waitForFullLobby() {
    return this.lobbyFull.promise;
  }

  ready() {
    this.send({ type: "room:ready", ready: true });
  }

  close() {
    this.closing = true;
    this.stopFlying();
    try {
      this.socket.close();
    } catch {
      // Already closed.
    }
  }

  private send(message: object) {
    if (this.socket.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify(message));
  }

  private onMessage(data: RawData) {
    const arrivedAt = performance.now();
    const shared = this.shared;
    shared.messagesReceived++;
    const buffer = data as Buffer;

    // Messages look like {"type":"<kind>", ...}; byte 9 starts the kind.
    if (buffer[9] === 0x70 /* p: player:update */) {
      const id = this.playerId;
      if (!id || buffer.indexOf(id) === -1) return; // another pilot's update
      const text = buffer.toString("utf8");
      if (text.includes('"alive":false')) {
        shared.eliminations++;
        return;
      }
      const match = /"y":([0-9.eE+-]+)/.exec(text);
      if (!match) return;
      const y = Number(match[1]);
      const slot = Math.round((y - TAG_BASE) / TAG_STEP);
      if (slot < 0 || slot >= TAG_SLOTS || Math.abs(y - (TAG_BASE + slot * TAG_STEP)) > 1e-9) return;
      const sent = this.sentAt[slot];
      if (Number.isNaN(sent)) return; // a later broadcast repeating a tag already matched
      this.sentAt[slot] = Number.NaN;
      if (shared.recording) {
        if (shared.latencyCount < shared.latencies.length) shared.latencies[shared.latencyCount++] = arrivedAt - sent;
        else shared.latencyOverflow++;
      }
      return;
    }

    if (buffer[14] === 0x75 /* u: room:update */) {
      const message = JSON.parse(buffer.toString("utf8")) as {
        room: { roomId: string; localPlayerId: string; phase: string; players: unknown[] };
      };
      const room = message.room;
      if (!this.playerId) this.playerId = Buffer.from(`"id":"${room.localPlayerId}"`);
      this.roomIdValue = room.roomId;
      this.playersSeen = room.players.length;
      this.created.resolve(room.roomId);
      if (this.playersSeen >= this.roomSize) this.lobbyFull.resolve();
      if (room.phase === "running" && !this.flying) this.startFlying();
      return;
    }

    if (buffer[14] === 0x65 /* e: room:error */) {
      const reason = buffer.toString("utf8");
      this.created.reject(new Error(reason));
    }
  }

  private startFlying() {
    this.flying = true;
    this.seq = FIRST_SLOT;
    this.nextAt = performance.now() + Math.random() * this.intervalMs;
    this.timer = setTimeout(this.tick, Math.max(0, this.nextAt - performance.now()));
    this.running.resolve();
  }

  private stopFlying() {
    this.flying = false;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  private tick = () => {
    if (!this.flying) return;
    const slot = this.seq % TAG_SLOTS;
    this.seq++;
    this.sentAt[slot] = performance.now();
    if (this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(`{"type":"player:position","x":0.2,"y":${TAG_BASE + slot * TAG_STEP}}`);
      if (this.shared.recording) this.shared.positionsSent++;
    }
    this.nextAt += this.intervalMs;
    this.timer = setTimeout(this.tick, Math.max(0, this.nextAt - performance.now()));
  };
}

type RoomHandle = { pilots: Pilot[] };

async function buildRoom(shared: Shared, config: StepConfig, roomIndex: number, startFlying: boolean): Promise<RoomHandle> {
  const pilots = Array.from(
    { length: config.playersPerRoom },
    (_, p) => new Pilot(shared, config.url, `P${roomIndex}-${p}`, config.playersPerRoom, config.positionHz),
  );
  const handle: RoomHandle = { pilots };
  try {
    await pilots[0].open();
    const roomId = await withTimeout(pilots[0].createRoom(), SETUP_TIMEOUT_MS, "room creation");
    await Promise.all(
      pilots.slice(1).map(async (pilot) => {
        await pilot.open();
        pilot.joinRoom(roomId);
      }),
    );
    await withTimeout(Promise.all(pilots.map((p) => p.waitForFullLobby())), SETUP_TIMEOUT_MS, "full lobby");
    if (startFlying) {
      pilots.forEach((pilot) => pilot.ready());
      await withTimeout(Promise.all(pilots.map((p) => p.running.promise)), SETUP_TIMEOUT_MS, "mission start");
    }
    return handle;
  } catch (error) {
    pilots.forEach((pilot) => pilot.close());
    throw error;
  }
}

async function buildRooms(shared: Shared, config: StepConfig, startFlying: boolean) {
  const rooms: RoomHandle[] = [];
  let failures = 0;
  const pending: Promise<void>[] = [];
  const startedAt = performance.now();
  for (let i = 0; i < config.rooms; i++) {
    pending.push(
      buildRoom(shared, config, i, startFlying).then(
        (room) => void rooms.push(room),
        () => void failures++,
      ),
    );
    await sleep(1000 / config.rampRoomsPerSecond);
  }
  await Promise.all(pending);
  return { rooms, failures, setupSeconds: (performance.now() - startedAt) / 1000 };
}

function closeAll(shared: Shared, rooms: RoomHandle[]) {
  shared.stopping = true;
  rooms.forEach((room) => room.pilots.forEach((pilot) => pilot.close()));
}

/** One measured load step: `rooms` concurrent missions, everyone flying. */
export async function runStep(config: StepConfig, probe: ServerProbe): Promise<StepResult> {
  const shared = createShared(sampleCapacity(config));
  const { rooms, failures, setupSeconds } = await buildRooms(shared, config, true);

  await sleep(config.warmupMs);

  const generatorLoop = monitorEventLoopDelay({ resolution: 1 });
  generatorLoop.enable();
  const statsAtStart = await probe.stats(true); // also resets the server's event-loop histogram

  const receivedAtStart = shared.messagesReceived;
  shared.recording = true;
  const windowStart = performance.now();
  const serverStart = probe.sample();
  const generatorCpuStart = process.cpuUsage();
  const systemStart = probe.system();
  const timeline: TimelinePoint[] = [];
  let previous = { at: windowStart, server: serverStart, cpu: generatorCpuStart, sent: 0, received: receivedAtStart };
  let rssMax = serverStart?.rssBytes ?? 0;
  const subWindows: SubWindow[] = [];
  let subWindowStartIndex = 0;
  let subWindowStartedAt = windowStart;

  while (performance.now() - windowStart < config.measureMs) {
    await sleep(1000);
    const now = performance.now();
    if (config.subWindowMs && now - subWindowStartedAt >= config.subWindowMs) {
      const snapshot = await probe.stats(false);
      subWindows.push({
        tSeconds: (now - windowStart) / 1000,
        latencyMs: summarizeLatencies(shared.latencies, shared.latencyCount, subWindowStartIndex),
        serverGc: snapshot?.gc ?? null,
        serverHeapUsedMB: snapshot ? snapshot.heapUsedBytes / 1048576 : null,
      });
      subWindowStartIndex = shared.latencyCount;
      subWindowStartedAt = now;
    }
    const elapsed = (now - previous.at) / 1000;
    const server = probe.sample();
    const cpu = process.cpuUsage();
    if (server) rssMax = Math.max(rssMax, server.rssBytes);
    timeline.push({
      tSeconds: (now - windowStart) / 1000,
      serverCpuPercent: server && previous.server ? (100 * (server.cpuSeconds - previous.server.cpuSeconds)) / elapsed : null,
      serverRssMB: server ? server.rssBytes / 1048576 : null,
      generatorCpuPercent: (100 * ((cpu.user + cpu.system) - (previous.cpu.user + previous.cpu.system))) / 1e6 / elapsed,
      positionsPerSecond: (shared.positionsSent - previous.sent) / elapsed,
      messagesReceivedPerSecond: (shared.messagesReceived - previous.received) / elapsed,
    });
    previous = { at: now, server, cpu, sent: shared.positionsSent, received: shared.messagesReceived };
  }

  shared.recording = false;
  const windowSeconds = (performance.now() - windowStart) / 1000;
  const serverEnd = probe.sample();
  const generatorCpuEnd = process.cpuUsage();
  const systemEnd = probe.system();
  const serverStats = await probe.stats(false);
  generatorLoop.disable();

  const latencyMs = summarizeLatencies(shared.latencies, shared.latencyCount);
  const clients = config.rooms * config.playersPerRoom;
  const generatorCpuSeconds =
    (generatorCpuEnd.user + generatorCpuEnd.system - generatorCpuStart.user - generatorCpuStart.system) / 1e6;
  const result: StepResult = {
    config: { ...config, clients },
    setup: { roomsReady: rooms.length, setupFailures: failures, setupSeconds },
    latencyMs,
    throughput: {
      positionsSentPerSecond: shared.positionsSent / windowSeconds,
      expectedPositionsPerSecond: rooms.length * config.playersPerRoom * config.positionHz,
      messagesReceivedPerSecond: (shared.messagesReceived - receivedAtStart) / windowSeconds,
      sampleCoverage: shared.positionsSent > 0 ? shared.latencyCount / shared.positionsSent : 0,
    },
    integrity: {
      eliminations: shared.eliminations,
      unexpectedCloses: shared.unexpectedCloses,
      socketErrors: shared.socketErrors,
      sampleOverflow: shared.latencyOverflow,
    },
    generator: {
      cpuPercent: (100 * generatorCpuSeconds) / windowSeconds,
      eventLoopP99Ms: generatorLoop.percentile(99) / 1e6,
      eventLoopMaxMs: generatorLoop.max / 1e6,
    },
    server: {
      cpuPercent: serverStart && serverEnd ? (100 * (serverEnd.cpuSeconds - serverStart.cpuSeconds)) / windowSeconds : null,
      rssMBStart: serverStart ? serverStart.rssBytes / 1048576 : null,
      rssMBEnd: serverEnd ? serverEnd.rssBytes / 1048576 : null,
      rssMBMax: rssMax ? rssMax / 1048576 : null,
      heapUsedMB: serverStats ? serverStats.heapUsedBytes / 1048576 : null,
      eventLoopDelayMs: serverStats?.eventLoopDelayMs ?? null,
      gc:
        serverStats?.gc && statsAtStart?.gc
          ? {
              minorCount: serverStats.gc.minorCount - statsAtStart.gc.minorCount,
              minorMs: serverStats.gc.minorMs - statsAtStart.gc.minorMs,
              majorCount: serverStats.gc.majorCount - statsAtStart.gc.majorCount,
              majorMs: serverStats.gc.majorMs - statsAtStart.gc.majorMs,
              otherCount: serverStats.gc.otherCount - statsAtStart.gc.otherCount,
              otherMs: serverStats.gc.otherMs - statsAtStart.gc.otherMs,
            }
          : null,
    },
    machine: {
      stealPercent:
        systemEnd.total > systemStart.total ? (100 * (systemEnd.steal - systemStart.steal)) / (systemEnd.total - systemStart.total) : 0,
    },
    timeline,
    subWindows,
  };
  closeAll(shared, rooms);
  await sleep(300);
  return result;
}

export type LobbyResult = {
  connections: number;
  connected: number;
  failures: number;
  connectSeconds: number;
  server: { rssMBBefore: number | null; rssMBAfter: number | null; kbPerConnection: number | null; idleCpuPercent: number | null; openFiles: number };
  generatorRssMB: number;
};

/**
 * Idle-connection capacity: `rooms` lobbies of `playersPerRoom` waiting
 * pilots, nobody flying. Measures memory per connection and idle CPU.
 */
export async function runLobbyStep(
  config: Omit<StepConfig, "warmupMs" | "measureMs">,
  probe: ServerProbe,
  openFiles: () => number,
): Promise<LobbyResult> {
  const shared = createShared(1); // idle lobbies record no latency
  const before = probe.sample();
  const full: StepConfig = { ...config, warmupMs: 0, measureMs: 0 };
  const { rooms, failures, setupSeconds } = await buildRooms(shared, full, false);
  const connected = rooms.length * config.playersPerRoom;

  await sleep(1500);
  const cpuStart = probe.sample();
  await sleep(10_000);
  const cpuEnd = probe.sample();
  const after = probe.sample();
  const files = openFiles();

  const result: LobbyResult = {
    connections: config.rooms * config.playersPerRoom,
    connected,
    failures,
    connectSeconds: setupSeconds,
    server: {
      rssMBBefore: before ? before.rssBytes / 1048576 : null,
      rssMBAfter: after ? after.rssBytes / 1048576 : null,
      kbPerConnection: before && after && connected > 0 ? (after.rssBytes - before.rssBytes) / 1024 / connected : null,
      idleCpuPercent: cpuStart && cpuEnd ? (100 * (cpuEnd.cpuSeconds - cpuStart.cpuSeconds)) / 10 : null,
      openFiles: files,
    },
    generatorRssMB: process.memoryUsage().rss / 1048576,
  };
  closeAll(shared, rooms);
  await sleep(500);
  return result;
}
