import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import { AnimatePresence, motion } from "framer-motion";
import { useQueryClient } from "@tanstack/react-query";
import { Gem, Play, RotateCcw, Shield, Sparkles, Trophy, Video, Zap } from "lucide-react";
import { api } from "@shared/routes";
import { sendRunHeartbeat, useStartRun, useSubmitScore } from "@/hooks/use-scores";
import { useProgression } from "@/hooks/use-progression";
import { AchievementToast } from "@/components/game/AchievementToast";
import { MobileControls } from "@/components/game/MobileControls";
import { MusicToggle } from "@/components/game/MusicToggle";
import { unlockAchievementAudio } from "@/lib/achievement-audio";
import { playAbilitySound } from "@/lib/ability-sounds";
import { setMusicMode, startMusic, stopMusic } from "@/lib/background-music";
import { isPortal } from "@/lib/portal";
import { gameplayStart, gameplayStop, happytime, showBreakAd, showRewardedAd } from "@/lib/portal-sdk";
import { addGems } from "@/lib/local-game-store";
import { createMovementKeys, isMovementKey, normalizeKey, releaseAllKeys } from "@/lib/input-keys";
import { recordPersonalBest, type PersonalBestResult } from "@/lib/personal-best";
import { playCollisionSound } from "@/lib/collision-sound";
import {
  DEATH_EFFECT_MS,
  drawParticles,
  effectsActive,
  emitBurst,
  emitTrail,
  stepParticles,
  type Particle,
} from "@/lib/game-effects";
import {
  FIRST_FLIGHT_STORAGE_KEY,
  isLastPilotStanding,
  isNearMiss,
  type AchievementId,
  type AchievementNotice,
} from "@/lib/game-achievements";
import {
  drawSectorEnvironment,
  getSectorEnvironmentByNumber,
  getSectorNumberById,
  type SectorEnvironment,
} from "@/lib/sector-environments";
import { ships, type ShipId } from "@shared/ships";
import { scoreForPlayTime } from "@shared/scoring";
import { Button } from "@/components/ui/button";
import type { MultiplayerRoom } from "@/hooks/use-multiplayer";

interface GameState {
  isPlaying: boolean;
  score: number;
  gameOver: boolean;
  survivalTime: number;
  sector: number;
}

interface AbilityUi {
  label: string;
  status: string;
  active: boolean;
}

type Obstacle = {
  x: number;
  y: number;
  type: "asteroid" | "stone";
  size: number;
  speed: number;
};

type DeathBurst = {
  x: number;
  y: number;
  color: string;
  startedAt: number;
};

const PLAYER_SIZE = 30;
const OBSTACLE_SPEED = 3.5;
const SPAWN_RATE = 1500;
const SECTOR_TRANSITION_MS = 1600;
/** The sector (background, label) advances every this many points. */
const SCORE_PER_SECTOR = 500;
const RUN_HEARTBEAT_MS = 2000;
/** Solo runs begin after a 3-2-1 countdown, one step every this many milliseconds. */
const COUNTDOWN_STEP_MS = 650;
const COUNTDOWN_FROM = 3;

