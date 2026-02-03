export const SCREEN_WIDTH = window.innerWidth;
export const SCREEN_HEIGHT = window.innerHeight;

export const GAME_CONFIG = {
  // Speed settings (Units per second)
  BASE_SPEED: 1500,  
  MAX_SPEED: 9500,   
  ACCELERATION: 2500, 
  BRAKING: 8000,
  
  ROAD_WIDTH: 2200, 
  LANE_WIDTH: 1000,
  
  // Physics
  STEER_SENSITIVITY: 5.0, 
  CURVE_SENSITIVITY: 0.7, 
  LEAN_SMOOTHING: 12.0,
  
  // World - Optimized for Mobile Performance
  SEGMENT_LENGTH: 100,
  VISIBLE_SEGMENTS: 200, 
  CAMERA_HEIGHT: 1500,   
  CAMERA_DEPTH: 0.8,   
  
  // Boundaries & Collision
  OFF_ROAD_LIMIT: 1.0,          // Where the pavement ends
  // REBUILT COLLIDER: Increased from 1.6 to 1.75 to match the visual mesh of the barrier exactly.
  // This prevents the "Invisible Wall" feeling.
  COLLISION_THRESHOLD: 1.75,     
  CRASH_BUFFER: 0,              // Set to 0 for precise "Mesh-on-Mesh" collision.
  
  SAFE_SPEED_THRESHOLD: 3000,   
  OFF_ROAD_FRICTION: 6000,      
  
  // Timing Windows
  PERFECT_WINDOW: 800, 
  GOOD_WINDOW: 1500,
  
  // Colors
  COLOR_BACKGROUND: '#050510', 
  COLOR_ROAD: '#111118',       
  COLOR_ROAD_EDGE: '#0ea5e9',  
  COLOR_APEX_EDGE: '#fcd34d', 
  COLOR_LANE_MARKER: 'rgba(255, 255, 255, 0.4)', 
  COLOR_GRID: '#a21caf',       
  COLOR_GRID_FAR: '#1e1b4b',
  COLOR_SHOULDER_DARK: '#3f2212', 
  COLOR_SHOULDER_LIGHT: '#552e15', 

  COLOR_PLAYER_BODY: '#0a0a0a',
  COLOR_PLAYER_ACCENT: '#ef4444', 
  
  COLOR_PERFECT: '#fcd34d', 
  COLOR_GOOD: '#4ade80',    
  COLOR_MISS: '#f43f5e',    
};