import React, { useRef, useEffect, useCallback, memo } from 'react';
import { GameState, FloatingText, Particle, TimingRating, ApexPoint, RoadSegment, TrailPoint } from '../types';
import { GAME_CONFIG } from '../constants';
import { lerp, clamp, randomRange } from '../utils/gameUtils';

interface GameCanvasProps {
  gameState: GameState;
  setGameState: (state: GameState) => void;
  setScore: (score: number) => void;
}

interface ProjectedPoint {
  screenX: number;
  screenY: number;
  scale: number;
}

interface CrashState {
    active: boolean;
    x: number;
    y: number;
    vx: number;
    vy: number;
    rot: number;
    vRot: number;
}

// Cycle duration in seconds (120s = 2 minutes)
const DAY_CYCLE_DURATION = 120;

const GameCanvas: React.FC<GameCanvasProps> = ({ gameState, setGameState, setScore }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  // -- Mutable Game State --
  const frameIdRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(0);
  
  // Inputs
  const inputRef = useRef({
      left: false,
      right: false
  });
  
  // Audio Refs
  const audioCtxRef = useRef<AudioContext | null>(null);
  const engineOscRef = useRef<OscillatorNode | null>(null);
  const engineGainRef = useRef<GainNode | null>(null);
  const screechGainRef = useRef<GainNode | null>(null);
  const screechSourceRef = useRef<AudioBufferSourceNode | null>(null);

  // Player State
  const playerRef = useRef({
    x: 0, 
    lean: 0, 
    targetLean: 0, 
    speed: GAME_CONFIG.BASE_SPEED,
    distanceTraveled: 0,
    engineVibration: 0,
    offRoad: false,
    crash: { active: false, x: 0, y: 0, vx: 0, vy: 0, rot: 0, vRot: 0 } as CrashState,
    score: 0,
    trail: [] as TrailPoint[] // TRON Trail history
  });

  // World State
  const roadRef = useRef<{
    segments: RoadSegment[];
    apexPoints: ApexPoint[];
  }>({
    segments: [],
    apexPoints: []
  });

  // FX State
  const fxRef = useRef<{
    shake: number;
    texts: FloatingText[];
    particles: Particle[];
    slowMoFactor: number;
    zoom: number; 
    chromaticAberration: number;
    dayTime: number; 
  }>({
    shake: 0,
    texts: [],
    particles: [],
    slowMoFactor: 1.0,
    zoom: 1.0,
    chromaticAberration: 0,
    dayTime: 40 // Start mid-day
  });

  // --- Audio Logic ---
  const initAudio = useCallback(() => {
    if (audioCtxRef.current) {
        if (audioCtxRef.current.state === 'suspended') {
            audioCtxRef.current.resume();
        }
        return;
    }
    
    const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
    const ctx = new AudioContext();
    audioCtxRef.current = ctx;

    // Engine
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const filter = ctx.createBiquadFilter();
    
    osc.type = 'sawtooth';
    osc.frequency.value = 100;
    filter.type = 'lowpass';
    filter.frequency.value = 400;
    
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    
    osc.start();
    gain.gain.value = 0;
    
    engineOscRef.current = osc;
    engineGainRef.current = gain;

    // Screech
    const bufferSize = ctx.sampleRate * 2; 
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
    
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;
    noise.loop = true;
    
    const noiseFilter = ctx.createBiquadFilter();
    noiseFilter.type = 'highpass';
    noiseFilter.frequency.value = 1000;
    
    const noiseGain = ctx.createGain();
    noiseGain.gain.value = 0;

    noise.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(ctx.destination);
    noise.start();

    screechGainRef.current = noiseGain;
    screechSourceRef.current = noise;
  }, []);

  const playSFX = (type: 'perfect' | 'crash') => {
      const ctx = audioCtxRef.current;
      if (!ctx) return;

      const t = ctx.currentTime;

      if (type === 'perfect') {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(800, t);
          osc.frequency.exponentialRampToValueAtTime(1200, t + 0.1);
          gain.gain.setValueAtTime(0.3, t);
          gain.gain.exponentialRampToValueAtTime(0.01, t + 0.4);
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start();
          osc.stop(t + 0.4);
      } else if (type === 'crash') {
           const bufferSize = ctx.sampleRate;
           const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
           const data = buffer.getChannelData(0);
           for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
           const noise = ctx.createBufferSource();
           noise.buffer = buffer;
           const gain = ctx.createGain();
           gain.gain.setValueAtTime(0.8, t);
           gain.gain.exponentialRampToValueAtTime(0.01, t + 0.8);
           noise.connect(gain);
           gain.connect(ctx.destination);
           noise.start();
      }
  };


  // --- Logic ---

  const addTrackSegment = (enter: number, hold: number, exit: number, curve: number) => {
    const segments = roadRef.current.segments;
    const startZ = segments.length > 0 ? segments[segments.length - 1].z : 0;
    
    // Apex Logic
    if (Math.abs(curve) > 2) {
        // Apex is in the middle of the turn
        const apexZ = startZ + (enter + hold / 2) * GAME_CONFIG.SEGMENT_LENGTH;
        const direction = Math.sign(curve); 
        roadRef.current.apexPoints.push({ z: apexZ, direction, hit: false, scored: false });
    }

    // Enter turn
    for (let i = 0; i < enter; i++) {
        segments.push({ 
            z: startZ + (i + 1) * GAME_CONFIG.SEGMENT_LENGTH, 
            curve: lerp(0, curve, i / enter) 
        });
    }
    // Hold turn
    for (let i = 0; i < hold; i++) {
        const isApexZone = i > hold/2 - 2 && i < hold/2 + 2;
        segments.push({ 
            z: startZ + (enter + i + 1) * GAME_CONFIG.SEGMENT_LENGTH, 
            curve: curve,
            color: isApexZone ? GAME_CONFIG.COLOR_APEX_EDGE : undefined
        });
    }
    // Exit turn
    for (let i = 0; i < exit; i++) {
        segments.push({ 
            z: startZ + (enter + hold + i + 1) * GAME_CONFIG.SEGMENT_LENGTH, 
            curve: lerp(curve, 0, i / exit) 
        });
    }
  };

  const generateRoad = (playerZ: number) => {
    const segments = roadRef.current.segments;
    
    // Initial Road
    if (segments.length === 0) {
        addTrackSegment(0, 50, 0, 0); 
    }

    const lastSeg = segments[segments.length - 1];
    // Generate ahead
    if (lastSeg.z < playerZ + (GAME_CONFIG.VISIBLE_SEGMENTS * GAME_CONFIG.SEGMENT_LENGTH)) {
        const pattern = Math.random();
        
        if (pattern < 0.20) {
             // Straight
             addTrackSegment(0, randomRange(10, 30), 0, 0);
        } else if (pattern < 0.5) {
             // Medium Curve - Harder now
             const intensity = randomRange(3, 6); 
             const dir = Math.random() > 0.5 ? 1 : -1;
             addTrackSegment(20, 20, 20, intensity * dir); 
        } else if (pattern < 0.8) {
             // S-Curve (Chicane) - Sharp
             const intensity = randomRange(4, 7);
             const dir = Math.random() > 0.5 ? 1 : -1;
             addTrackSegment(15, 10, 15, intensity * dir);
             addTrackSegment(15, 10, 15, -intensity * dir);
        } else {
             // Long Hard Turn
             const intensity = randomRange(5, 8); // Very sharp!
             const dir = Math.random() > 0.5 ? 1 : -1;
             addTrackSegment(30, 40, 30, intensity * dir);
        }
    }

    // Cleanup behind
    while (segments.length > 0 && segments[0].z < playerZ - 2000) {
      segments.shift();
    }
    // Cleanup apex points
    roadRef.current.apexPoints = roadRef.current.apexPoints.filter(ap => ap.z > playerZ - 1000);
  };

  const spawnParticles = (x: number, y: number, color: string, count: number, speed: number = 200) => {
    for (let i = 0; i < count; i++) {
      const angle = randomRange(Math.PI, 2 * Math.PI); // Upwards mostly
      const vel = randomRange(speed * 0.5, speed * 2.0);
      fxRef.current.particles.push({
        id: Math.random(),
        x,
        y,
        vx: Math.cos(angle) * vel,
        vy: Math.sin(angle) * vel,
        life: randomRange(0.5, 1.0),
        color,
        size: randomRange(2, 6)
      });
    }
  };

  const spawnFloatingText = (text: string, rating: TimingRating) => {
    let color = GAME_CONFIG.COLOR_MISS;
    if (rating === 'PERFECT') color = GAME_CONFIG.COLOR_PERFECT;
    if (rating === 'GOOD') color = GAME_CONFIG.COLOR_GOOD;

    fxRef.current.texts.push({
      id: Math.random(),
      text,
      x: window.innerWidth / 2,
      y: window.innerHeight / 3,
      life: 0.8,
      color,
      scale: 0.5
    });
  };

  const handleCrash = () => {
    setGameState(GameState.GAME_OVER);
    playSFX('crash');
    
    if (engineGainRef.current) engineGainRef.current.gain.setTargetAtTime(0, audioCtxRef.current!.currentTime, 0.1);
    if (screechGainRef.current) screechGainRef.current.gain.setTargetAtTime(0, audioCtxRef.current!.currentTime, 0.1);

    const p = playerRef.current;
    
    fxRef.current.shake = 80;
    fxRef.current.slowMoFactor = 0.1; 
    
    // Removed all Red Flash/Vignette logic
    // Removed red chromatic aberration

    const flyDir = p.x > 0 ? 1 : -1; 
    
    // Fall Animation State
    p.crash = {
        active: true,
        x: 0, 
        y: 0,
        vx: flyDir * (p.speed * 0.5), // Continue lateral momentum
        vy: -300, // Small hop upwards before falling
        rot: p.lean, 
        vRot: flyDir * 15 // Spin
    };
  };

  // --- Main Update Loop ---
  const update = (dt: number, time: number) => {
    const p = playerRef.current;
    const r = roadRef.current;
    const fx = fxRef.current;
    
    const timeScale = fx.slowMoFactor;
    const delta = dt * timeScale;

    // Day/Night Cycle
    fx.dayTime = (fx.dayTime + delta) % DAY_CYCLE_DURATION;

    // 1. Controls
    if (inputRef.current.right) {
        p.targetLean = 1;
    } else if (inputRef.current.left) {
        p.targetLean = -1;
    } else {
        p.targetLean = 0; 
    }

    // 2. Physics & Speed
    if (gameState === GameState.GAME_OVER) {
        p.speed = lerp(p.speed, 0, 3.0 * dt);
    } else {
        // Accelerate
        p.speed = Math.min(p.speed + GAME_CONFIG.ACCELERATION * delta, GAME_CONFIG.MAX_SPEED);
    }

    // Calculate position on track
    // Find current segment to get curve
    const segments = r.segments;
    const currentSeg = segments.find(s => s.z >= p.distanceTraveled) || segments[0];
    const curveIntensity = currentSeg ? currentSeg.curve : 0;
    
    // PHYSICS: Speed Ratio Model
    // The faster you go, the more ground you cover sideways
    const speedRatio = p.speed / GAME_CONFIG.MAX_SPEED;
    
    // dx is the potential lateral movement capability this frame
    const dx = delta * 2.0 * speedRatio; 

    if (gameState === GameState.PLAYING) {
        // Lean smoothing
        p.lean = lerp(p.lean, p.targetLean, GAME_CONFIG.LEAN_SMOOTHING * delta);
        
        // 1. Steering Force (Player Input)
        p.x += p.lean * dx * GAME_CONFIG.STEER_SENSITIVITY;

        // 2. Centrifugal Force (Curve Pull)
        p.x -= curveIntensity * dx * GAME_CONFIG.CURVE_SENSITIVITY;

        // Auto-center on straights if speed is high enough to be stable
        if (Math.abs(curveIntensity) < 0.5 && p.targetLean === 0) {
            p.x = lerp(p.x, 0, 1.0 * delta);
        }

        // BOUNDARY LOGIC
        const absX = Math.abs(p.x);
        p.offRoad = absX > GAME_CONFIG.OFF_ROAD_LIMIT;

        if (p.offRoad) {
            // Off-road friction
            const offRoadDepth = (absX - GAME_CONFIG.OFF_ROAD_LIMIT) / (GAME_CONFIG.COLLISION_THRESHOLD - GAME_CONFIG.OFF_ROAD_LIMIT);
            
            p.speed -= GAME_CONFIG.OFF_ROAD_FRICTION * delta;
            p.speed = Math.max(p.speed, 2000); 
            
            p.engineVibration = 10 + (offRoadDepth * 20);
            fx.shake = lerp(fx.shake, 15 * offRoadDepth, 10 * delta);

            if (Math.random() < 0.4) {
                const screenW = window.innerWidth;
                const screenH = window.innerHeight;
                const particleX = screenW/2 + (p.x * screenW/3); 
                spawnParticles(particleX, screenH * 0.9, '#552e15', 1, 300);
            }
        } else {
             p.engineVibration = (p.speed / GAME_CONFIG.MAX_SPEED) * 3;
        }

        // TRON Trail Logic
        if (frameIdRef.current % 2 === 0) { // Add point every 2 frames
            p.trail.push({ x: p.x, z: p.distanceTraveled, alpha: 1.0 });
        }
        // Fade out trail
        p.trail.forEach(pt => pt.alpha -= 1.5 * delta); // Fade speed
        p.trail = p.trail.filter(pt => pt.alpha > 0);

        // Apex Detection & Scoring
        const apex = r.apexPoints.find(ap => !ap.hit && Math.abs(ap.z - p.distanceTraveled) < GAME_CONFIG.PERFECT_WINDOW);
        if (apex) {
            if (Math.sign(p.lean) === Math.sign(apex.direction) && Math.abs(p.lean) > 0.5) {
                apex.hit = true;
                const isPerfect = Math.abs(p.lean) > 0.8;
                spawnFloatingText(isPerfect ? "PERFECT" : "GOOD", isPerfect ? "PERFECT" : "GOOD");
                playSFX('perfect');
                p.speed = Math.min(p.speed + 300, GAME_CONFIG.MAX_SPEED);
            }
        }

        // Score Update
        r.apexPoints.forEach(ap => {
             if (!ap.scored && p.distanceTraveled > ap.z) {
                 ap.scored = true;
                 p.score += 1;
                 setScore(p.score);
             }
        });

        // REBUILT COLLIDER LOGIC
        // We use COLLISION_THRESHOLD directly with NO buffer. 
        // The Threshold has been increased in constants.ts to match the visual wall position.
        // This ensures the "mesh" (bike) touches the "mesh" (wall) exactly when the crash triggers.
        if (absX > GAME_CONFIG.COLLISION_THRESHOLD) {
             handleCrash();
        }
    } else if (gameState === GameState.GAME_OVER && p.crash.active) {
        // FALL Animation Physics
        const c = p.crash;
        c.x += c.vx * 0.003 * dt; 
        c.y += c.vy * dt;         
        c.rot += c.vRot * dt;     
        c.vy += 1500 * dt;        
    }

    // Move forward
    p.distanceTraveled += p.speed * delta;
    generateRoad(p.distanceTraveled);

    // 5. Audio
    if (audioCtxRef.current && engineOscRef.current && engineGainRef.current) {
        const now = audioCtxRef.current.currentTime;
        const speedRatio = p.speed / GAME_CONFIG.MAX_SPEED;
        const targetFreq = 60 + speedRatio * 400; 
        engineOscRef.current.frequency.setTargetAtTime(targetFreq, now, 0.1);
        
        const targetVol = gameState === GameState.PLAYING ? 0.15 : 0;
        engineGainRef.current.gain.setTargetAtTime(targetVol, now, 0.1);
        
        if (screechGainRef.current) {
            const isDrifting = Math.abs(p.lean) > 0.9 && speedRatio > 0.8;
            const isOffRoadNoise = p.offRoad && p.speed > 3000;
            const screechVol = (isDrifting || isOffRoadNoise) && gameState === GameState.PLAYING ? 0.3 : 0;
            screechGainRef.current.gain.setTargetAtTime(screechVol, now, 0.1);
            if (screechSourceRef.current) {
                screechSourceRef.current.playbackRate.value = isOffRoadNoise ? 0.5 : 1.0;
            }
        }
    }

    // 6. FX
    fx.shake = lerp(fx.shake, 0, 5 * dt);
    fx.slowMoFactor = lerp(fx.slowMoFactor, 1.0, 1.0 * dt); 
    fx.chromaticAberration = lerp(fx.chromaticAberration, 0, 5 * dt);
    const targetZoom = 1.0 - (speedRatio * 0.2);
    fx.zoom = lerp(fx.zoom, targetZoom, 2 * dt);
    
    // Update particles
    fx.particles.forEach(pt => {
      pt.x += pt.vx * dt; 
      pt.y += pt.vy * dt; 
      pt.vy += 800 * dt; // Gravity
      pt.life -= 1.5 * dt; 
    });
    fx.particles = fx.particles.filter(pt => pt.life > 0);
    
    // Update Text
    fx.texts.forEach(txt => {
      txt.y -= 150 * dt; 
      txt.life -= 1.5 * dt; 
      txt.scale = lerp(txt.scale, 1.2, 5 * dt);
    });
    fx.texts = fx.texts.filter(txt => txt.life > 0);
    
    frameIdRef.current++;
  };

  const project = (
    lineX: number, 
    lineY: number, 
    lineZ: number, 
    cameraX: number, 
    cameraY: number, 
    cameraZ: number, 
    cameraDepth: number,
    width: number, 
    height: number,
    roadWidth: number
  ): ProjectedPoint & { w: number } => {
    const cx = lineX - cameraX;
    const cy = lineY - cameraY;
    const cz = lineZ - cameraZ; 
    
    const safeZ = Math.max(10, cz);
    const scale = cameraDepth / safeZ;
    
    const screenX = Math.round((width / 2) + (scale * cx * width / 2));
    const screenY = Math.round((height / 2) - (scale * cy * height / 2));
    const projectedWidth = Math.round(scale * roadWidth * width / 2);
    
    return { screenX, screenY, scale, w: projectedWidth };
  };

  const drawPolygon = (ctx: CanvasRenderingContext2D, x1: number, y1: number, w1: number, x2: number, y2: number, w2: number, color: string) => {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x1 - w1, y1); 
    ctx.lineTo(x2 - w2, y2); 
    ctx.lineTo(x2 + w2, y2); 
    ctx.lineTo(x1 + w1, y1);
    ctx.closePath();
    ctx.fill();
  };

  const drawBike = (ctx: CanvasRenderingContext2D, lean: number) => {
    // RED NEON TRON BIKE
    const angle = lean * (Math.PI / 3.5);  
    ctx.rotate(angle);
    
    const neonColor = GAME_CONFIG.COLOR_PLAYER_ACCENT; // Red
    
    // 1. REAR WHEEL (Massive Red Ring)
    ctx.shadowBlur = 30; 
    ctx.shadowColor = neonColor;
    ctx.strokeStyle = neonColor;
    ctx.lineWidth = 12;
    ctx.fillStyle = '#050505'; 
    
    ctx.beginPath();
    ctx.ellipse(0, 0, 16, 38, 0, 0, Math.PI * 2); 
    ctx.fill();
    ctx.stroke();
    
    // Inner black void
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.ellipse(0, 0, 8, 28, 0, 0, Math.PI * 2);
    ctx.fill();

    // 2. BIKE BODY
    ctx.fillStyle = '#0f0f0f'; 
    ctx.beginPath();
    ctx.moveTo(-18, 5);
    ctx.lineTo(-20, -35);
    ctx.quadraticCurveTo(0, -60, 20, -35);
    ctx.lineTo(18, 5);
    ctx.fill();
    
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 1;
    ctx.stroke();

    // Red Neon Strip on Spine
    ctx.shadowBlur = 15;
    ctx.shadowColor = neonColor;
    ctx.strokeStyle = neonColor;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, -58);
    ctx.lineTo(0, -25);
    ctx.stroke();

    // 3. RIDER
    ctx.fillStyle = '#111';
    ctx.beginPath();
    ctx.arc(0, -45, 11, 0, Math.PI*2);
    ctx.fill();
    
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-6, -45);
    ctx.lineTo(-4, -30);
    ctx.moveTo(6, -45);
    ctx.lineTo(4, -30);
    ctx.stroke();
  };

  const draw = (ctx: CanvasRenderingContext2D, time: number) => {
    const width = ctx.canvas.width;
    const height = ctx.canvas.height;
    const p = playerRef.current;
    const r = roadRef.current;
    const fx = fxRef.current;

    const cameraTilt = p.lean * 0.2; 
    
    // Clear
    ctx.fillStyle = GAME_CONFIG.COLOR_BACKGROUND;
    ctx.fillRect(0, 0, width, height);

    ctx.save();
    
    // Camera Transform
    ctx.translate(width/2, height/2);
    const shakeX = (Math.random() - 0.5) * fx.shake; 
    const shakeY = (Math.random() - 0.5) * fx.shake;
    ctx.translate(shakeX, shakeY);
    ctx.scale(fx.zoom, fx.zoom);
    ctx.rotate(-cameraTilt); 
    if (gameState === GameState.GAME_OVER && p.crash.active) {
        ctx.translate(0, 0); 
    }
    
    // --- SKY & HORIZON ---
    const bigWidth = width * 3;
    const bigHeight = height * 2;
    const horizonY = 0; 

    // Day/Night Logic
    const cyclePos = fx.dayTime;
    const dayLength = DAY_CYCLE_DURATION / 2;
    let sunY = 0;
    let isDay = false;
    let skyColorTop = '#050510';
    let skyColorBottom = '#1e1b4b';

    if (cyclePos < dayLength) {
        isDay = true;
        const sunArc = (cyclePos / dayLength) * Math.PI; 
        sunY = horizonY + (height * 0.1) - Math.sin(sunArc) * (height * 0.6);
        
        if (cyclePos < dayLength * 0.2 || cyclePos > dayLength * 0.8) {
             skyColorTop = '#4c1d95'; 
             skyColorBottom = '#f97316'; 
        } else {
             skyColorTop = '#0ea5e9'; 
             skyColorBottom = '#a855f7'; 
        }
    } else {
        skyColorTop = '#000000';
        skyColorBottom = '#0f172a';
    }

    const skyGrad = ctx.createLinearGradient(0, -bigHeight/2, 0, horizonY);
    skyGrad.addColorStop(0, skyColorTop);
    skyGrad.addColorStop(1, skyColorBottom);
    ctx.fillStyle = skyGrad;
    ctx.fillRect(-bigWidth/2, -bigHeight/2, bigWidth, bigHeight/2);

    if (isDay) {
        const sunRadius = height * 0.15;
        const sunGrad = ctx.createLinearGradient(0, sunY - sunRadius, 0, sunY + sunRadius);
        sunGrad.addColorStop(0, '#fcd34d');
        sunGrad.addColorStop(1, '#f43f5e');
        
        ctx.fillStyle = sunGrad;
        ctx.beginPath();
        ctx.arc(0, sunY, sunRadius, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = skyGrad; 
        for(let i=0; i<5; i++) {
             const h = sunRadius * 0.15;
             const yOff = sunY + sunRadius * 0.2 + (i * h * 1.5);
             if (yOff < sunY + sunRadius) {
                 ctx.fillRect(-sunRadius, yOff, sunRadius*2, h * 0.5);
             }
        }
    }

    const gridGrad = ctx.createLinearGradient(0, horizonY, 0, bigHeight/2);
    gridGrad.addColorStop(0, GAME_CONFIG.COLOR_GRID_FAR);
    gridGrad.addColorStop(1, '#000');
    ctx.fillStyle = gridGrad;
    ctx.fillRect(-bigWidth/2, horizonY, bigWidth, bigHeight/2);

    ctx.strokeStyle = 'rgba(162, 28, 175, 0.3)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    const gridOffset = (p.distanceTraveled % 2000) / 2000; 
    for(let i=0; i<20; i++) {
         const d = (i + gridOffset) / 20; 
         const y = horizonY + Math.pow(d, 3) * (height/2);
         ctx.moveTo(-bigWidth/2, y);
         ctx.lineTo(bigWidth/2, y);
    }
    ctx.stroke();

    ctx.translate(-width/2, -height/2);

    // --- RENDER ROAD ---
    const roadW = GAME_CONFIG.ROAD_WIDTH;
    const camHeight = GAME_CONFIG.CAMERA_HEIGHT;
    const camDepth = GAME_CONFIG.CAMERA_DEPTH;
    const playerZ = p.distanceTraveled;
    const playerX = p.x * (roadW / 2); 

    const segments = r.segments;
    let startIdx = 0;
    for(let i=0; i<segments.length; i++) {
        if(segments[i].z >= playerZ) { startIdx = i; break; }
    }
    
    const startSeg = segments[startIdx];
    const segmentPercent = startSeg ? (playerZ - (startSeg.z - GAME_CONFIG.SEGMENT_LENGTH)) / GAME_CONFIG.SEGMENT_LENGTH : 0;
    
    let dx = -(startSeg ? startSeg.curve * segmentPercent : 0); 
    let currentX = -(dx * segmentPercent); 

    const drawDistance = GAME_CONFIG.VISIBLE_SEGMENTS; 
    const segmentList = []; 
    
    // Road segments & Trail Reconstruction Data
    const trailSegments: { worldX: number, z: number }[] = [];

    for (let n = startIdx; n < startIdx + drawDistance && n < segments.length; n++) {
        const seg = segments[n];
        dx += seg.curve; 
        currentX += dx;

        const worldX = currentX - playerX;
        const worldZ = seg.z - playerZ;

        // Store data for trail rendering later (Map world Z to curve offset X)
        trailSegments.push({ worldX: currentX, z: seg.z });

        if (worldZ < 10) continue;

        const p1 = project(worldX, -camHeight, worldZ, 0, 0, 0, camDepth, width, height, roadW);
        segmentList.push({ p: p1, color: seg.color });
    }

    for (let i = segmentList.length - 1; i > 0; i--) {
        const p1 = segmentList[i-1].p; 
        const p2 = segmentList[i].p;   
        const segColorOverride = segmentList[i-1].color;

        if (p1.screenY <= p2.screenY) continue; 

        const segIndex = startIdx + i;
        const isDark = Math.floor(segIndex / 2) % 2 === 0; 
        
        // Shoulder
        const shoulderW1 = p1.w * GAME_CONFIG.COLLISION_THRESHOLD;
        const shoulderW2 = p2.w * GAME_CONFIG.COLLISION_THRESHOLD;
        const shoulderColor = isDark ? GAME_CONFIG.COLOR_SHOULDER_DARK : GAME_CONFIG.COLOR_SHOULDER_LIGHT;
        drawPolygon(ctx, p1.screenX, p1.screenY, shoulderW1, p2.screenX, p2.screenY, shoulderW2, shoulderColor);

        // Road
        const roadColor = isDark ? GAME_CONFIG.COLOR_ROAD : '#1a1a24';
        drawPolygon(ctx, p1.screenX, p1.screenY, p1.w, p2.screenX, p2.screenY, p2.w, roadColor);
        
        // Edge
        const edgeW1 = p1.w * 1.15; 
        const edgeW2 = p2.w * 1.15;
        const kerbColor = segColorOverride || (isDark ? GAME_CONFIG.COLOR_ROAD_EDGE : '#ffffff');
        ctx.fillStyle = kerbColor;
        ctx.beginPath();
        ctx.moveTo(p1.screenX - edgeW1, p1.screenY);
        ctx.lineTo(p2.screenX - edgeW2, p2.screenY);
        ctx.lineTo(p2.screenX - p2.w, p2.screenY);
        ctx.lineTo(p1.screenX - p1.w, p1.screenY);
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(p1.screenX + p1.w, p1.screenY);
        ctx.lineTo(p2.screenX + p2.w, p2.screenY);
        ctx.lineTo(p2.screenX + edgeW2, p2.screenY);
        ctx.lineTo(p1.screenX + edgeW1, p1.screenY);
        ctx.fill();

        // Lane
        if (isDark) {
           const lw1 = p1.w * 0.03; 
           const lw2 = p2.w * 0.03;
           drawPolygon(ctx, p1.screenX, p1.screenY, lw1, p2.screenX, p2.screenY, lw2, GAME_CONFIG.COLOR_LANE_MARKER);
        }
    }
    
    // --- RENDER TRON TRAIL ---
    if (gameState === GameState.PLAYING && p.trail.length > 1) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter'; // Additive blending for neon glow
        
        // Iterate through trail points
        for (let i = 0; i < p.trail.length - 1; i++) {
            const tp1 = p.trail[i];
            const tp2 = p.trail[i+1];
            
            // Reconstruct World Position relative to CURRENT camera curve
            // We find the segment curve offset closest to the trail point's Z
            const seg1 = trailSegments.find(ts => Math.abs(ts.z - tp1.z) < GAME_CONFIG.SEGMENT_LENGTH);
            const seg2 = trailSegments.find(ts => Math.abs(ts.z - tp2.z) < GAME_CONFIG.SEGMENT_LENGTH);
            
            if (seg1 && seg2 && tp1.z > playerZ + 10 && tp2.z > playerZ + 10) {
                const curveOffsetX1 = seg1.worldX; 
                const curveOffsetX2 = seg2.worldX;
                
                // Trail Point X is stored as normalized road offset. Convert to World X + Curve Offset.
                const tx1 = curveOffsetX1 + (tp1.x * roadW / 2) - playerX;
                const tx2 = curveOffsetX2 + (tp2.x * roadW / 2) - playerX;
                
                const tz1 = tp1.z - playerZ;
                const tz2 = tp2.z - playerZ;
                
                const proj1 = project(tx1, -camHeight, tz1, 0, 0, 0, camDepth, width, height, roadW);
                const proj2 = project(tx2, -camHeight, tz2, 0, 0, 0, camDepth, width, height, roadW);
                
                const trailW1 = proj1.w * 0.15; // Width of trail
                const trailW2 = proj2.w * 0.15;

                ctx.globalAlpha = tp1.alpha;
                ctx.shadowColor = GAME_CONFIG.COLOR_PLAYER_ACCENT;
                ctx.shadowBlur = 10;
                drawPolygon(ctx, proj1.screenX, proj1.screenY, trailW1, proj2.screenX, proj2.screenY, trailW2, GAME_CONFIG.COLOR_PLAYER_ACCENT);
            }
        }
        ctx.restore();
    }

    // --- RENDER PLAYER ---
    const jitter = Math.sin(time / 20) * (p.engineVibration * 0.8);
    
    ctx.save();
    let playerScreenX = width / 2 + jitter; 
    let playerScreenY = height * 0.85; 

    if (gameState === GameState.GAME_OVER && p.crash.active) {
        playerScreenX += p.crash.x; 
        playerScreenY += p.crash.y;
        
        ctx.translate(playerScreenX, playerScreenY); 
        ctx.rotate(p.crash.rot); 
        drawBike(ctx, 0); 
    } else {
        ctx.translate(playerScreenX, playerScreenY); 
        drawBike(ctx, p.lean);
    }
    
    // Speed Lines Effect
    if(p.speed > 8000 && gameState === GameState.PLAYING) {
        ctx.globalCompositeOperation = 'screen'; 
        ctx.beginPath(); 
        ctx.strokeStyle = 'rgba(255,255,255,0.05)'; 
        ctx.lineWidth = 2;
        const speedCount = Math.floor((p.speed - 8000) / 200);
        for(let i=0; i<speedCount; i++) {
            const angle = Math.random() * Math.PI * 2;
            const dist = randomRange(100, width);
            const lx = width/2 + Math.cos(angle) * dist * 0.1;
            const ly = height/2 + Math.sin(angle) * dist * 0.1;
            const len = dist * 0.4;
            ctx.moveTo(lx, ly); 
            ctx.lineTo(lx + Math.cos(angle)*len, ly + Math.sin(angle)*len);
        }
        ctx.stroke(); 
        ctx.globalCompositeOperation = 'source-over';
    }
    
    // REMOVED RED VIGNETTE AND CHROMATIC ABERRATION

    ctx.restore();
    ctx.restore(); // Final restore

    // Particles Overlay
    fx.particles.forEach(pt => {
        ctx.globalAlpha = pt.life; 
        ctx.fillStyle = pt.color; 
        ctx.beginPath();
        if (pt.color === '#fcd34d') { // Spark
             ctx.moveTo(pt.x, pt.y); 
             ctx.lineTo(pt.x - pt.vx * 0.05, pt.y - pt.vy * 0.05); 
             ctx.strokeStyle = pt.color; 
             ctx.lineWidth = 2; 
             ctx.stroke(); 
        } else { 
            ctx.arc(pt.x, pt.y, pt.size, 0, Math.PI * 2); 
            ctx.fill(); 
        }
    });
    ctx.globalAlpha = 1;

    // Floating Text
    fx.texts.forEach(txt => {
        ctx.save(); 
        ctx.translate(txt.x, txt.y); 
        ctx.scale(txt.scale, txt.scale);
        
        ctx.font = 'italic 900 80px Arial'; 
        ctx.textAlign = 'center';
        
        ctx.shadowColor = txt.color; 
        ctx.shadowBlur = 20;
        ctx.fillStyle = txt.color; 
        ctx.fillText(txt.text, 0, 0); 
        
        ctx.shadowBlur = 0;
        ctx.strokeStyle = '#fff'; 
        ctx.lineWidth = 3; 
        ctx.strokeText(txt.text, 0, 0); 
        
        ctx.restore();
    });
  };

  useEffect(() => {
    if (gameState !== GameState.PLAYING && gameState !== GameState.GAME_OVER) return;
    if (gameState === GameState.PLAYING && audioCtxRef.current?.state === 'suspended') { audioCtxRef.current.resume(); }

    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: false }); if (!ctx) return;
    canvas.width = window.innerWidth; canvas.height = window.innerHeight;

    let animationFrameId: number;
    const render = (time: number) => {
      if (!lastTimeRef.current) lastTimeRef.current = time;
      const deltaTime = (time - lastTimeRef.current) / 1000;
      lastTimeRef.current = time;
      
      const safeDelta = Math.min(deltaTime, 0.1);
      
      if (gameState === GameState.PLAYING || gameState === GameState.GAME_OVER) {
          update(safeDelta, time);
      }
      draw(ctx, time);
      animationFrameId = requestAnimationFrame(render);
    };
    animationFrameId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animationFrameId);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameState]);

  useEffect(() => {
    if (gameState === GameState.PLAYING) {
        playerRef.current = {
            x: 0, lean: 0, targetLean: 0,
            speed: GAME_CONFIG.BASE_SPEED, distanceTraveled: 0, engineVibration: 0,
            offRoad: false,
            crash: { active: false, x: 0, y: 0, vx: 0, vy: 0, rot: 0, vRot: 0 },
            score: 0,
            trail: []
        };
        roadRef.current = { segments: [], apexPoints: [] };
        fxRef.current = { shake: 0, texts: [], particles: [], slowMoFactor: 1.0, zoom: 1.0, chromaticAberration: 0, dayTime: 40 };
        inputRef.current = { left: false, right: false };
        lastTimeRef.current = 0;
        if(engineGainRef.current) engineGainRef.current.gain.value = 0.15;
    }
  }, [gameState]);

  // Input Event Listeners
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
        if (gameState !== GameState.PLAYING) return;
        if (e.code === 'ArrowRight' || e.code === 'KeyD') inputRef.current.right = true;
        if (e.code === 'ArrowLeft' || e.code === 'KeyA') inputRef.current.left = true;
    };
    
    const handleKeyUp = (e: KeyboardEvent) => {
        if (e.code === 'ArrowRight' || e.code === 'KeyD') inputRef.current.right = false;
        if (e.code === 'ArrowLeft' || e.code === 'KeyA') inputRef.current.left = false;
    };

    const handleTouchStart = (e: TouchEvent) => {
        if (gameState !== GameState.PLAYING) return;
        const width = window.innerWidth;
        for (let i = 0; i < e.touches.length; i++) {
            const t = e.touches[i];
            if (t.clientX > width / 2) inputRef.current.right = true;
            else inputRef.current.left = true;
        }
    };

    const handleTouchEnd = (e: TouchEvent) => {
        const width = window.innerWidth;
        let left = false; 
        let right = false;
        for (let i = 0; i < e.touches.length; i++) {
            const t = e.touches[i];
            if (t.clientX > width / 2) right = true;
            else left = true;
        }
        inputRef.current.left = left;
        inputRef.current.right = right;
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('touchstart', handleTouchStart);
    window.addEventListener('touchend', handleTouchEnd);

    return () => {
        window.removeEventListener('keydown', handleKeyDown);
        window.removeEventListener('keyup', handleKeyUp);
        window.removeEventListener('touchstart', handleTouchStart);
        window.removeEventListener('touchend', handleTouchEnd);
    };
  }, [gameState]);

  const handleMenuTap = () => {
      if (gameState !== GameState.PLAYING) {
          initAudio();
          if (gameState === GameState.MENU) setGameState(GameState.PLAYING);
      }
  };

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full touch-none bg-[#020205]"
      onMouseDown={handleMenuTap}
      onTouchStart={handleMenuTap}
    />
  );
};

export default memo(GameCanvas);