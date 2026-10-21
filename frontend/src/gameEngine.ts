import {
  BOARD_WIDTH,
  BUFFER_ROWS,
  TOTAL_ROWS,
  TETROMINO_SHAPES,
  TETROMINO_NAMES,
  SRS_KICKS_JLSTZ,
  SRS_KICKS_I,
  LINE_POINTS,
  calculateDynamicLevel,
  getDropInterval,
  getLockDelay,
  MAX_LOCK_RESETS,
  TETROMINO_COLORS,
} from './constants.ts';
import type { Piece, TetrominoType, GameStats, Matrix } from './types.ts';
import { sound } from './audio.ts';
import type { ParticleSystem } from './particles.ts';

// PRNG for synchronized multiplayer seeds
function mulberry32(a: number) {
  return function () {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface EngineCallbacks {
  onBoardUpdate?: () => void;
  onLinesCleared?: (count: number, isTetris: boolean) => void;
  onGarbageSent?: (count: number) => void;
  onGameOver?: (stats: GameStats) => void;
  onScoreUpdate?: (stats: GameStats) => void;
  onScreenShake?: () => void;
  onLevelUp?: (level: number, reason: 'score' | 'time') => void;
  onTimeUpdate?: (seconds: number) => void;
}

export class TetrisEngine {
  public matrix: Matrix;
  public currentPiece: Piece | null = null;
  public holdPiece: TetrominoType | null = null;
  public canHold: boolean = true;
  public nextQueue: TetrominoType[] = [];
  public stats: GameStats;

  public isGameOver: boolean = false;
  public isPaused: boolean = false;
  public startingLevel: number = 1;
  public elapsedTimeMs: number = 0;
  private lastReportedSecond: number = 0;

  private rng: () => number;
  private bag: TetrominoType[] = [];
  private dropTimer: number = 0;
  private lockTimer: number = 0;
  private lockResets: number = 0;
  private isTouchingGround: boolean = false;
  private pendingGarbage: { lines: number; hole: number }[] = [];

  private callbacks: EngineCallbacks;
  private particleSystem?: ParticleSystem;

  constructor(callbacks: EngineCallbacks = {}, particleSystem?: ParticleSystem, seed?: number, startingLevel: number = 1) {
    this.callbacks = callbacks;
    this.particleSystem = particleSystem;
    this.rng = seed !== undefined ? mulberry32(seed) : Math.random;
    this.startingLevel = startingLevel;
    this.elapsedTimeMs = 0;
    this.lastReportedSecond = 0;

    this.matrix = this.createEmptyMatrix();
    this.stats = {
      score: 0,
      lines: 0,
      level: startingLevel,
      combos: 0,
      piecesDropped: 0,
      garbageSent: 0,
      garbageReceived: 0,
    };

    this.refillBag();
    this.refillNextQueue();
    this.spawnNextPiece();
  }

  public reset(seed?: number, startingLevel: number = 1) {
    this.rng = seed !== undefined ? mulberry32(seed) : Math.random;
    this.startingLevel = startingLevel;
    this.elapsedTimeMs = 0;
    this.lastReportedSecond = 0;
    this.matrix = this.createEmptyMatrix();
    this.stats = {
      score: 0,
      lines: 0,
      level: startingLevel,
      combos: 0,
      piecesDropped: 0,
      garbageSent: 0,
      garbageReceived: 0,
    };
    this.isGameOver = false;
    this.isPaused = false;
    this.holdPiece = null;
    this.canHold = true;
    this.pendingGarbage = [];
    this.bag = [];
    this.nextQueue = [];
    this.dropTimer = 0;
    this.lockTimer = 0;
    this.lockResets = 0;
    this.isTouchingGround = false;

    this.refillBag();
    this.refillNextQueue();
    this.spawnNextPiece();
    this.callbacks.onBoardUpdate?.();
    this.callbacks.onScoreUpdate?.(this.stats);
  }

  private createEmptyMatrix(): Matrix {
    const m: Matrix = [];
    for (let r = 0; r < TOTAL_ROWS; r++) {
      m.push(new Array(BOARD_WIDTH).fill(0));
    }
    return m;
  }

  private refillBag() {
    const pieces: TetrominoType[] = ['I', 'J', 'L', 'O', 'S', 'T', 'Z'];
    // Fisher-Yates shuffle with rng
    for (let i = pieces.length - 1; i > 0; i--) {
      const j = Math.floor(this.rng() * (i + 1));
      [pieces[i], pieces[j]] = [pieces[j], pieces[i]];
    }
    this.bag.push(...pieces);
  }

  public pieceFetcher?: (count: number) => Promise<TetrominoType[]>;
  private isFetchingPieces: boolean = false;

  private async fetchPiecesFromBackend() {
    if (!this.pieceFetcher || this.isFetchingPieces) return;
    this.isFetchingPieces = true;
    try {
      const needed = Math.max(1, 5 - this.nextQueue.length);
      const pieces = await this.pieceFetcher(needed);
      if (pieces && pieces.length > 0) {
        this.nextQueue.push(...pieces);
        this.callbacks.onBoardUpdate?.();
      }
    } catch {
      // Fallback handled by local bag
    } finally {
      this.isFetchingPieces = false;
    }
  }

  private refillNextQueue() {
    if (this.pieceFetcher && this.nextQueue.length < 6) {
      this.fetchPiecesFromBackend();
    }
    while (this.nextQueue.length < 5) {
      if (this.bag.length === 0) {
        this.refillBag();
      }
      this.nextQueue.push(this.bag.shift()!);
    }
  }

  private rotateMatrix(matrix: number[][], dir: 1 | -1): number[][] {
    const N = matrix.length;
    const result: number[][] = [];
    for (let r = 0; r < N; r++) {
      result.push(new Array(N).fill(0));
    }

    if (dir === 1) {
      // Clockwise
      for (let r = 0; r < N; r++) {
        for (let c = 0; c < N; c++) {
          result[c][N - 1 - r] = matrix[r][c];
        }
      }
    } else {
      // Counter-clockwise
      for (let r = 0; r < N; r++) {
        for (let c = 0; c < N; c++) {
          result[N - 1 - c][r] = matrix[r][c];
        }
      }
    }
    return result;
  }

  public spawnNextPiece() {
    this.refillNextQueue();
    const type = this.nextQueue.shift()!;
    this.refillNextQueue();

    const shape = TETROMINO_SHAPES[type];
    const initialX = Math.floor((BOARD_WIDTH - shape[0].length) / 2);
    const initialY = type === 'I' ? 0 : 1;

    this.currentPiece = {
      type,
      matrix: shape.map((row) => [...row]),
      x: initialX,
      y: initialY,
      rotation: 0,
    };

    this.canHold = true;
    this.lockTimer = 0;
    this.lockResets = 0;
    this.isTouchingGround = false;

    // Check collision on spawn (Top out game over)
    if (this.checkCollision(this.currentPiece.matrix, this.currentPiece.x, this.currentPiece.y)) {
      this.isGameOver = true;
      sound.playGameOver();
      this.callbacks.onGameOver?.(this.stats);
    }
  }

  public checkCollision(matrix: number[][], posX: number, posY: number): boolean {
    for (let r = 0; r < matrix.length; r++) {
      for (let c = 0; c < matrix[r].length; c++) {
        if (matrix[r][c] !== 0) {
          const boardX = posX + c;
          const boardY = posY + r;

          // Out of horizontal bounds
          if (boardX < 0 || boardX >= BOARD_WIDTH) {
            return true;
          }
          // Out of bottom bounds
          if (boardY >= TOTAL_ROWS) {
            return true;
          }
          // Colliding with locked block
          if (boardY >= 0 && this.matrix[boardY][boardX] !== 0) {
            return true;
          }
        }
      }
    }
    return false;
  }

  public moveLeft(): boolean {
    if (this.isGameOver || this.isPaused || !this.currentPiece) return false;
    if (!this.checkCollision(this.currentPiece.matrix, this.currentPiece.x - 1, this.currentPiece.y)) {
      this.currentPiece.x--;
      this.resetLockDelayIfTouching();
      sound.playMove();
      this.callbacks.onBoardUpdate?.();
      return true;
    }
    return false;
  }

  public moveRight(): boolean {
    if (this.isGameOver || this.isPaused || !this.currentPiece) return false;
    if (!this.checkCollision(this.currentPiece.matrix, this.currentPiece.x + 1, this.currentPiece.y)) {
      this.currentPiece.x++;
      this.resetLockDelayIfTouching();
      sound.playMove();
      this.callbacks.onBoardUpdate?.();
      return true;
    }
    return false;
  }

  public rotate(dir: 1 | -1): boolean {
    if (this.isGameOver || this.isPaused || !this.currentPiece) return false;
    if (this.currentPiece.type === 'O') return false; // O doesn't rotate

    const piece = this.currentPiece;
    const oldRot = piece.rotation;
    const newRot = (oldRot + dir + 4) % 4;
    const rotated = this.rotateMatrix(piece.matrix, dir);

    // Look up SRS kicks
    const key = `${oldRot}->${newRot}`;
    const kicks = piece.type === 'I' ? SRS_KICKS_I[key] : SRS_KICKS_JLSTZ[key];

    if (kicks) {
      for (const [kx, ky] of kicks) {
        // In Tetris guideline, +ky is UP, so in canvas row indices, we subtract ky
        const targetX = piece.x + kx;
        const targetY = piece.y - ky;

        if (!this.checkCollision(rotated, targetX, targetY)) {
          piece.matrix = rotated;
          piece.x = targetX;
          piece.y = targetY;
          piece.rotation = newRot;
          this.resetLockDelayIfTouching();
          sound.playRotate();
          this.callbacks.onBoardUpdate?.();
          return true;
        }
      }
    }

    return false;
  }

  public softDrop(): boolean {
    if (this.isGameOver || this.isPaused || !this.currentPiece) return false;
    if (!this.checkCollision(this.currentPiece.matrix, this.currentPiece.x, this.currentPiece.y + 1)) {
      this.currentPiece.y++;
      this.stats.score += 1;
      this.dropTimer = 0;
      sound.playDrop();
      this.checkDynamicDifficulty();
      this.callbacks.onScoreUpdate?.(this.stats);
      this.callbacks.onBoardUpdate?.();
      return true;
    } else {
      this.isTouchingGround = true;
      return false;
    }
  }

  public hardDrop() {
    if (this.isGameOver || this.isPaused || !this.currentPiece) return;

    let dropDist = 0;
    while (!this.checkCollision(this.currentPiece.matrix, this.currentPiece.x, this.currentPiece.y + 1)) {
      this.currentPiece.y++;
      dropDist++;
    }

    this.stats.score += dropDist * 2;
    sound.playHardDrop();
    this.checkDynamicDifficulty();

    if (this.particleSystem && this.currentPiece) {
      const col = TETROMINO_NAMES[this.currentPiece.type];
      const colorInfo = TETROMINO_COLORS[col];
      this.particleSystem.createHardDropImpact(
        this.currentPiece.x,
        this.currentPiece.y - BUFFER_ROWS,
        this.currentPiece.matrix[0].length,
        colorInfo.fill,
        30
      );
    }

    this.lockPiece();
    this.callbacks.onScoreUpdate?.(this.stats);
    this.callbacks.onBoardUpdate?.();
  }

  public hold() {
    if (this.isGameOver || this.isPaused || !this.currentPiece || !this.canHold) return;

    sound.playHold();
    const currentType = this.currentPiece.type;

    if (this.holdPiece === null) {
      this.holdPiece = currentType;
      this.spawnNextPiece();
    } else {
      const temp = this.holdPiece;
      this.holdPiece = currentType;

      const shape = TETROMINO_SHAPES[temp];
      const initialX = Math.floor((BOARD_WIDTH - shape[0].length) / 2);
      const initialY = temp === 'I' ? 0 : 1;

      this.currentPiece = {
        type: temp,
        matrix: shape.map((r) => [...r]),
        x: initialX,
        y: initialY,
        rotation: 0,
      };
    }

    this.canHold = false;
    this.lockTimer = 0;
    this.lockResets = 0;
    this.isTouchingGround = false;
    this.callbacks.onBoardUpdate?.();
  }

  public getGhostY(): number {
    if (!this.currentPiece) return 0;
    let ghostY = this.currentPiece.y;
    while (!this.checkCollision(this.currentPiece.matrix, this.currentPiece.x, ghostY + 1)) {
      ghostY++;
    }
    return ghostY;
  }

  private resetLockDelayIfTouching() {
    if (this.currentPiece && this.checkCollision(this.currentPiece.matrix, this.currentPiece.x, this.currentPiece.y + 1)) {
      this.isTouchingGround = true;
      if (this.lockResets < MAX_LOCK_RESETS) {
        this.lockTimer = 0;
        this.lockResets++;
      }
    } else {
      this.isTouchingGround = false;
    }
  }

  private lockPiece() {
    if (!this.currentPiece) return;

    const { matrix: pMat, x: px, y: py } = this.currentPiece;

    for (let r = 0; r < pMat.length; r++) {
      for (let c = 0; c < pMat[r].length; c++) {
        if (pMat[r][c] !== 0) {
          const boardX = px + c;
          const boardY = py + r;
          if (boardY >= 0 && boardY < TOTAL_ROWS && boardX >= 0 && boardX < BOARD_WIDTH) {
            this.matrix[boardY][boardX] = pMat[r][c];
          }
        }
      }
    }

    this.stats.piecesDropped++;
    this.clearLines();
    this.applyPendingGarbage();
    this.spawnNextPiece();
  }

  private clearLines() {
    let linesCleared = 0;
    const clearedIndices: number[] = [];

    for (let r = TOTAL_ROWS - 1; r >= 0; r--) {
      const isFull = this.matrix[r].every((cell) => cell !== 0);
      if (isFull) {
        linesCleared++;
        clearedIndices.push(r);
      }
    }

    if (linesCleared > 0) {
      // Particles on cleared rows
      if (this.particleSystem) {
        clearedIndices.forEach((rowIdx) => {
          this.particleSystem!.createLineClearBurst(
            rowIdx - BUFFER_ROWS,
            BOARD_WIDTH,
            linesCleared >= 4 ? '#00f5d4' : '#ffea00',
            BOARD_WIDTH * 30,
            30
          );
        });
      }

      // Remove cleared rows first (clearedIndices is already in descending order
      // from the bottom-to-top scan, so splicing highest index first keeps lower indices valid)
      for (const rowIdx of clearedIndices) {
        this.matrix.splice(rowIdx, 1);
      }
      // Then bulk-add empty rows on top
      for (let i = 0; i < linesCleared; i++) {
        this.matrix.unshift(new Array(BOARD_WIDTH).fill(0));
      }

      // Scoring
      const isTetris = linesCleared >= 4;
      const basePoints = LINE_POINTS[linesCleared] || 800;
      this.stats.combos++;
      const comboBonus = (this.stats.combos - 1) * 50 * this.stats.level;
      this.stats.score += basePoints * this.stats.level + comboBonus;
      this.stats.lines += linesCleared;

      // Dynamic difficulty escalation based on Score OR Time
      this.checkDynamicDifficulty();

      // Sound & Callbacks
      sound.playLineClear(linesCleared);
      if (isTetris) {
        this.callbacks.onScreenShake?.();
      }

      this.callbacks.onLinesCleared?.(linesCleared, isTetris);
      this.callbacks.onScoreUpdate?.(this.stats);
    } else {
      this.stats.combos = 0;
    }
  }

  private checkDynamicDifficulty() {
    const elapsedSeconds = Math.floor(this.elapsedTimeMs / 1000);
    const { level: targetLevel, reason } = calculateDynamicLevel(this.stats.score, elapsedSeconds);
    if (targetLevel > this.stats.level) {
      this.stats.level = targetLevel;
      sound.playLevelUp();
      this.callbacks.onLevelUp?.(targetLevel, reason);
      this.callbacks.onScoreUpdate?.(this.stats);
    }
  }

  public queueGarbage(lines: number, hole: number) {
    this.pendingGarbage.push({ lines, hole });
    this.stats.garbageReceived += lines;
    sound.playGarbageAttack();
  }

  public getPendingGarbageCount(): number {
    return this.pendingGarbage.reduce((sum, g) => sum + g.lines, 0);
  }

  private applyPendingGarbage() {
    if (this.pendingGarbage.length === 0) return;

    while (this.pendingGarbage.length > 0) {
      const { lines, hole } = this.pendingGarbage.shift()!;
      for (let i = 0; i < lines; i++) {
        // Shift top row out
        this.matrix.shift();
        // Create garbage row: 8 everywhere except hole
        const garbageRow = new Array(BOARD_WIDTH).fill(8);
        garbageRow[Math.max(0, Math.min(BOARD_WIDTH - 1, hole))] = 0;
        this.matrix.push(garbageRow);
      }
    }
  }

  public update(deltaTimeMs: number) {
    if (this.isGameOver || this.isPaused || !this.currentPiece) return;

    this.elapsedTimeMs += deltaTimeMs;
    const elapsedSeconds = Math.floor(this.elapsedTimeMs / 1000);

    // Notify HUD every second of survival
    if (elapsedSeconds !== this.lastReportedSecond) {
      this.lastReportedSecond = elapsedSeconds;
      this.callbacks.onTimeUpdate?.(elapsedSeconds);

      // Check dynamic difficulty escalation every second based on Score OR Time
      this.checkDynamicDifficulty();
    }

    this.dropTimer += deltaTimeMs;
    const interval = getDropInterval(this.stats.level);

    if (this.dropTimer >= interval) {
      this.dropTimer = 0;
      if (!this.checkCollision(this.currentPiece.matrix, this.currentPiece.x, this.currentPiece.y + 1)) {
        this.currentPiece.y++;
        this.isTouchingGround = false;
        this.callbacks.onBoardUpdate?.();
      } else {
        this.isTouchingGround = true;
      }
    }

    // Dynamic lock delay that tightens as difficulty increases
    if (this.isTouchingGround) {
      this.lockTimer += deltaTimeMs;
      const currentLockDelay = getLockDelay(this.stats.level);
      if (this.lockTimer >= currentLockDelay) {
        this.lockPiece();
        this.callbacks.onBoardUpdate?.();
      }
    }
  }

  public getVisibleMatrix(): Matrix {
    // Return rows 2 to 21 (visible 20 rows)
    return this.matrix.slice(BUFFER_ROWS);
  }
}
