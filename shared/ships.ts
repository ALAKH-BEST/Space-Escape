export const shipIds = ["vanguard", "comet", "phantom", "aegis", "titan", "nova", "eclipse"] as const;
export type ShipId = (typeof shipIds)[number];

/**
 * What a ship's ability does. "phase", "overdrive", "afterburner" and "timewarp" are used with the
 * ability button and run for `abilityDuration` before a cooldown; "fortress" and "barrier" are
 * shields that need no button; "none" has no ability.
 */
export type AbilityKind = "none" | "phase" | "fortress" | "overdrive" | "afterburner" | "barrier" | "timewarp";

export type ShipDefinition = {
  id: ShipId;
  name: string;
  price: number;
  role: string;
  speed: number;
  handling: number;
  shield: number;
  ability: string;
  abilityKind: AbilityKind;
  /** How long an active ability runs, in milliseconds (0 for the others). */
  abilityDuration: number;
  /** How long before an active ability can be used again, in milliseconds (0 for the others). */
  abilityCooldown: number;
  abilityDescription: string;
  color: string;
};

export const ships: Record<ShipId, ShipDefinition> = {
  vanguard: {
    id: "vanguard",
    name: "VANGUARD V1",
    price: 0,
    role: "Balanced starter ship",
    speed: 3,
    handling: 4,
    shield: 2,
    ability: "NONE",
    abilityKind: "none",
    abilityDuration: 0,
    abilityCooldown: 0,
    abilityDescription: "Reliable and ready for every mission.",
    color: "#818cf8",
  },
  comet: {
    id: "comet",
    name: "COMET C3",
    price: 500,
    role: "Quick first upgrade",
    speed: 4,
    handling: 4,
    shield: 2,
    ability: "AFTERBURNER",
    abilityKind: "afterburner",
    abilityDuration: 2000,
    abilityCooldown: 6000,
    abilityDescription: "A burst of extra speed for 2 seconds, ready again after 6.",
    color: "#a3e635",
  },
  phantom: {
    id: "phantom",
    name: "PHANTOM X",
    price: 1000,
    role: "Speed / agility",
    speed: 5,
    handling: 5,
    shield: 1,
    ability: "PHASE SHIFT",
    abilityKind: "phase",
    abilityDuration: 3000,
    abilityCooldown: 12000,
    abilityDescription: "Become invulnerable to collisions for 3 seconds.",
    color: "#22d3ee",
  },
  aegis: {
    id: "aegis",
    name: "AEGIS",
    price: 3500,
    role: "Self-repairing shield",
    speed: 3,
    handling: 3,
    shield: 4,
    ability: "BARRIER",
    abilityKind: "barrier",
    abilityDuration: 0,
    abilityCooldown: 0,
    abilityDescription: "Absorbs a collision, and rebuilds a charge every 15 seconds, up to 2.",
    color: "#f87171",
  },
  titan: {
    id: "titan",
    name: "TITAN MK II",
    price: 2500,
    role: "Tank / survival",
    speed: 2,
    handling: 2,
    shield: 5,
    ability: "FORTRESS",
    abilityKind: "fortress",
    abilityDuration: 0,
    abilityCooldown: 0,
    abilityDescription: "Absorb up to 3 asteroid collisions.",
    color: "#f59e0b",
  },
  nova: {
    id: "nova",
    name: "NOVA",
    price: 5000,
    role: "High-risk / high-reward",
    speed: 4,
    handling: 4,
    shield: 3,
    ability: "OVERDRIVE",
    abilityKind: "overdrive",
    abilityDuration: 5000,
    abilityCooldown: 15000,
    abilityDescription: "Boost movement speed and double your score for 5 seconds.",
    color: "#f472b6",
  },
  eclipse: {
    id: "eclipse",
    name: "ECLIPSE",
    price: 8000,
    role: "Control / precision",
    speed: 4,
    handling: 3,
    shield: 3,
    ability: "TIME WARP",
    abilityKind: "timewarp",
    abilityDuration: 4000,
    abilityCooldown: 18000,
    abilityDescription: "Slow every asteroid to 40% speed for 4 seconds.",
    color: "#c084fc",
  },
};

export function isShipId(value: string): value is ShipId {
  return shipIds.includes(value as ShipId);
}

/** Every ship, cheapest first: the order the Hangar lists them in. */
export const shipsByPrice: ShipDefinition[] = shipIds.map((id) => ships[id]).sort((a, b) => a.price - b.price);
