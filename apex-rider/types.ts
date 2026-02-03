export enum GameState {
  MENU = 'MENU',
  PLAYING = 'PLAYING',
  GAME_OVER = 'GAME_OVER'
}

export interface Point {
  x: number;
  y: number;
}

export interface TrailPoint {
  x: number; // Normalized X position (-1 to 1)
  z: number; // World Z position
  alpha: number; // Opacity for fade out
}

export interface FloatingText {
  id: number;
  text: string;
  x: number;
  y: number;
  life: number; // 0 to 1
  color: string;
  scale: number;
}

export interface Particle {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  color: string;
  size: number;
}

export interface RoadSegment {
  z: number;       
  curve: number;   // -1 (Left) to 1 (Right)
  color?: string;  // Special colors for apexes
}

export interface ApexPoint {
  z: number;
  direction: number; // 1 (Right) or -1 (Left) - The direction we need to lean INTO
  hit: boolean;      // Has the player successfully hit this apex?
  scored?: boolean;  // Has this turn been counted for score?
}

export type TimingRating = 'PERFECT' | 'GOOD' | 'OK' | 'MISS';