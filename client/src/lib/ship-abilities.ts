import type { AbilityKind, ShipDefinition } from "@shared/ships";

/** How the abilities change play. The ships and their timings are in `shared/ships.ts`. */

/** Time Warp: how fast asteroids move while it is active, as a share of normal. */
export const TIME_WARP_FACTOR = 0.4;
/** The most charges an Aegis barrier can hold, and how long it takes to rebuild one. */
export const BARRIER_MAX_CHARGES = 2;
export const BARRIER_REGEN_MS = 15_000;
/** Score and speed multipliers while an ability is active. */
const MOVEMENT_BOOST: Partial<Record<AbilityKind, number>> = { overdrive: 1.5, afterburner: 1.4 };

/** True for the abilities the pilot sets off with the ability button. */
export function hasButtonAbility(ship: Pick<ShipDefinition, "abilityKind">) {
  const kind = ship.abilityKind;
  return kind === "phase" || kind === "overdrive" || kind === "afterburner" || kind === "timewarp";
}

/** True for the abilities that are shields rather than buttons. */
export function hasShield(ship: Pick<ShipDefinition, "abilityKind">) {
  return ship.abilityKind === "fortress" || ship.abilityKind === "barrier";
}

/** Shield charges a run starts with. */
export function startingShields(ship: Pick<ShipDefinition, "abilityKind">) {
  if (ship.abilityKind === "fortress") return 3;
  if (ship.abilityKind === "barrier") return 1;
  return 0;
}

/** How much faster the ship moves while its ability is active (1 when it does not). */
export function movementBoost(ship: Pick<ShipDefinition, "abilityKind">, abilityActive: boolean) {
  return abilityActive ? (MOVEMENT_BOOST[ship.abilityKind] ?? 1) : 1;
}

/** How fast asteroids move: Time Warp slows them while it is active. */
export function obstacleSpeedFactor(ship: Pick<ShipDefinition, "abilityKind">, abilityActive: boolean) {
  return abilityActive && ship.abilityKind === "timewarp" ? TIME_WARP_FACTOR : 1;
}

/**
 * Time left to rebuild a barrier charge after `elapsedMs` more of play. Returns the new charge count
 * and the progress towards the next one. Charges only grow, up to the maximum.
 */
export function regenerateBarrier(charges: number, progressMs: number, elapsedMs: number) {
  if (charges >= BARRIER_MAX_CHARGES) return { charges: BARRIER_MAX_CHARGES, progressMs: 0 };
  let progress = progressMs + Math.max(0, elapsedMs);
  let next = charges;
  while (progress >= BARRIER_REGEN_MS && next < BARRIER_MAX_CHARGES) {
    progress -= BARRIER_REGEN_MS;
    next += 1;
  }
  return { charges: next, progressMs: next >= BARRIER_MAX_CHARGES ? 0 : progress };
}
