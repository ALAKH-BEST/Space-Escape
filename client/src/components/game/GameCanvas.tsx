import { useEffect, useRef, useState } from "react";
import { useSubmitScore } from "@/hooks/use-scores";
import { Button } from "@/components/ui/button";
import { Play, RotateCcw, Trophy } from "lucide-react";

interface GameState {
  isPlaying: boolean;
  score: number;
  gameOver: boolean;
}

export function GameCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const requestRef = useRef<number>();
  const scoreMutation = useSubmitScore();
  
  const [gameState, setGameState] = useState<GameState>({
    isPlaying: false,
    score: 0,
    gameOver: false,
  });

  // Game Constants
  const PLAYER_SIZE = 30;
  const OBSTACLE_SPEED = 3.5;
  const SPAWN_RATE = 1500; // ms
  const PLAYER_SPEED = 5.5;

  // Refs for game loop state (avoiding react re-renders inside loop)
  const gameStateRef = useRef({
    player: { x: 50, y: 200, dy: 0 },
    obstacles: [] as { x: number; y: number; type: 'planet' | 'asteroid' | 'stone'; size: number; speed: number }[],
    stars: [] as { x: number; y: number; size: number; speed: number }[],
    keys: { ArrowUp: false, ArrowDown: false, ArrowLeft: false, ArrowRight: false, w: false, s: false, a: false, d: false },
    lastSpawn: 0,
    score: 0,
    isPlaying: false
  });

  // Initialize Stars
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    // Set proper size
    const resizeCanvas = () => {
      canvas.width = canvas.clientWidth;
      canvas.height = canvas.clientHeight;
    };
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    // Initial stars
    for(let i = 0; i < 100; i++) {
      gameStateRef.current.stars.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        size: Math.random() * 2,
        speed: Math.random() * 0.5 + 0.1
      });
    }

    return () => window.removeEventListener('resize', resizeCanvas);
  }, []);

  // Controls
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (gameStateRef.current.keys.hasOwnProperty(e.key)) {
        gameStateRef.current.keys[e.key as keyof typeof gameStateRef.current.keys] = true;
        // Prevent scrolling with arrows
        if(["ArrowUp","ArrowDown","ArrowLeft","ArrowRight"].indexOf(e.code) > -1) {
            e.preventDefault();
        }
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (gameStateRef.current.keys.hasOwnProperty(e.key)) {
        gameStateRef.current.keys[e.key as keyof typeof gameStateRef.current.keys] = false;
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  const startGame = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    gameStateRef.current = {
      ...gameStateRef.current,
      player: { x: 50, y: canvas.height / 2, dy: 0 },
      obstacles: [],
      score: 0,
      isPlaying: true,
      lastSpawn: performance.now()
    };
    
    setGameState({ isPlaying: true, score: 0, gameOver: false });
    requestRef.current = requestAnimationFrame(gameLoop);
  };

  const stopGame = () => {
    if (requestRef.current) cancelAnimationFrame(requestRef.current);
    gameStateRef.current.isPlaying = false;
    
    setGameState(prev => ({ ...prev, isPlaying: false, gameOver: true }));
    
    // Submit score
    if (gameStateRef.current.score > 0) {
      scoreMutation.mutate({ score: Math.floor(gameStateRef.current.score) });
    }
  };

  const gameLoop = (timestamp: number) => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    const state = gameStateRef.current;

    if (!canvas || !ctx || !state.isPlaying) return;

    // Clear
    ctx.fillStyle = '#0b0f19'; // Match --background
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Update Player
    if (state.keys.ArrowUp || state.keys.w) state.player.y -= PLAYER_SPEED;
    if (state.keys.ArrowDown || state.keys.s) state.player.y += PLAYER_SPEED;
    if (state.keys.ArrowLeft || state.keys.a) state.player.x -= PLAYER_SPEED;
    if (state.keys.ArrowRight || state.keys.d) state.player.x += PLAYER_SPEED;

    // Boundary Checks
    state.player.y = Math.max(PLAYER_SIZE, Math.min(canvas.height - PLAYER_SIZE, state.player.y));
    state.player.x = Math.max(PLAYER_SIZE, Math.min(canvas.width - PLAYER_SIZE, state.player.x));

    // Update Stars (Parallax)
    state.stars.forEach(star => {
      star.x -= star.speed;
      if (star.x < 0) star.x = canvas.width;
      
      ctx.fillStyle = `rgba(255, 255, 255, ${Math.random() * 0.5 + 0.3})`;
      ctx.beginPath();
      ctx.arc(star.x, star.y, star.size, 0, Math.PI * 2);
      ctx.fill();
    });

    // Spawn Obstacles
    if (timestamp - state.lastSpawn > SPAWN_RATE - Math.min(700, state.score * 0.5)) { // Capped difficulty
      const types: ('planet' | 'asteroid' | 'stone')[] = ['planet', 'asteroid', 'stone'];
      const type = types[Math.floor(Math.random() * types.length)];
      let size = 10;
      let speed = OBSTACLE_SPEED;

      if (type === 'planet') { size = 40; speed = OBSTACLE_SPEED * 0.8; }
      if (type === 'asteroid') { size = 25; speed = OBSTACLE_SPEED * 1.2; }
      if (type === 'stone') { size = 10; speed = OBSTACLE_SPEED * 1.5; }

      state.obstacles.push({
        x: canvas.width + 50,
        y: Math.random() * (canvas.height - 100) + 50,
        type,
        size,
        speed: speed + (state.score / 500) // Speed up over time
      });
      state.lastSpawn = timestamp;
    }

    // Update & Draw Obstacles
    state.obstacles.forEach((obs, index) => {
      obs.x -= obs.speed;

      // Draw
      ctx.save();
      if (obs.type === 'planet') {
        // More interesting planet
        const gradient = ctx.createRadialGradient(obs.x - obs.size/3, obs.y - obs.size/3, obs.size/10, obs.x, obs.y, obs.size);
        gradient.addColorStop(0, '#818cf8');
        gradient.addColorStop(0.6, '#4f46e5');
        gradient.addColorStop(1, '#312e81');
        
        ctx.shadowBlur = 15;
        ctx.shadowColor = 'rgba(79, 70, 229, 0.4)';
        
        ctx.beginPath();
        ctx.fillStyle = gradient;
        ctx.arc(obs.x, obs.y, obs.size, 0, Math.PI * 2);
        ctx.fill();
        
        // Planet Rings
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.ellipse(obs.x, obs.y, obs.size * 1.5, obs.size * 0.4, Math.PI / 4, 0, Math.PI * 2);
        ctx.stroke();
      } else if (obs.type === 'asteroid') {
        // Detailed Asteroid
        ctx.fillStyle = '#475569';
        ctx.strokeStyle = '#1e293b';
        ctx.lineWidth = 1;
        
        ctx.beginPath();
        const sides = 8;
        for (let i = 0; i < sides; i++) {
          const angle = (i / sides) * Math.PI * 2;
          const variance = obs.size * 0.3;
          const r = obs.size + (Math.sin(angle * 3 + obs.x / 10) * variance);
          const px = obs.x + Math.cos(angle) * r;
          const py = obs.y + Math.sin(angle) * r;
          if (i === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        
        // Craters
        ctx.fillStyle = 'rgba(0,0,0,0.2)';
        [0.3, 0.7, 1.2].forEach((offset, i) => {
          ctx.beginPath();
          ctx.arc(obs.x + Math.cos(i) * 5, obs.y + Math.sin(i) * 5, obs.size/4, 0, Math.PI * 2);
          ctx.fill();
        });
      } else {
        // Space Stone with glow
        ctx.shadowBlur = 10;
        ctx.shadowColor = '#94a3b8';
        ctx.fillStyle = '#cbd5e1';
        ctx.beginPath();
        ctx.arc(obs.x, obs.y, obs.size, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();

      // Simple Circle Collision
      const dx = state.player.x - obs.x;
      const dy = state.player.y - obs.y;
      const distance = Math.sqrt(dx * dx + dy * dy);

      if (distance < PLAYER_SIZE/1.5 + obs.size) {
        stopGame();
        return;
      }

      // Remove off-screen
      if (obs.x < -100) {
        state.obstacles.splice(index, 1);
        state.score += 10;
        setGameState(prev => ({ ...prev, score: state.score }));
      }
    });

    if (state.isPlaying) {
      // Draw Player (Detailed Spaceship)
      ctx.save();
      ctx.translate(state.player.x, state.player.y);
      
      // Engine Flame
      const flameHeight = 15 + Math.random() * 10;
      const flameGradient = ctx.createLinearGradient(0, 0, -flameHeight, 0);
      flameGradient.addColorStop(0, '#f472b6');
      flameGradient.addColorStop(1, 'transparent');
      
      ctx.beginPath();
      ctx.fillStyle = flameGradient;
      ctx.moveTo(-10, -5);
      ctx.lineTo(-10 - flameHeight, 0);
      ctx.lineTo(-10, 5);
      ctx.fill();

      // Ship Glow
      ctx.shadowBlur = 20;
      ctx.shadowColor = '#818cf8';
      
      // Wing Accents
      ctx.fillStyle = '#4f46e5';
      ctx.beginPath();
      ctx.moveTo(-5, -15);
      ctx.lineTo(10, -5);
      ctx.lineTo(10, 5);
      ctx.lineTo(-5, 15);
      ctx.fill();

      // Ship Body
      ctx.fillStyle = '#f8fafc';
      ctx.beginPath();
      ctx.moveTo(25, 0); // Nose
      ctx.lineTo(-10, 12);
      ctx.lineTo(-5, 0);
      ctx.lineTo(-10, -12);
      ctx.closePath();
      ctx.fill();
      
      // Cockpit Glass
      ctx.fillStyle = '#0ea5e9';
      ctx.beginPath();
      ctx.ellipse(8, 0, 10, 4, 0, 0, Math.PI * 2);
      ctx.fill();
      
      // Cockpit Reflection
      ctx.fillStyle = 'rgba(255,255,255,0.4)';
      ctx.beginPath();
      ctx.ellipse(10, -1, 4, 1, 0, 0, Math.PI * 2);
      ctx.fill();
      
      ctx.restore();

      // Score
      state.score += 0.1;
      
      requestRef.current = requestAnimationFrame(gameLoop);
    }
  };

  return (
    <div className="relative w-full aspect-video rounded-xl overflow-hidden border-2 border-primary/30 shadow-2xl shadow-primary/20 bg-black">
      <canvas 
        ref={canvasRef} 
        className="w-full h-full block"
      />
      
      {/* UI Overlay */}
      <div className="absolute top-4 right-4 font-mono text-2xl font-bold text-white neon-text">
        SCORE: {Math.floor(gameState.score)}
      </div>

      {!gameState.isPlaying && !gameState.gameOver && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 backdrop-blur-sm">
          <h2 className="text-4xl font-display font-bold text-white mb-6 animate-pulse">
            READY COMMANDER?
          </h2>
          <Button 
            onClick={startGame}
            size="lg" 
            className="text-xl px-12 py-8 rounded-full bg-gradient-to-r from-primary to-accent hover:scale-105 transition-transform shadow-lg shadow-primary/40"
          >
            <Play className="mr-3 h-8 w-8" />
            LAUNCH MISSION
          </Button>
          <div className="mt-8 text-muted-foreground font-mono text-sm">
            CONTROLS: ARROW KEYS OR WASD
          </div>
        </div>
      )}

      {gameState.gameOver && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 backdrop-blur-md">
          <h2 className="text-5xl font-display font-bold text-destructive mb-2 neon-text">
            MISSION FAILED
          </h2>
          <div className="text-3xl font-mono text-white mb-8">
            FINAL SCORE: <span className="text-primary">{Math.floor(gameState.score)}</span>
          </div>
          
          <div className="flex gap-4">
            <Button 
              onClick={startGame}
              size="lg" 
              className="text-lg px-8 py-6 rounded-xl bg-white text-black hover:bg-gray-200"
            >
              <RotateCcw className="mr-2 h-5 w-5" />
              RETRY
            </Button>
          </div>
          {scoreMutation.isPending && (
             <p className="mt-4 text-primary animate-pulse font-mono">UPLOADING SCORE...</p>
          )}
        </div>
      )}
    </div>
  );
}
