import type { TetrominoType } from './types.ts';

export const BOARD_WIDTH = 10;
export const BOARD_HEIGHT = 20;
export const BUFFER_ROWS = 2; // Hidden top rows for spawning
export const TOTAL_ROWS = BOARD_HEIGHT + BUFFER_ROWS;

export const BLOCK_SIZE = 30; // pixels for main board
export const MINI_BLOCK_SIZE = 16; // pixels for opponent board and previews

// Piece color palette - Neon Cyberpunk
export const TETROMINO_COLORS: Record<number, { fill: string; border: string; glow: string; shadow: string }> = {
  0: { fill: 'transparent', border: 'transparent', glow: 'transparent', shadow: 'transparent' },
  1: { fill: '#00f5d4', border: '#70fff0', glow: 'rgba(0, 245, 212, 0.7)', shadow: '#009e86' }, // I - Cyan
  2: { fill: '#3a86ff', border: '#7eb1ff', glow: 'rgba(58, 134, 255, 0.7)', shadow: '#1c4fad' }, // J - Blue
  3: { fill: '#ff9e00', border: '#ffc566', glow: 'rgba(255, 158, 0, 0.7)', shadow: '#b36b00' }, // L - Orange
  4: { fill: '#ffea00', border: '#fff570', glow: 'rgba(255, 234, 0, 0.7)', shadow: '#b8a700' }, // O - Yellow
  5: { fill: '#06d6a0', border: '#60f3cb', glow: 'rgba(6, 214, 160, 0.7)', shadow: '#038c67' }, // S - Green
  6: { fill: '#b5179e', border: '#f72585', glow: 'rgba(181, 23, 158, 0.7)', shadow: '#7209b7' }, // T - Purple/Magenta
  7: { fill: '#ff0054', border: '#ff6699', glow: 'rgba(255, 0, 84, 0.7)', shadow: '#b3003b' },  // Z - Red
  8: { fill: '#4a5568', border: '#718096', glow: 'rgba(229, 62, 62, 0.8)', shadow: '#2d3748' }, // Garbage - Steel Gray with Red Warning
};

export const TETROMINO_NAMES: Record<TetrominoType, number> = {
  I: 1,
  J: 2,
  L: 3,
  O: 4,
  S: 5,
  T: 6,
  Z: 7,
};

export const NUMBER_TO_TYPE: Record<number, TetrominoType> = {
  1: 'I',
  2: 'J',
  3: 'L',
  4: 'O',
  5: 'S',
  6: 'T',
  7: 'Z',
};

// Tetromino base shapes (4x4 or 3x3 or 2x2)
export const TETROMINO_SHAPES: Record<TetrominoType, number[][]> = {
  I: [
    [0, 0, 0, 0],
    [1, 1, 1, 1],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
  ],
  J: [
    [2, 0, 0],
    [2, 2, 2],
    [0, 0, 0],
  ],
  L: [
    [0, 0, 3],
    [3, 3, 3],
    [0, 0, 0],
  ],
  O: [
    [4, 4],
    [4, 4],
  ],
  S: [
    [0, 5, 5],
    [5, 5, 0],
    [0, 0, 0],
  ],
  T: [
    [0, 6, 0],
    [6, 6, 6],
    [0, 0, 0],
  ],
  Z: [
    [7, 7, 0],
    [0, 7, 7],
    [0, 0, 0],
  ],
};

// Standard SRS (Super Rotation System) kick tables
// Format: [x, y] offsets where positive y is UP in Tetris guideline (so -y in canvas coordinates)
export const SRS_KICKS_JLSTZ: Record<string, [number, number][]> = {
  '0->1': [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
  '1->0': [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
  '1->2': [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
  '2->1': [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
  '2->3': [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
  '3->2': [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
  '3->0': [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
  '0->3': [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
};

export const SRS_KICKS_I: Record<string, [number, number][]> = {
  '0->1': [[0, 0], [-2, 0], [1, 0], [-2, -1], [1, 2]],
  '1->0': [[0, 0], [2, 0], [-1, 0], [2, 1], [-1, -2]],
  '1->2': [[0, 0], [-1, 0], [2, 0], [-1, 2], [2, -1]],
  '2->1': [[0, 0], [1, 0], [-2, 0], [1, -2], [-2, 1]],
  '2->3': [[0, 0], [2, 0], [-1, 0], [2, 1], [-1, -2]],
  '3->2': [[0, 0], [-2, 0], [1, 0], [-2, -1], [1, 2]],
  '3->0': [[0, 0], [1, 0], [-2, 0], [1, -2], [-2, 1]],
  '0->3': [[0, 0], [-1, 0], [2, 0], [-1, 2], [2, -1]],
};

// Points per lines cleared
export const LINE_POINTS = [0, 100, 300, 500, 800];

// Calculate difficulty level based on Score OR Time survived
export function calculateDynamicLevel(score: number, elapsedSeconds: number): { level: number; reason: 'score' | 'time' } {
  // Score-based level: Level 1 at 0pts, Level 2 at ~700pts, Level 3 at ~1600pts, Level 5 at ~5600pts, Level 10 at ~31500pts
  const scoreLevel = Math.max(1, Math.floor(Math.sqrt(score / 350)) + 1);

  // Time-based level: Every 20 seconds of survival adds +1 level (e.g. 20s = Lvl 2, 40s = Lvl 3, 60s = Lvl 4...)
  const timeLevel = Math.max(1, Math.floor(elapsedSeconds / 20) + 1);

  if (scoreLevel >= timeLevel) {
    return { level: scoreLevel, reason: 'score' };
  } else {
    return { level: timeLevel, reason: 'time' };
  }
}

// Fall speed (ms per cell) based on calculated level
export function getDropInterval(level: number): number {
  const baseInterval = 850 * Math.pow(0.83, level - 1);
  return Math.max(65, Math.floor(baseInterval));
}

// Lock delay slightly tightens at higher levels
export function getLockDelay(level: number): number {
  return Math.max(220, 500 - (level - 1) * 20);
}

export const MAX_LOCK_RESETS = 15; // prevents infinite stalling