export function GameCanvas({
  multiplayer,
  autoStart = false,
  initialSectorId = "violet-expanse",
}: {
  multiplayer?: {
    room: MultiplayerRoom;
    onPosition: (x: number, y: number) => void;
  };
  autoStart?: boolean;
  initialSectorId?: SectorEnvironment["id"];
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const requestRef = useRef<number>();
  const particlesRef = useRef<Particle[]>([]);
  const deathEffectRef = useRef<number | null>(null);
  const shipRef = useRef<ShipId>("vanguard");
  const scoreMutation = useSubmitScore();
  // This run against the saved best, set once the run's final score is known. Solo runs only.
  const [personalBest, setPersonalBest] = useState<PersonalBestResult | null>(null);
  const queryClient = useQueryClient();
  // Portal builds only: "watch an ad to double this run's gems".
  const [countdown, setCountdown] = useState<number | null>(null);
  const countdownTimerRef = useRef<number | null>(null);
  const [bonus, setBonus] = useState<{ status: "idle" | "watching" | "claimed" | "unavailable"; gems: number }>({ status: "idle", gems: 0 });
  const startRunMutation = useStartRun();
  const { data: progression, isLoading: isProgressionLoading } = useProgression();
  const startingSectorNumber = getSectorNumberById(initialSectorId);
  const backgroundSectorRef = useRef(startingSectorNumber);
  const sectorTransitionRef = useRef<{
    from: number;
    to: number;
    startedAt: number;
  } | null>(null);
  const startingRunRef = useRef(false);
  const autoStartAttemptedRef = useRef(false);
  const [gameState, setGameState] = useState<GameState>({
    isPlaying: false,
    score: 0,
    gameOver: false,
    survivalTime: 0,
    sector: 1,
  });
  const [abilityUi, setAbilityUi] = useState<AbilityUi>({
    label: "SYSTEMS",
    status: "SELECT A SHIP",
    active: false,
  });
  const [achievementQueue, setAchievementQueue] = useState<AchievementNotice[]>([]);
  const notificationSequenceRef = useRef(0);
  const earnedAchievementsRef = useRef(new Set<AchievementId>());
  const nearMissStreakRef = useRef(0);
  const abilityWasActiveRef = useRef(false);
  const sawLiveOpponentRef = useRef(false);
  const firstFlightSeenRef = useRef(readFirstFlightFlag());
  const awardAchievement = useCallback((id: AchievementId) => {
    if (earnedAchievementsRef.current.has(id)) return;
    earnedAchievementsRef.current.add(id);
    if (id !== "firstFlight") happytime();
    const sequence = ++notificationSequenceRef.current;
    setAchievementQueue((queue) => [...queue, { id, sequence }]);
  }, []);
  const dismissAchievement = useCallback(() => {
    setAchievementQueue((queue) => queue.slice(1));
  }, []);

  const gameStateRef = useRef({
    player: { x: 50, y: 200 },
    obstacles: [] as Obstacle[],
    stars: [] as { x: number; y: number; size: number; speed: number }[],
    keys: createMovementKeys(),
    lastSpawn: 0,
    // Internal pacing measure: drives obstacle speed and spawn rate only.
    score: 0,
    // Milliseconds actually played. The score on screen and on the results screen comes from this.
    playMs: 0,
    lastFrameAt: 0,
    isPlaying: false,
    startedAt: 0,
    runId: "",
    runToken: "",
    shieldCharges: 0,
    abilityActiveUntil: 0,
    abilityCooldownUntil: 0,
    rngSeed: 1,
    lastPositionBroadcast: 0,
  });
  const multiplayerRef = useRef(multiplayer);
  const remoteAliveRef = useRef(new Map<string, boolean>());
  const deathBurstsRef = useRef(new Map<string, DeathBurst>());
  useEffect(() => {
    multiplayerRef.current = multiplayer;
  }, [multiplayer]);

  useEffect(() => {
    const unlock = () => unlockAchievementAudio();
    window.addEventListener("pointerdown", unlock, true);
    window.addEventListener("keydown", unlock, true);
    return () => {
      window.removeEventListener("pointerdown", unlock, true);
      window.removeEventListener("keydown", unlock, true);
    };
  }, []);

  // Mission music while a mission is in progress; the calm track otherwise
  // (home screen, game over, or when leaving the game).
  useEffect(() => {
    setMusicMode(gameState.isPlaying ? "mission" : "calm");
  }, [gameState.isPlaying]);
  useEffect(() => () => setMusicMode("calm"), []);
  // Tell the portal the player is no longer playing if they leave mid-run.
  useEffect(() => () => gameplayStop(), []);

  const selectedShip = ships[shipRef.current];

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const resizeCanvas = () => {
      canvas.width = canvas.clientWidth;
      canvas.height = canvas.clientHeight;
    };
    resizeCanvas();
    window.addEventListener("resize", resizeCanvas);

    for (let i = 0; i < 100; i++) {
      gameStateRef.current.stars.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        size: Math.random() * 2,
        speed: Math.random() * 0.5 + 0.1,
      });
    }

    return () => window.removeEventListener("resize", resizeCanvas);
  }, []);

  useEffect(() => {
    if (multiplayer?.room.phase === "running" && multiplayer.room.startedAt && !gameStateRef.current.isPlaying) {
      startGame();
    }
  }, [multiplayer?.room.phase, multiplayer?.room.startedAt]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const state = gameStateRef.current;
      if (e.code === "Space" && state.isPlaying) {
        e.preventDefault();
        activateAbility();
        return;
      }
      const key = normalizeKey(e.key);
      if (isMovementKey(state.keys, key)) {
        state.keys[key] = true;
        if (key.startsWith("Arrow")) e.preventDefault();
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      const key = normalizeKey(e.key);
      if (isMovementKey(gameStateRef.current.keys, key)) {
        gameStateRef.current.keys[key] = false;
      }
    };
    // Switching windows while holding a key means the key-up never arrives; let go so the ship stops.
    const releaseKeys = () => releaseAllKeys(gameStateRef.current.keys);
    const releaseWhenHidden = () => {
      if (document.hidden) releaseKeys();
    };
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    window.addEventListener("blur", releaseKeys);
    document.addEventListener("visibilitychange", releaseWhenHidden);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      window.removeEventListener("blur", releaseKeys);
      document.removeEventListener("visibilitychange", releaseWhenHidden);
    };
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      const state = gameStateRef.current;
      if (!state.isPlaying) return;
      const ship = ships[shipRef.current];
      const now = performance.now();
      const elapsedSeconds = Math.max(0, (now - state.startedAt) / 1000);
      if (elapsedSeconds >= 30) awardAchievement("longHaul");
      if (elapsedSeconds >= 100) awardAchievement("centuryClub");
      if (scoreForPlayTime(state.playMs) >= 400) awardAchievement("deepSpaceVoyager");

      const activeMultiplayer = multiplayerRef.current;
      if (activeMultiplayer?.room.phase === "running") {
        const players = activeMultiplayer.room.players;
        if (players.some((player) => player.id !== activeMultiplayer.room.localPlayerId && player.alive)) {
          sawLiveOpponentRef.current = true;
        }
        if (
          sawLiveOpponentRef.current
          && isLastPilotStanding(players, activeMultiplayer.room.localPlayerId)
        ) {
          awardAchievement("lastPilotStanding");
        }
      }

      if (ship.id === "titan") {
        setAbilityUi({ label: "FORTRESS", status: `${state.shieldCharges} SHIELDS`, active: state.shieldCharges > 0 });
      } else if (ship.id === "vanguard") {
        setAbilityUi({ label: "ABILITY", status: "NONE", active: false });
      } else if (now < state.abilityActiveUntil) {
        setAbilityUi({
          label: ship.ability,
          status: `ACTIVE — ${((state.abilityActiveUntil - now) / 1000).toFixed(1)}s`,
          active: true,
        });
      } else if (now < state.abilityCooldownUntil) {
        setAbilityUi({
          label: ship.ability,
          status: `COOLDOWN — ${Math.ceil((state.abilityCooldownUntil - now) / 1000)}s`,
          active: false,
        });
      } else {
        setAbilityUi({ label: ship.ability, status: "READY — SPACE", active: false });
      }
    }, 100);
    return () => window.clearInterval(timer);
  }, [awardAchievement]);

  // While a run is being played, check in with the server every couple of
  // seconds so it can tell the run was genuinely active. This only touches the
  // run token; it never reads or changes anything the game loop uses.
  useEffect(() => {
    let inFlight = false;
    const timer = window.setInterval(() => {
      const { isPlaying, runId, runToken } = gameStateRef.current;
      if (!isPlaying || !runId || !runToken || inFlight || document.hidden) return;
      inFlight = true;
      void sendRunHeartbeat(runId, runToken)
        .then((nextToken) => {
          if (nextToken && gameStateRef.current.runId === runId) {
            gameStateRef.current.runToken = nextToken;
          }
        })
        .finally(() => {
          inFlight = false;
        });
    }, RUN_HEARTBEAT_MS);
    return () => window.clearInterval(timer);
  }, []);

  const activateAbility = () => {
    const state = gameStateRef.current;
    const ship = ships[shipRef.current];
    const now = performance.now();
    if (!state.isPlaying || ship.id === "vanguard" || ship.id === "titan" || now < state.abilityCooldownUntil) return;

    const duration = ship.id === "phantom" ? 3000 : 5000;
    const cooldown = ship.id === "phantom" ? 12000 : 15000;
    state.abilityActiveUntil = now + duration;
    state.abilityCooldownUntil = now + cooldown;
    setAbilityUi({ label: ship.ability, status: `ACTIVE — ${(duration / 1000).toFixed(1)}s`, active: true });
    playAbilitySound(ship.id === "phantom" ? "phase" : "overdrive");
  };

  useEffect(() => () => {
    if (countdownTimerRef.current !== null) window.clearInterval(countdownTimerRef.current);
  }, []);

  // Solo runs start after a short 3-2-1 so the pilot is ready; multiplayer starts together, so it skips this.
  const startWithCountdown = () => {
    if (countdownTimerRef.current !== null || startingRunRef.current || gameStateRef.current.isPlaying) return;
    unlockAchievementAudio();
    let step = COUNTDOWN_FROM;
    setCountdown(step);
    countdownTimerRef.current = window.setInterval(() => {
      step -= 1;
      if (step > 0) {
        setCountdown(step);
        return;
      }
      window.clearInterval(countdownTimerRef.current ?? undefined);
      countdownTimerRef.current = null;
      setCountdown(null);
      void startGame().catch(() => {
        // useStartRun reports authorization failures to the pilot.
      });
    }, COUNTDOWN_STEP_MS);
  };

  const cancelDeathEffect = () => {
    if (deathEffectRef.current !== null) cancelAnimationFrame(deathEffectRef.current);
    deathEffectRef.current = null;
    particlesRef.current.length = 0;
  };

  useEffect(() => () => {
    if (deathEffectRef.current !== null) cancelAnimationFrame(deathEffectRef.current);
  }, []);

  // A short crash animation: the field slows down, sparks fly, the screen flashes and shakes.
  const runDeathEffect = (hitX: number, hitY: number, color: string) => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const state = gameStateRef.current;
    const particles = particlesRef.current;
    emitBurst(particles, hitX, hitY, color, 36);
    emitBurst(particles, hitX, hitY, "#ffffff", 14);
    const sector = backgroundSectorRef.current;
    const startedAt = performance.now();
    const frame = (timestamp: number) => {
      const progress = Math.min(1, (timestamp - startedAt) / DEATH_EFFECT_MS);
      ctx.fillStyle = "#02040a";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.save();
      const shake = (1 - progress) * 9;
      ctx.translate((Math.random() - 0.5) * 2 * shake, (Math.random() - 0.5) * 2 * shake);
      drawSectorEnvironment(ctx, canvas.width, canvas.height, sector, timestamp);
      ctx.fillStyle = "rgba(255, 255, 255, 0.6)";
      state.stars.forEach((star) => {
        star.x -= star.speed * 0.2;
        if (star.x < 0) star.x = canvas.width;
        ctx.beginPath();
        ctx.arc(star.x, star.y, star.size, 0, Math.PI * 2);
        ctx.fill();
      });
      state.obstacles.forEach((obstacle) => {
        obstacle.x -= obstacle.speed * 0.2;
        drawObstacle(ctx, obstacle);
      });
      stepParticles(particles, 0.6);
      drawParticles(ctx, particles);
      ctx.restore();
      const flash = (1 - progress) * (1 - progress) * 0.55;
      ctx.fillStyle = `rgba(255, 255, 255, ${flash})`;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      if (progress < 1) {
        deathEffectRef.current = requestAnimationFrame(frame);
      } else {
        deathEffectRef.current = null;
        particles.length = 0;
      }
    };
    deathEffectRef.current = requestAnimationFrame(frame);
  };

  const startGame = async () => {
    const canvas = canvasRef.current;
    if (!canvas || startingRunRef.current || gameStateRef.current.isPlaying) return;
    unlockAchievementAudio();
    startingRunRef.current = true;
    cancelDeathEffect();
    scoreMutation.reset();
    setBonus({ status: "idle", gems: 0 });
    try {
      const run = await startRunMutation.mutateAsync(multiplayerRef.current ? "multiplayer" : "solo");
      const equippedShip = progression?.equippedShip ?? "vanguard";
      shipRef.current = equippedShip;
      const now = performance.now();
      earnedAchievementsRef.current = new Set();
      nearMissStreakRef.current = 0;
      abilityWasActiveRef.current = false;
      sawLiveOpponentRef.current = false;
      backgroundSectorRef.current = startingSectorNumber;
      sectorTransitionRef.current = null;
      gameStateRef.current = {
        ...gameStateRef.current,
        player: { x: 50, y: canvas.height / 2 },
        obstacles: [],
        score: 0,
        playMs: 0,
        lastFrameAt: 0,
        isPlaying: true,
        lastSpawn: now,
        startedAt: now,
        runId: run.runId,
        runToken: run.runToken,
        shieldCharges: equippedShip === "titan" ? 3 : 0,
        abilityActiveUntil: 0,
        abilityCooldownUntil: 0,
        rngSeed: multiplayerRef.current?.room.seed ?? Math.floor(Math.random() * 2_147_483_647),
        lastPositionBroadcast: 0,
      };
      gameplayStart();
      if (!firstFlightSeenRef.current) {
        firstFlightSeenRef.current = true;
        try {
          window.localStorage.setItem(FIRST_FLIGHT_STORAGE_KEY, "1");
        } catch {
          // Keep this session's first-flight state even if browser storage is disabled.
        }
        awardAchievement("firstFlight");
      }
      remoteAliveRef.current.clear();
      deathBurstsRef.current.clear();
      setAbilityUi({
        label: ships[equippedShip].ability,
        status: equippedShip === "titan" ? "3 SHIELDS" : equippedShip === "vanguard" ? "NONE" : "READY — SPACE",
        active: equippedShip === "titan",
      });
      if (equippedShip === "titan") playAbilitySound("fortress");
      setPersonalBest(null);
      setGameState({ isPlaying: true, score: 0, gameOver: false, survivalTime: 0, sector: startingSectorNumber });
      requestRef.current = requestAnimationFrame(gameLoop);
    } finally {
      startingRunRef.current = false;
    }
  };

  useEffect(() => {
    if (
      !autoStart
      || isProgressionLoading
      || autoStartAttemptedRef.current
      || multiplayerRef.current
    ) return;

    autoStartAttemptedRef.current = true;
    startWithCountdown();
  }, [autoStart, isProgressionLoading, progression?.equippedShip]);

  const claimBonus = async (gemsEarned: number) => {
    if (bonus.status !== "idle" || gemsEarned <= 0) return;
    setBonus({ status: "watching", gems: 0 });
    let paused = false;
    const earned = await showRewardedAd(
      () => {
        paused = true;
        stopMusic(0.2);
      },
      () => {
        if (paused) startMusic();
      },
    );
    if (!earned) {
      setBonus({ status: "unavailable", gems: 0 });
      return;
    }
    const next = addGems(gemsEarned);
    queryClient.setQueryData([api.progression.get.path], next);
    setBonus({ status: "claimed", gems: gemsEarned });
  };

  const stopGame = () => {
    const state = gameStateRef.current;
    if (!state.isPlaying) return;
    if (requestRef.current) cancelAnimationFrame(requestRef.current);
    state.isPlaying = false;
    const finalScore = scoreForPlayTime(state.playMs);
    const survivalTime = Math.max(0, (performance.now() - state.startedAt) / 1000);
    const activeMultiplayer = multiplayerRef.current;
    const canvas = canvasRef.current;
    if (activeMultiplayer?.room.phase === "running" && canvas) {
      activeMultiplayer.onPosition(state.player.x / canvas.width, state.player.y / canvas.height);
    }
    setGameState({
      isPlaying: false,
      score: finalScore,
      gameOver: true,
      survivalTime,
      sector: startingSectorNumber + Math.floor(finalScore / SCORE_PER_SECTOR),
    });
    gameplayStop();
    if (isPortal) {
      // Portals pay for ads shown at natural pauses: the moment a run ends is one.
      let paused = false;
      // Let the crash animation finish before the ad takes over the screen.
      window.setTimeout(() => {
        showBreakAd(
          () => {
            paused = true;
            stopMusic(0.2);
          },
          () => {
            if (paused) startMusic();
          },
        );
      }, effectsActive() ? DEATH_EFFECT_MS : 0);
    }
    if (state.runId && state.runToken) {
      scoreMutation.mutate(
        { runId: state.runId, runToken: state.runToken, score: finalScore, playMs: state.playMs },
        {
          onSuccess: (result) => {
            setGameState((previous) => ({
              ...previous,
              score: result.score.score,
              sector: startingSectorNumber + Math.floor(result.score.score / SCORE_PER_SECTOR),
            }));
            // The score the server accepted is the one that counts as a best.
            if (!activeMultiplayer) setPersonalBest(recordPersonalBest(result.score.score));
          },
        },
      );
    } else if (!activeMultiplayer) {
      setPersonalBest(recordPersonalBest(finalScore));
    }
  };

  const gameLoop = (timestamp: number) => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    const state = gameStateRef.current;
    const ship = ships[shipRef.current];
    if (!canvas || !ctx || !state.isPlaying) return;

    // Frames can be far apart (a throttled tab); never credit more than a quarter second for one.
    if (state.lastFrameAt) state.playMs += Math.min(250, Math.max(0, timestamp - state.lastFrameAt));
    state.lastFrameAt = timestamp;
    const liveScore = scoreForPlayTime(state.playMs);
    const activeSector = startingSectorNumber + Math.floor(liveScore / SCORE_PER_SECTOR);
    if (activeSector !== backgroundSectorRef.current) {
      sectorTransitionRef.current = {
        from: backgroundSectorRef.current,
        to: activeSector,
        startedAt: timestamp,
      };
      backgroundSectorRef.current = activeSector;
    }

    const sectorTransition = sectorTransitionRef.current;
    if (sectorTransition) {
      const progress = Math.min(1, (timestamp - sectorTransition.startedAt) / SECTOR_TRANSITION_MS);
      const easedProgress = progress * progress * (3 - 2 * progress);
      drawSectorEnvironment(ctx, canvas.width, canvas.height, sectorTransition.from, timestamp);
      ctx.save();
      ctx.globalAlpha = easedProgress;
      drawSectorEnvironment(ctx, canvas.width, canvas.height, sectorTransition.to, timestamp);
      ctx.restore();
      if (progress >= 1) sectorTransitionRef.current = null;
    } else {
      drawSectorEnvironment(ctx, canvas.width, canvas.height, activeSector, timestamp);
    }

    const now = performance.now();
    const abilityActive = now < state.abilityActiveUntil;
    if (abilityWasActiveRef.current && !abilityActive && (ship.id === "phantom" || ship.id === "nova")) {
      playAbilitySound(ship.id === "phantom" ? "phaseEnd" : "overdriveEnd");
    }
    abilityWasActiveRef.current = abilityActive;
    const movementSpeed = (4.5 + ship.speed * 0.4) * (0.8 + ship.handling * 0.05) * (ship.id === "nova" && abilityActive ? 1.5 : 1);
    if (state.keys.ArrowUp || state.keys.w) state.player.y -= movementSpeed;
    if (state.keys.ArrowDown || state.keys.s) state.player.y += movementSpeed;
    if (state.keys.ArrowLeft || state.keys.a) state.player.x -= movementSpeed;
    if (state.keys.ArrowRight || state.keys.d) state.player.x += movementSpeed;
    state.player.y = Math.max(PLAYER_SIZE, Math.min(canvas.height - PLAYER_SIZE, state.player.y));
    state.player.x = Math.max(PLAYER_SIZE, Math.min(canvas.width - PLAYER_SIZE, state.player.x));

    state.stars.forEach((star) => {
      star.x -= star.speed;
      if (star.x < 0) star.x = canvas.width;
      ctx.fillStyle = `rgba(255, 255, 255, ${Math.random() * 0.5 + 0.3})`;
      ctx.beginPath();
      ctx.arc(star.x, star.y, star.size, 0, Math.PI * 2);
      ctx.fill();
    });

    if (timestamp - state.lastSpawn > SPAWN_RATE - Math.min(700, state.score * 0.5)) {
      const types: Obstacle["type"][] = ["asteroid", "stone"];
      const type = types[Math.floor(nextRandom(state) * types.length)];
      const size = type === "asteroid" ? 25 : 10;
      const speed = type === "asteroid" ? OBSTACLE_SPEED * 1.2 : OBSTACLE_SPEED * 1.5;
      state.obstacles.push({
        x: canvas.width + 50,
        y: nextRandom(state) * (canvas.height - 100) + 50,
        type,
        size,
        speed: speed + state.score / 500,
      });
      state.lastSpawn = timestamp;
    }

    for (let index = state.obstacles.length - 1; index >= 0; index--) {
      const obstacle = state.obstacles[index];
      const wasAheadOfPlayer = obstacle.x > state.player.x;
      obstacle.x -= obstacle.speed;
      drawObstacle(ctx, obstacle);

      const dx = state.player.x - obstacle.x;
      const dy = state.player.y - obstacle.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      const collisionRadius = PLAYER_SIZE / 1.5 + obstacle.size - ship.shield * 0.5;
      if (wasAheadOfPlayer && obstacle.x <= state.player.x) {
        if (isNearMiss(distance, collisionRadius)) {
          nearMissStreakRef.current += 1;
          if (nearMissStreakRef.current >= 3) awardAchievement("asteroidWhisperer");
        } else {
          nearMissStreakRef.current = 0;
        }
      }
      if (distance < collisionRadius) {
        if (ship.id === "phantom" && abilityActive) {
          continue;
        }
        if (ship.id === "titan" && state.shieldCharges > 0) {
          state.shieldCharges -= 1;
          state.obstacles.splice(index, 1);
          setAbilityUi({ label: "FORTRESS", status: `${state.shieldCharges} SHIELDS`, active: state.shieldCharges > 0 });
          playCollisionSound("shield");
          if (effectsActive()) emitBurst(particlesRef.current, obstacle.x, obstacle.y, "#fbbf24", 16);
          continue;
        }
        playCollisionSound("explosion");
        if (effectsActive()) runDeathEffect(state.player.x, state.player.y, ship.color);
        stopGame();
        return;
      }

      if (obstacle.x < -100) {
        state.obstacles.splice(index, 1);
        state.score += 10 * (ship.id === "nova" && abilityActive ? 2 : 1);
      }
    }

    state.score += 0.1 * (ship.id === "nova" && abilityActive ? 2 : 1);

    const activeMultiplayer = multiplayerRef.current;
    if (activeMultiplayer?.room.phase === "running") {
      const visibleRemotePlayerIds = new Set<string>();
      activeMultiplayer.room.players.forEach((player) => {
        if (player.id === activeMultiplayer.room.localPlayerId) return;
        visibleRemotePlayerIds.add(player.id);
        const wasAlive = remoteAliveRef.current.get(player.id);
        if (wasAlive === true && !player.alive) {
          deathBurstsRef.current.set(player.id, {
            x: player.x * canvas.width,
            y: player.y * canvas.height,
            color: player.color,
            startedAt: performance.now(),
          });
        }
        remoteAliveRef.current.set(player.id, player.alive);

        const burst = deathBurstsRef.current.get(player.id);
        if (burst) {
          const progress = (performance.now() - burst.startedAt) / 900;
          if (progress < 1) {
            drawDeathBurst(ctx, burst.x, burst.y, burst.color, progress);
          } else {
            deathBurstsRef.current.delete(player.id);
          }
        }

        if (player.alive) {
          drawRemotePlayer(
            ctx,
            player.x * canvas.width,
            player.y * canvas.height,
            player.color,
            player.username,
            activeMultiplayer.room.players.findIndex((item) => item.id === player.id) + 1,
          );
        }
      });
      remoteAliveRef.current.forEach((_, playerId) => {
        if (!visibleRemotePlayerIds.has(playerId)) remoteAliveRef.current.delete(playerId);
      });
      if (timestamp - state.lastPositionBroadcast > 60) {
        activeMultiplayer.onPosition(
          state.player.x / canvas.width,
          state.player.y / canvas.height,
        );
        state.lastPositionBroadcast = timestamp;
      }
    }

    if (effectsActive()) emitTrail(particlesRef.current, state.player.x, state.player.y, ship.color);
    stepParticles(particlesRef.current);
    drawParticles(ctx, particlesRef.current);
    drawPlayer(ctx, state.player.x, state.player.y, ship, abilityActive);
    setGameState((previous) => (previous.score === liveScore ? previous : { ...previous, score: liveScore }));
    requestRef.current = requestAnimationFrame(gameLoop);
  };

  const currentShip = ships[shipRef.current];
  const displayedSector = startingSectorNumber + Math.floor(gameState.score / SCORE_PER_SECTOR);
  const currentEnvironment = getSectorEnvironmentByNumber(displayedSector);

  return (
    <div className={`mobile-game-frame ${isPortal ? "portal-fit-frame" : ""} relative w-full aspect-video rounded-xl overflow-hidden border-2 border-primary/30 shadow-2xl shadow-primary/20 bg-black`}>
      <canvas ref={canvasRef} className="w-full h-full block" />
      <MusicToggle />
      {gameState.isPlaying && <MobileControls keys={gameStateRef.current.keys} />}
      <AchievementToast
        notice={achievementQueue[0] ?? null}
        onDismiss={dismissAchievement}
      />
      <div className="absolute top-4 right-4 text-right font-mono text-white">
        <div className="text-2xl font-bold neon-text">
          SCORE:{" "}
          {Math.floor(gameState.score)}
        </div>
        {gameState.isPlaying && (
          <>
            <div className="text-[10px] text-muted-foreground tracking-widest">{currentShip.name}</div>
            <AnimatePresence mode="wait">
              <motion.div
                key={displayedSector}
                initial={{ opacity: 0, y: 4, filter: "blur(3px)" }}
                animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                exit={{ opacity: 0, y: -3, filter: "blur(2px)" }}
                transition={{ duration: 0.35, ease: "easeOut" }}
                aria-live="polite"
                className="text-[9px] font-mono tracking-[0.18em] text-white/55"
              >
                {currentEnvironment.shortName} · SECTOR {String(displayedSector).padStart(2, "0")}
              </motion.div>
            </AnimatePresence>
          </>
        )}
      </div>

      {gameState.isPlaying && (
        <button
          type="button"
          onClick={activateAbility}
          disabled={currentShip.id === "vanguard" || currentShip.id === "titan"}
          className={`absolute bottom-4 left-4 flex items-center gap-3 rounded-lg border px-4 py-2 text-left font-mono transition-all ${abilityUi.active ? "border-primary bg-primary/30 shadow-[0_0_20px_rgba(124,58,237,0.45)]" : "border-white/20 bg-black/60"} disabled:cursor-default`}
        >
          {currentShip.id === "titan" ? <Shield className="h-5 w-5 text-amber-300" /> : <Sparkles className="h-5 w-5 text-cyan-300" />}
          <span><span className="block text-[10px] tracking-widest text-muted-foreground">{abilityUi.label}</span><span className="block text-xs text-white">{abilityUi.status}</span></span>
        </button>
      )}

      {countdown !== null && (
        <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-black/70 backdrop-blur-sm" role="status" aria-live="assertive">
          <div className="mb-2 font-mono text-xs tracking-[0.3em] text-white/60">LAUNCH IN</div>
          <AnimatePresence mode="wait">
            <motion.div
              key={countdown}
              initial={{ opacity: 0, scale: 1.6 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.7 }}
              transition={{ duration: 0.25, ease: "easeOut" }}
              className="font-display text-8xl font-bold text-white neon-text"
            >
              {countdown}
            </motion.div>
          </AnimatePresence>
        </div>
      )}

       {!gameState.isPlaying && !gameState.gameOver && !multiplayer && countdown === null && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 backdrop-blur-sm">
          <h2 className="text-4xl font-display font-bold text-white mb-6 animate-pulse">READY COMMANDER?</h2>
          <Button onClick={startWithCountdown} disabled={startRunMutation.isPending} size="lg" className="text-xl px-12 py-8 rounded-full bg-gradient-to-r from-primary to-accent hover:scale-105 transition-transform shadow-lg shadow-primary/40">
            <Play className="mr-3 h-8 w-8" /> {startRunMutation.isPending ? "AUTHORIZING..." : "LAUNCH MISSION"}
          </Button>
          <div className="mt-8 text-muted-foreground font-mono text-sm">CONTROLS: ARROW KEYS OR WASD · ABILITY: SPACE</div>
        </div>
      )}

      {gameState.gameOver && countdown === null && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={effectsActive() ? { delay: DEATH_EFFECT_MS / 1000 - 0.1, duration: 0.35 } : { duration: 0 }}
          className={`absolute inset-0 flex flex-col items-center justify-center bg-black/85 backdrop-blur-md p-4 ${isPortal ? "[@media(max-height:520px)]:p-2" : ""}`}
        >
          <h2 className={`text-4xl sm:text-5xl font-display font-bold text-destructive mb-5 neon-text ${isPortal ? "[@media(max-height:520px)]:text-2xl [@media(max-height:520px)]:mb-2" : ""}`}>MISSION TERMINATED</h2>
          {personalBest?.isNewBest && (
            <motion.div
              initial={effectsActive() ? { opacity: 0, scale: 0.8 } : false}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ type: "spring", stiffness: 260, damping: 18 }}
              className={`mb-4 flex items-center gap-2 rounded-full border border-yellow-300/60 bg-yellow-300/10 px-4 py-1.5 font-display text-sm font-bold tracking-widest text-yellow-300 ${isPortal ? "[@media(max-height:520px)]:mb-1 [@media(max-height:520px)]:py-0.5 [@media(max-height:520px)]:text-xs" : ""}`}
            >
              <Trophy className="h-4 w-4" /> NEW PERSONAL BEST
            </motion.div>
          )}
          <div className={`grid grid-cols-2 gap-x-8 gap-y-3 text-sm font-mono w-full max-w-md mb-6 ${isPortal ? "[@media(max-height:520px)]:grid-cols-4 [@media(max-height:520px)]:max-w-xl [@media(max-height:520px)]:gap-x-4 [@media(max-height:520px)]:gap-y-1 [@media(max-height:520px)]:mb-2" : ""}`}>
            <Result label="FINAL SCORE" value={gameState.score.toLocaleString()} />
            <Result label="SECTOR REACHED" value={gameState.sector.toString().padStart(2, "0")} />
            <Result label="SURVIVAL TIME" value={`${gameState.survivalTime.toFixed(1)}s`} />
            <Result label="GEMS EARNED" value={scoreMutation.data ? `+${scoreMutation.data.gemsEarned}` : "..."} accent />
            {!multiplayer && (
              <div className={`col-span-2 border-t border-white/10 pt-3 ${isPortal ? "[@media(max-height:520px)]:col-span-4 [@media(max-height:520px)]:pt-1" : ""}`}>
                <div className="flex justify-between text-yellow-300">
                  <span>PERSONAL BEST</span>
                  <span className="text-white">{personalBest ? personalBest.best.toLocaleString() : "..."}</span>
                </div>
                {personalBest && <p className="mt-1 text-[11px] tracking-wide text-muted-foreground">{bestNote(personalBest, gameState.score)}</p>}
              </div>
            )}
            <div className={`col-span-2 border-t border-white/10 pt-3 flex justify-between text-cyan-300 ${isPortal ? "[@media(max-height:520px)]:col-span-4 [@media(max-height:520px)]:pt-1" : ""}`}>
              <span>TOTAL GEMS</span>
              <span className="flex items-center gap-1.5 text-white"><Gem className="h-4 w-4" />{scoreMutation.data ? scoreMutation.data.totalGems + bonus.gems : "..."}</span>
            </div>
          </div>
          {scoreMutation.isPending && <p className="mb-4 text-primary animate-pulse font-mono text-xs">UPLOADING FLIGHT RECORD...</p>}
          {isPortal && scoreMutation.data && scoreMutation.data.gemsEarned > 0 && bonus.status !== "claimed" && (
            <Button
              onClick={() => void claimBonus(scoreMutation.data!.gemsEarned)}
              disabled={bonus.status !== "idle"}
              variant="secondary"
              size="lg"
              className="mb-4 font-mono [@media(max-height:520px)]:mb-2 [@media(max-height:520px)]:h-8 [@media(max-height:520px)]:text-xs"
            >
              <Video className="mr-2 h-5 w-5" />
              {bonus.status === "watching" ? "WATCHING..." : bonus.status === "unavailable" ? "NO AD AVAILABLE" : `WATCH AD: +${scoreMutation.data.gemsEarned} BONUS GEMS`}
            </Button>
          )}
          {bonus.status === "claimed" && <p className="mb-4 text-cyan-300 font-mono text-xs">BONUS +{bonus.gems} GEMS ADDED</p>}
          <div className="flex flex-wrap justify-center gap-3">
            <Button onClick={startWithCountdown} size="lg" className={`font-mono ${isPortal ? "[@media(max-height:520px)]:h-8 [@media(max-height:520px)]:text-xs" : ""}`}><RotateCcw className="mr-2 h-5 w-5" /> PLAY AGAIN</Button>
            <Button asChild variant="outline" size="lg" className={`font-mono ${isPortal ? "[@media(max-height:520px)]:h-8 [@media(max-height:520px)]:text-xs" : ""}`}><Link href="/hangar">HANGAR</Link></Button>
            {!isPortal && <Button asChild variant="outline" size="lg" className="font-mono"><Link href="/leaderboard"><Trophy className="mr-2 h-5 w-5" /> LEADERBOARD</Link></Button>}
          </div>
        </motion.div>
      )}
    </div>
  );
}

