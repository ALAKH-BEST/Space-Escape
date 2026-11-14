/** The movement keys the game tracks. Letters are always stored lowercase. */
export type MovementKeys = {
  ArrowUp: boolean;
  ArrowDown: boolean;
  ArrowLeft: boolean;
  ArrowRight: boolean;
  w: boolean;
  s: boolean;
  a: boolean;
  d: boolean;
};

export function createMovementKeys(): MovementKeys {
  return { ArrowUp: false, ArrowDown: false, ArrowLeft: false, ArrowRight: false, w: false, s: false, a: false, d: false };
}

/**
 * `KeyboardEvent.key` is "W" with Caps Lock or Shift and "w" without, and a key held across a Shift
 * change is released under a different name than it was pressed. Folding letters to lowercase makes
 * both cases the same key.
 */
export function normalizeKey(key: string): string {
  return key.length === 1 ? key.toLowerCase() : key;
}

export function isMovementKey(keys: MovementKeys, key: string): key is keyof MovementKeys {
  return Object.prototype.hasOwnProperty.call(keys, key);
}

/** Lets go of every key, for when the window loses focus and the matching key-up events never arrive. */
export function releaseAllKeys(keys: MovementKeys) {
  (Object.keys(keys) as Array<keyof MovementKeys>).forEach((key) => {
    keys[key] = false;
  });
}
