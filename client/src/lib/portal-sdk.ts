// Thin wrapper over the CrazyGames and Poki SDKs. Every function is safe to call
// anywhere: outside a portal build it does nothing, and an SDK failure never
// interrupts play.

import { portalTarget } from "./portal";

type CrazyGamesSdk = {
  init: () => Promise<void>;
  environment?: string;
  game: {
    gameplayStart: () => void;
    gameplayStop: () => void;
    loadingStart?: () => void;
    loadingStop?: () => void;
  };
  ad: {
    requestAd: (
      type: "midgame" | "rewarded",
      callbacks: { adStarted?: () => void; adFinished?: () => void; adError?: (error: unknown) => void },
    ) => void;
  };
};

type PokiSdk = {
  init: () => Promise<void>;
  gameLoadingFinished: () => void;
  gameplayStart: () => void;
  gameplayStop: () => void;
  commercialBreak: (onStart?: () => void) => Promise<void>;
};

declare global {
  interface Window {
    CrazyGames?: { SDK?: CrazyGamesSdk };
    PokiSDK?: PokiSdk;
  }
}

let ready: Promise<boolean> | null = null;
let gameplayActive = false;

/** Starts the SDK once. Resolves true when it can be used, false when it cannot (local file, blocked script, ad blocker). */
export function initPortalSdk(): Promise<boolean> {
  if (!portalTarget) return Promise.resolve(false);
  if (ready) return ready;
  ready = (async () => {
    try {
      if (portalTarget === "crazygames") {
        const sdk = window.CrazyGames?.SDK;
        if (!sdk) return false;
        await sdk.init();
        // Calls throw on any domain that is not CrazyGames or localhost.
        return sdk.environment !== "disabled";
      }
      const sdk = window.PokiSDK;
      if (!sdk) return false;
      // Poki resolves init in both outcomes; an ad blocker only means no ads.
      await sdk.init().catch(() => undefined);
      sdk.gameLoadingFinished();
      return true;
    } catch {
      return false;
    }
  })();
  return ready;
}

async function withSdk(action: () => void) {
  if (!(await initPortalSdk())) return;
  try {
    action();
  } catch {
    // SDK problems must never affect gameplay.
  }
}

/** The player is actively playing (a run started). */
export function gameplayStart() {
  if (gameplayActive) return;
  gameplayActive = true;
  void withSdk(() => {
    if (portalTarget === "crazygames") window.CrazyGames?.SDK?.game.gameplayStart();
    else window.PokiSDK?.gameplayStart();
  });
}

/** The player stopped playing (game over, menu, left the page). */
export function gameplayStop() {
  if (!gameplayActive) return;
  gameplayActive = false;
  void withSdk(() => {
    if (portalTarget === "crazygames") window.CrazyGames?.SDK?.game.gameplayStop();
    else window.PokiSDK?.gameplayStop();
  });
}

/**
 * Shows an ad break at a natural pause (after a run ends). `onStart` should pause and
 * mute the game, `onEnd` should restore it; `onEnd` runs exactly once, also when no
 * ad is available or the SDK is missing.
 */
export function showBreakAd(onStart: () => void, onEnd: () => void) {
  let ended = false;
  const finish = () => {
    if (ended) return;
    ended = true;
    onEnd();
  };
  void (async () => {
    if (!(await initPortalSdk())) return finish();
    try {
      if (portalTarget === "crazygames") {
        window.CrazyGames!.SDK!.ad.requestAd("midgame", { adStarted: onStart, adFinished: finish, adError: finish });
      } else {
        await window.PokiSDK!.commercialBreak(onStart);
        finish();
      }
    } catch {
      finish();
    }
  })();
}