function readFirstFlightFlag() {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(FIRST_FLIGHT_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function nextRandom(state: { rngSeed: number }) {
  state.rngSeed = (state.rngSeed * 1664525 + 1013904223) >>> 0;
  return state.rngSeed / 4_294_967_296;
}

/** One line under the best score: how this run compares with it. */
function bestNote(result: PersonalBestResult, score: number) {
  if (result.isNewBest) {
    return result.previous === null
      ? "FIRST RECORDED SCORE. THIS IS THE ONE TO BEAT."
      : `BEAT YOUR PREVIOUS BEST BY ${(result.best - result.previous).toLocaleString()}`;
  }
  if (score >= result.best) return "MATCHED YOUR BEST";
  return `${(result.best - score).toLocaleString()} TO BEAT YOUR BEST`;
}

function Result({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return <div><div className="text-[10px] tracking-widest text-muted-foreground mb-1">{label}</div><div className={accent ? "text-lg text-cyan-300" : "text-lg text-white"}>{value}</div></div>;
}

function drawObstacle(ctx: CanvasRenderingContext2D, obstacle: Obstacle) {
  ctx.save();
  if (obstacle.type === "asteroid") {
    ctx.fillStyle = "#475569";
    ctx.strokeStyle = "#1e293b";
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2;
      const radius = obstacle.size + Math.sin(angle * 3 + obstacle.x / 10) * obstacle.size * 0.3;
      const px = obstacle.x + Math.cos(angle) * radius;
      const py = obstacle.y + Math.sin(angle) * radius;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  } else {
    ctx.shadowBlur = 10;
    ctx.shadowColor = "#94a3b8";
    ctx.fillStyle = "#cbd5e1";
    ctx.beginPath();
    ctx.arc(obstacle.x, obstacle.y, obstacle.size, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawPlayer(ctx: CanvasRenderingContext2D, x: number, y: number, ship: typeof ships[ShipId], abilityActive: boolean) {
  ctx.save();
  ctx.translate(x, y);
  ctx.shadowBlur = abilityActive ? 35 : 20;
  ctx.shadowColor = ship.color;
  const flameHeight = 15 + Math.random() * 10;
  const flameGradient = ctx.createLinearGradient(0, 0, -flameHeight, 0);
  flameGradient.addColorStop(0, ship.id === "titan" ? "#f59e0b" : "#f472b6");
  flameGradient.addColorStop(1, "transparent");
  ctx.beginPath();
  ctx.fillStyle = flameGradient;
  ctx.moveTo(-10, -5);
  ctx.lineTo(-10 - flameHeight, 0);
  ctx.lineTo(-10, 5);
  ctx.fill();

  if (ship.id === "titan") {
    ctx.fillStyle = "#fbbf24";
    ctx.beginPath();
    ctx.moveTo(24, 0); ctx.lineTo(-8, 15); ctx.lineTo(-15, 9); ctx.lineTo(-15, -9); ctx.lineTo(-8, -15); ctx.closePath(); ctx.fill();
    ctx.fillStyle = "#78350f";
    ctx.fillRect(-2, -8, 14, 16);
  } else if (ship.id === "phantom") {
    ctx.fillStyle = "#e0f2fe";
    ctx.beginPath();
    ctx.moveTo(28, 0); ctx.lineTo(-12, 12); ctx.lineTo(-3, 0); ctx.lineTo(-12, -12); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = "#22d3ee";
    ctx.beginPath(); ctx.moveTo(-4, -13); ctx.lineTo(-15, -20); ctx.moveTo(-4, 13); ctx.lineTo(-15, 20); ctx.stroke();
  } else if (ship.id === "nova") {
    ctx.fillStyle = "#fdf2f8";
    ctx.beginPath();
    ctx.moveTo(28, 0); ctx.lineTo(-10, 12); ctx.lineTo(-4, 0); ctx.lineTo(-10, -12); ctx.closePath(); ctx.fill();
    ctx.fillStyle = "#f472b6";
    ctx.beginPath(); ctx.moveTo(-3, -4); ctx.lineTo(-16, -16); ctx.lineTo(-10, 0); ctx.lineTo(-16, 16); ctx.lineTo(-3, 4); ctx.fill();
  } else {
    ctx.fillStyle = "#4f46e5";
    ctx.beginPath(); ctx.moveTo(-5, -15); ctx.lineTo(10, -5); ctx.lineTo(10, 5); ctx.lineTo(-5, 15); ctx.fill();
    ctx.fillStyle = "#f8fafc";
    ctx.beginPath(); ctx.moveTo(25, 0); ctx.lineTo(-10, 12); ctx.lineTo(-5, 0); ctx.lineTo(-10, -12); ctx.closePath(); ctx.fill();
  }
  ctx.fillStyle = ship.id === "titan" ? "#fde68a" : "#0ea5e9";
  ctx.beginPath();
  ctx.ellipse(8, 0, ship.id === "titan" ? 7 : 10, 4, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawRemotePlayer(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  color: string,
  username: string,
  playerNumber: number,
) {
  ctx.save();
  ctx.translate(x, y);
  ctx.shadowBlur = 18;
  ctx.shadowColor = color;
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(0, 0, 27, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = color;
  ctx.globalAlpha = 0.9;
  ctx.beginPath();
  ctx.moveTo(19, 0);
  ctx.lineTo(-12, 11);
  ctx.lineTo(-6, 0);
  ctx.lineTo(-12, -11);
  ctx.closePath();
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.fillStyle = "#020617";
  ctx.beginPath();
  ctx.arc(0, 0, 8, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = color;
  ctx.font = "bold 10px 'Share Tech Mono', monospace";
  ctx.textAlign = "center";
  ctx.fillText(`${playerNumber}`, 0, 3);
  ctx.fillStyle = "#f8fafc";
  ctx.font = "10px 'Share Tech Mono', monospace";
  ctx.fillText(username.toUpperCase().slice(0, 14), 0, -34);
  ctx.restore();
}

function drawDeathBurst(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  color: string,
  progress: number,
) {
  const radius = 12 + progress * 48;
  const alpha = Math.max(0, 1 - progress);
  ctx.save();
  ctx.translate(x, y);
  ctx.globalAlpha = alpha;
  ctx.shadowBlur = 26;
  ctx.shadowColor = color;
  ctx.strokeStyle = color;
  ctx.lineWidth = 3 + (1 - progress) * 3;
  ctx.beginPath();
  ctx.arc(0, 0, radius, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = "#fef3c7";
  ctx.lineWidth = 2;
  for (let index = 0; index < 8; index += 1) {
    const angle = (index / 8) * Math.PI * 2;
    const innerRadius = radius * 0.55;
    const outerRadius = radius + 12 * (1 - progress);
    ctx.beginPath();
    ctx.moveTo(Math.cos(angle) * innerRadius, Math.sin(angle) * innerRadius);
    ctx.lineTo(Math.cos(angle) * outerRadius, Math.sin(angle) * outerRadius);
    ctx.stroke();
  }
  ctx.restore();
}