export const FIRST_FLIGHT_STORAGE_KEY = "astrododge:first-flight:v1";

export const achievementCatalog = {
  firstFlight: {
    title: "First Flight",
    description: "Your first mission is officially underway.",
  },
  asteroidWhisperer: {
    title: "Asteroid Whisperer",
    description: "Three close calls in a row. Precision under pressure.",
  },
  lastPilotStanding: {
    title: "Last Pilot Standing",
    description: "Every rival is out. The sector is yours.",
  },
  longHaul: {
    title: "Long Haul",
    description: "Thirty seconds in the field and still flying.",
  },
  centuryClub: {
    title: "Century Club",
    description: "One hundred seconds survived in a single flight.",
  },
  deepSpaceVoyager: {
    title: "Deep Space Voyager",
    description: "You made it through five sectors in one run.",
  },
} as const;

export type AchievementId = keyof typeof achievementCatalog;

export interface AchievementNotice {
  id: AchievementId;
  sequence: number;
}

export interface PilotStatus {
  id: string;
  alive: boolean;
}

export function isNearMiss(distance: number, collisionRadius: number, margin = 24): boolean {
  return Number.isFinite(distance)
    && Number.isFinite(collisionRadius)
    && distance > collisionRadius
    && distance <= collisionRadius + margin;
}

export function isLastPilotStanding(
  players: readonly PilotStatus[],
  localPlayerId: string,
): boolean {
  const localPlayer = players.find((player) => player.id === localPlayerId);
  const opponents = players.filter((player) => player.id !== localPlayerId);

  return localPlayer?.alive === true
    && opponents.length > 0
    && opponents.every((player) => !player.alive);
}
