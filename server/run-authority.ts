import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";

export const SERVER_SCORE_RATE = 12;
export const MAX_RUN_SECONDS = 15 * 60;
export const MAX_AUTHORITATIVE_SCORE = SERVER_SCORE_RATE * MAX_RUN_SECONDS;

/**
 * A running game checks in with the server every couple of seconds (only while
 * the tab is visible and the game is actually advancing). Time between two
 * check-ins only counts towards the score up to this long, so a run that is
 * started and then left idle, hidden, or submitted much later earns almost
 * nothing, while a normal run (check-ins every ~2s) is scored exactly as the
 * wall-clock time it lasted.
 */
export const MAX_HEARTBEAT_GAP_MS = 10_000;

/**
 * Run tokens issued before heartbeats existed (a run that was already in
 * progress when this shipped) are still honoured for this long after they were
 * issued, so nobody loses a run mid-flight.
 */
const LEGACY_RUN_WINDOW_MS = 20 * 60 * 1_000;

export type RunMode = "solo" | "multiplayer";

type BaseClaims = {
  runId: string;
  userId: number;
  mode: RunMode;
  startedAt: number;
};

type LegacyRunClaims = BaseClaims & { version: 1 };

type HeartbeatRunClaims = BaseClaims & {
  version: 2;
  /** Server time of the latest check-in. */
  lastBeatAt: number;
  /** Milliseconds of play the server has credited so far. */
  activeMs: number;
};

type RunClaims = LegacyRunClaims | HeartbeatRunClaims;

export class RunAuthorityError extends Error {}

/**
 * Escape hatch for builds that cannot send heartbeats (for example a static
 * itch.io upload that has not been rebuilt). When set to "1", clients that do
 * not announce heartbeat support receive old-style run tokens. This leaves the
 * idle-run loophole open for those clients, so leave it off unless needed.
 */
export function legacyRunTokensAllowed() {
  return process.env.ALLOW_LEGACY_RUN_TOKENS === "1";
}

function getSigningSecret() {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    throw new RunAuthorityError("Server run signing is not configured");
  }
  return secret;
}

function sign(encodedClaims: string) {
  return createHmac("sha256", getSigningSecret()).update(encodedClaims).digest("base64url");
}

function encodeClaims(claims: RunClaims) {
  const encodedClaims = Buffer.from(JSON.stringify(claims)).toString("base64url");
  return `${encodedClaims}.${sign(encodedClaims)}`;
}

export function issueRun(userId: number, mode: RunMode, options: { legacy?: boolean } = {}) {
  const startedAt = Date.now();
  const base = { runId: randomUUID(), userId, mode, startedAt };
  const claims: RunClaims = options.legacy
    ? { version: 1, ...base }
    : { version: 2, ...base, lastBeatAt: startedAt, activeMs: 0 };
  return {
    runId: claims.runId,
    runToken: encodeClaims(claims),
    startedAt: claims.startedAt,
  };
}

export function verifyRun(runId: string, runToken: string, userId: number, now = Date.now()): RunClaims {
  const [encodedClaims, providedSignature] = runToken.split(".");
  if (!encodedClaims || !providedSignature) {
    throw new RunAuthorityError("Invalid run token");
  }

  const expectedSignature = sign(encodedClaims);
  const providedBuffer = Buffer.from(providedSignature);
  const expectedBuffer = Buffer.from(expectedSignature);
  if (
    providedBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(providedBuffer, expectedBuffer)
  ) {
    throw new RunAuthorityError("Invalid run token");
  }

  let claims: RunClaims;
  try {
    claims = JSON.parse(Buffer.from(encodedClaims, "base64url").toString("utf8")) as RunClaims;
  } catch {
    throw new RunAuthorityError("Invalid run token");
  }

  if (
    (claims.version !== 1 && claims.version !== 2) ||
    claims.runId !== runId ||
    claims.userId !== userId ||
    (claims.mode !== "solo" && claims.mode !== "multiplayer") ||
    !Number.isInteger(claims.startedAt) ||
    claims.startedAt > now + 30_000
  ) {
    throw new RunAuthorityError("Invalid run token");
  }

  if (claims.version === 2) {
    if (
      !Number.isInteger(claims.lastBeatAt) ||
      !Number.isInteger(claims.activeMs) ||
      claims.lastBeatAt < claims.startedAt ||
      claims.lastBeatAt > now + 30_000 ||
      claims.activeMs < 0 ||
      claims.activeMs > claims.lastBeatAt - claims.startedAt
    ) {
      throw new RunAuthorityError("Invalid run token");
    }
  } else if (!legacyRunTokensAllowed() && now - claims.startedAt > LEGACY_RUN_WINDOW_MS) {
    throw new RunAuthorityError("This run has expired. Please start a new mission.");
  }

  return claims;
}

/**
 * Records a check-in for a running game and returns the updated token. Each
 * check-in credits the time since the previous one, up to MAX_HEARTBEAT_GAP_MS,
 * so total credited play can never exceed real elapsed time.
 */
export function refreshRun(runId: string, runToken: string, userId: number, now = Date.now()) {
  const claims = verifyRun(runId, runToken, userId, now);
  if (claims.version !== 2) {
    throw new RunAuthorityError("This run does not support heartbeats");
  }

  const gap = Math.max(0, now - claims.lastBeatAt);
  return {
    runToken: encodeClaims({
      ...claims,
      lastBeatAt: Math.max(claims.lastBeatAt, now),
      activeMs: claims.activeMs + Math.min(gap, MAX_HEARTBEAT_GAP_MS),
    }),
  };
}

export function calculateAuthoritativeScore(startedAt: number, endedAt = Date.now()) {
  const elapsedSeconds = Math.max(0, Math.min(MAX_RUN_SECONDS, (endedAt - startedAt) / 1000));
  return Math.min(MAX_AUTHORITATIVE_SCORE, Math.floor(elapsedSeconds * SERVER_SCORE_RATE));
}

/** The score for a finished run, given its verified token and the submission time. */
export function calculateRunScore(claims: RunClaims, now = Date.now()) {
  if (claims.version === 1) {
    return calculateAuthoritativeScore(claims.startedAt, now);
  }

  const finalGap = Math.max(0, now - claims.lastBeatAt);
  const activeMs = claims.activeMs + Math.min(finalGap, MAX_HEARTBEAT_GAP_MS);
  return calculateAuthoritativeScore(claims.startedAt, claims.startedAt + activeMs);
}
