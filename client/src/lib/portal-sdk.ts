// Thin wrapper over the CrazyGames and Poki SDKs. Every function is safe to call
// anywhere: outside a portal build it does nothing, and an SDK failure never
// interrupts play.

import { portalTarget } from "./portal";
import { setExternalMuted } from "./background-music";

type CrazyGamesSdk = {
  init: () => Promise<void>;
  environment?: string;
  game: {
    gameplayStart: () => void;
    gameplayStop: () => void;
    loadingStart?: () => void;
    loadingStop?: () => void;
    happytime?: () => void;
    settings?: { muteAudio?: boolean };
    addSettingsChangeListener?: (listener: (settings: { muteAudio?: boolean }) => void) => void;
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
  rewardedBreak: (onStart?: () => void) => Promise<boolean>;
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
        if (sdk.environment === "disabled") return false;
        try {
          sdk.game.loadingStart?.();
          // Follow the portal's own mute setting (its mute button, or muting while an ad plays).
          setExternalMuted(Boolean(sdk.game.settings?.muteAudio));
          sdk.game.addSettingsChangeListener?.((settings) => setExternalMuted(Boolean(settings.muteAudio)));
        } catch {
          // Optional SDK features must never block the game.
        }
        return true;
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

/** The game finished loading and is ready to play (CrazyGames; Poki is told in init). */
export function loadingStop() {
  void withSdk(() => {
    if (portalTarget === "crazygames") window.CrazyGames?.SDK?.game.loadingStop?.();
  });
}

/** A celebratory moment (a reward earned). CrazyGames shows a small effect; Poki has no equivalent. */
export function happytime() {
  void withSdk(() => {
    if (portalTarget === "crazygames") window.CrazyGames?.SDK?.game.happytime?.();
  });
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

/**
 * Offers a rewarded ad the player chose to watch. Resolves true only if the ad was
 * watched to the end (so the reward is earned); false on no ad, skip, error or no SDK.
 * `onStart` pauses and mutes the game, `onEnd` restores it (once, in every case).
 */
export function showRewardedAd(onStart: () => void, onEnd: () => void): Promise<boolean> {
  return new Promise((resolve) => {
    let ended = false;
    const finish = (earned: boolean) => {
      if (!ended) {
        ended = true;
        onEnd();
      }
      resolve(earned);
    };
    void (async () => {
      if (!(await initPortalSdk())) return finish(false);
      try {
        if (portalTarget === "crazygames") {
          window.CrazyGames!.SDK!.ad.requestAd("rewarded", {
            adStarted: onStart,
            adFinished: () => finish(true),
            adError: () => finish(false),
          });
        } else {
          finish(Boolean(await window.PokiSDK!.rewardedBreak(onStart)));
        }
      } catch {
        finish(false);
      }
    })();
  });
}
