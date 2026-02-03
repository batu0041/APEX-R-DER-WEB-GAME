// Linear interpolation
export const lerp = (start: number, end: number, t: number): number => {
  return start * (1 - t) + end * t;
};

// Clamp a value between min and max
export const clamp = (val: number, min: number, max: number): number => {
  return Math.max(min, Math.min(max, val));
};

// Easing function for smooth animations
export const easeOutBack = (x: number): number => {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
};

export const randomRange = (min: number, max: number): number => {
  return Math.random() * (max - min) + min;
};