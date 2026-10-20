export type TetrominoType = 'I' | 'J' | 'L' | 'O' | 'S' | 'T' | 'Z';

export type Matrix = number[][]; // 0 = empty, 1-7 = tetromino colors, 8 = garbage

export interface Piece {
  type: TetrominoType;
  matrix: number[][];
  x: number;
  y: number;
  rotation: number; // 0, 1, 2, 3
}

export interface GameStats {
  score: number;
  lines: number;
  level: number;
  combos: number;
  piecesDropped: number;
  garbageSent: number;
  garbageReceived: number;
}

export interface LeaderboardEntry {
  id: number;
  player_name: string;
  score: number;
  lines: number;
  level: number;
  mode: string;
  created_at: string;
}

export type GameMode = 'solo' | 'multiplayer_quick' | 'multiplayer_room';

export type GameState = 'idle' | 'waiting' | 'countdown' | 'playing' | 'paused' | 'game_over';

export interface OpponentState {
  name: string;
  matrix: number[][];
  score: number;
  lines: number;
  level: number;
  currentPiece?: Piece | null;
  holdPiece?: TetrominoType | null;
  isReady: boolean;
  isAlive: boolean;
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
  alpha: number;
  decay: number;
  shape?: 'square' | 'circle' | 'sparkle';
}
