// Progression kept in the browser, used only by portal builds where there is no server.
// Mirrors the server rules in server/storage.ts: gems = score / 10, ships cost gems.

import { isShipId, ships, type ShipId } from "@shared/ships";

export type LocalProgression = {
  gems: number;
  ownedShips: ShipId[];
  equippedShip: ShipId;
};

export type StorageLike = Pick<Storage, "getItem" | "setItem">;

const STORAGE_KEY = "astrododge-portal-progress";
const STARTER_SHIP: ShipId = "vanguard";

const memory = new Map<string, string>();
const memoryStorage: StorageLike = {
  getItem: (key) => memory.get(key) ?? null,
  setItem: (key, value) => void memory.set(key, value),
};

function defaultStorage(): StorageLike {
  try {
    // Touching localStorage can throw (private mode, blocked third-party storage in an iframe).
    const probe = "__astrododge_probe__";
    window.localStorage.setItem(probe, "1");
    window.localStorage.removeItem(probe);
    return window.localStorage;
  } catch {
    return memoryStorage;
  }
}

function fresh(): LocalProgression {
  return { gems: 0, ownedShips: [STARTER_SHIP], equippedShip: STARTER_SHIP };
}

function normalise(value: unknown): LocalProgression {
  if (!value || typeof value !== "object") return fresh();
  const raw = value as Partial<LocalProgression>;
  const owned = Array.isArray(raw.ownedShips) ? raw.ownedShips.filter((id): id is ShipId => typeof id === "string" && isShipId(id)) : [];
  const ownedShips = Array.from(new Set<ShipId>([STARTER_SHIP, ...owned]));
  const gems = typeof raw.gems === "number" && Number.isFinite(raw.gems) ? Math.max(0, Math.floor(raw.gems)) : 0;
  const equippedShip = typeof raw.equippedShip === "string" && isShipId(raw.equippedShip) && ownedShips.includes(raw.equippedShip) ? raw.equippedShip : STARTER_SHIP;
  return { gems, ownedShips, equippedShip };
}

export function readProgression(storage: StorageLike = defaultStorage()): LocalProgression {
  try {
    const text = storage.getItem(STORAGE_KEY);
    return text ? normalise(JSON.parse(text)) : fresh();
  } catch {
    return fresh();
  }
}

function save(progression: LocalProgression, storage: StorageLike) {
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(progression));
  } catch {
    // Progress still applies for this session if saving fails.
    memoryStorage.setItem(STORAGE_KEY, JSON.stringify(progression));
  }
  return progression;
}

export function purchaseShip(shipId: ShipId, storage: StorageLike = defaultStorage()): LocalProgression {
  const current = readProgression(storage);
  if (current.ownedShips.includes(shipId)) throw new Error("Ship already owned");
  const price = ships[shipId].price;
  if (current.gems < price) throw new Error(`You need ${price.toLocaleString()} gems to unlock this ship`);
  return save({ ...current, gems: current.gems - price, ownedShips: [...current.ownedShips, shipId] }, storage);
}

export function equipShip(shipId: ShipId, storage: StorageLike = defaultStorage()): LocalProgression {
  const current = readProgression(storage);
  if (!current.ownedShips.includes(shipId)) throw new Error("Purchase this ship before equipping it");
  return save({ ...current, equippedShip: shipId }, storage);
}

/** Adds gems directly (the rewarded-ad bonus). */
export function addGems(amount: number, storage: StorageLike = defaultStorage()): LocalProgression {
  const current = readProgression(storage);
  const safeAmount = Number.isFinite(amount) ? Math.max(0, Math.floor(amount)) : 0;
  return save({ ...current, gems: current.gems + safeAmount }, storage);
}

/** Banks a finished run: one gem for every 10 points, like the server. */
export function recordRun(score: number, storage: StorageLike = defaultStorage()) {
  const current = readProgression(storage);
  const safeScore = Number.isFinite(score) ? Math.max(0, Math.floor(score)) : 0;
  const gemsEarned = Math.floor(safeScore / 10);
  const next = save({ ...current, gems: current.gems + gemsEarned }, storage);
  return { score: safeScore, gemsEarned, totalGems: next.gems };
}
