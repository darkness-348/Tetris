import {
  BOARD_WIDTH,
  BOARD_HEIGHT,
  BUFFER_ROWS,
  BLOCK_SIZE,
  MINI_BLOCK_SIZE,
  TETROMINO_COLORS,
  TETROMINO_SHAPES,
} from './constants.ts';
import type { Piece, TetrominoType, Matrix } from './types.ts';
import type { ParticleSystem } from './particles.ts';

export class CanvasRenderer {
  private mainCtx: CanvasRenderingContext2D;
  private holdCtx: CanvasRenderingContext2D;
  private nextCtx: CanvasRenderingContext2D;
  private oppCtx?: CanvasRenderingContext2D;

  constructor(
    mainCanvas: HTMLCanvasElement,
    holdCanvas: HTMLCanvasElement,
    nextCanvas: HTMLCanvasElement,
    oppCanvas?: HTMLCanvasElement
  ) {
    this.mainCtx = mainCanvas.getContext('2d')!;
    this.holdCtx = holdCanvas.getContext('2d')!;
    this.nextCtx = nextCanvas.getContext('2d')!;
    if (oppCanvas) {
      this.oppCtx = oppCanvas.getContext('2d')!;
    }

    mainCanvas.width = BOARD_WIDTH * BLOCK_SIZE;
    mainCanvas.height = BOARD_HEIGHT * BLOCK_SIZE;

    holdCanvas.width = 4 * BLOCK_SIZE;
    holdCanvas.height = 4 * BLOCK_SIZE;

    nextCanvas.width = 4 * BLOCK_SIZE;
    nextCanvas.height = 10 * BLOCK_SIZE;

    if (oppCanvas) {
      oppCanvas.width = BOARD_WIDTH * MINI_BLOCK_SIZE;
      oppCanvas.height = BOARD_HEIGHT * MINI_BLOCK_SIZE;
    }
  }

  // Draw a single block with glossy neon arcade style
  private drawBlock(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    colorId: number,
    size: number = BLOCK_SIZE,
    isGhost: boolean = false
  ) {
    if (colorId === 0) return;
    const color = TETROMINO_COLORS[colorId] || TETROMINO_COLORS[1];

    ctx.save();
    if (isGhost) {
      ctx.globalAlpha = 0.28;
      ctx.strokeStyle = color.fill;
      ctx.lineWidth = 2;
      ctx.strokeRect(x * size + 2, y * size + 2, size - 4, size - 4);
      ctx.fillStyle = color.glow;
      ctx.fillRect(x * size + 3, y * size + 3, size - 6, size - 6);
    } else {
      // Base fill
      ctx.fillStyle = color.fill;
      ctx.shadowColor = color.glow;
      ctx.shadowBlur = 6;
      ctx.fillRect(x * size + 1, y * size + 1, size - 2, size - 2);

      // Top-left highlight bevel
      ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
      ctx.beginPath();
      ctx.moveTo(x * size + 1, y * size + 1);
      ctx.lineTo(x * size + size - 1, y * size + 1);
      ctx.lineTo(x * size + size - 4, y * size + 4);
      ctx.lineTo(x * size + 4, y * size + 4);
      ctx.lineTo(x * size + 4, y * size + size - 4);
      ctx.lineTo(x * size + 1, y * size + size - 1);
      ctx.closePath();
      ctx.fill();

      // Bottom-right shadow bevel
      ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
      ctx.beginPath();
      ctx.moveTo(x * size + size - 1, y * size + 1);
      ctx.lineTo(x * size + size - 1, y * size + size - 1);
      ctx.lineTo(x * size + 1, y * size + size - 1);
      ctx.lineTo(x * size + 4, y * size + size - 4);
      ctx.lineTo(x * size + size - 4, y * size + size - 4);
      ctx.lineTo(x * size + size - 4, y * size + 4);
      ctx.closePath();
      ctx.fill();

      // Inner center jewel
      ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
      ctx.fillRect(x * size + 6, y * size + 6, size - 12, size - 12);
    }
    ctx.restore();
  }

  // Draw cyber grid background
  private drawGrid(ctx: CanvasRenderingContext2D, width: number, height: number, size: number) {
    ctx.save();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.04)';
    ctx.lineWidth = 1;

    for (let x = 0; x <= width; x++) {
      ctx.beginPath();
      ctx.moveTo(x * size, 0);
      ctx.lineTo(x * size, height * size);
      ctx.stroke();
    }
    for (let y = 0; y <= height; y++) {
      ctx.beginPath();
      ctx.moveTo(0, y * size);
      ctx.lineTo(width * size, y * size);
      ctx.stroke();
    }
    ctx.restore();
  }

  public renderMainBoard(
    matrix: Matrix,
    currentPiece: Piece | null,
    ghostY: number,
    particles?: ParticleSystem,
    shakeOffset: { x: number; y: number } = { x: 0, y: 0 }
  ) {
    const ctx = this.mainCtx;
    const w = ctx.canvas.width;
    const h = ctx.canvas.height;

    ctx.save();
    ctx.clearRect(0, 0, w, h);
    ctx.translate(shakeOffset.x, shakeOffset.y);

    // Dark grid background
    ctx.fillStyle = '#0c0e1a';
    ctx.fillRect(0, 0, w, h);
    this.drawGrid(ctx, BOARD_WIDTH, BOARD_HEIGHT, BLOCK_SIZE);

    // Draw locked blocks (visible rows BUFFER_ROWS to TOTAL_ROWS - 1)
    for (let r = BUFFER_ROWS; r < matrix.length; r++) {
      const renderY = r - BUFFER_ROWS;
      for (let c = 0; c < BOARD_WIDTH; c++) {
        const val = matrix[r][c];
        if (val !== 0) {
          this.drawBlock(ctx, c, renderY, val, BLOCK_SIZE);
        }
      }
    }

    if (currentPiece) {
      // Draw Ghost Piece
      const pMat = currentPiece.matrix;
      const ghostRenderY = ghostY - BUFFER_ROWS;
      for (let r = 0; r < pMat.length; r++) {
        for (let c = 0; c < pMat[r].length; c++) {
          if (pMat[r][c] !== 0) {
            const gy = ghostRenderY + r;
            if (gy >= 0 && gy < BOARD_HEIGHT) {
              this.drawBlock(ctx, currentPiece.x + c, gy, pMat[r][c], BLOCK_SIZE, true);
            }
          }
        }
      }

      // Draw Active Piece
      const pieceRenderY = currentPiece.y - BUFFER_ROWS;
      for (let r = 0; r < pMat.length; r++) {
        for (let c = 0; c < pMat[r].length; c++) {
          if (pMat[r][c] !== 0) {
            const py = pieceRenderY + r;
            if (py >= 0 && py < BOARD_HEIGHT) {
              this.drawBlock(ctx, currentPiece.x + c, py, pMat[r][c], BLOCK_SIZE, false);
            }
          }
        }
      }
    }

    // Render particles on top
    if (particles) {
      particles.draw(ctx);
    }

    ctx.restore();
  }

  public renderHold(pieceType: TetrominoType | null, canHold: boolean) {
    const ctx = this.holdCtx;
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);

    ctx.fillStyle = '#0c0e1a';
    ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);

    if (!pieceType) return;

    const shape = TETROMINO_SHAPES[pieceType];
    const colorId = shape.find((row) => row.some((c) => c !== 0))?.find((c) => c !== 0) || 1;

    const rows = shape.length;
    const cols = shape[0].length;
    const size = 24;
    const offsetX = (ctx.canvas.width - cols * size) / 2;
    const offsetY = (ctx.canvas.height - rows * size) / 2;

    ctx.save();
    if (!canHold) {
      ctx.globalAlpha = 0.4;
    }
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (shape[r][c] !== 0) {
          this.drawBlock(ctx, (offsetX + c * size) / size, (offsetY + r * size) / size, colorId, size);
        }
      }
    }
    ctx.restore();
  }

  public renderNextQueue(queue: TetrominoType[]) {
    const ctx = this.nextCtx;
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);

    ctx.fillStyle = '#0c0e1a';
    ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);

    const size = 20;
    const shown = queue.slice(0, 4);

    shown.forEach((pieceType, index) => {
      const shape = TETROMINO_SHAPES[pieceType];
      const colorId = shape.find((row) => row.some((c) => c !== 0))?.find((c) => c !== 0) || 1;

      const rows = shape.length;
      const cols = shape[0].length;
      const slotHeight = ctx.canvas.height / 4;
      const offsetX = (ctx.canvas.width - cols * size) / 2;
      const offsetY = index * slotHeight + (slotHeight - rows * size) / 2;

      ctx.save();
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          if (shape[r][c] !== 0) {
            this.drawBlock(ctx, (offsetX + c * size) / size, (offsetY + r * size) / size, colorId, size);
          }
        }
      }
      ctx.restore();
    });
  }

  public renderOpponentBoard(matrix: Matrix | null, currentPiece?: Piece | null) {
    if (!this.oppCtx) return;
    const ctx = this.oppCtx;
    const w = ctx.canvas.width;
    const h = ctx.canvas.height;

    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#0a0c16';
    ctx.fillRect(0, 0, w, h);
    this.drawGrid(ctx, BOARD_WIDTH, BOARD_HEIGHT, MINI_BLOCK_SIZE);

    if (!matrix || matrix.length === 0) {
      // Waiting placeholder
      ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
      ctx.font = '12px Outfit, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('ESPERANDO', w / 2, h / 2 - 10);
      ctx.fillText('RIVAL...', w / 2, h / 2 + 10);
      return;
    }

    // Render matrix blocks
    for (let r = BUFFER_ROWS; r < matrix.length; r++) {
      const renderY = r - BUFFER_ROWS;
      for (let c = 0; c < BOARD_WIDTH; c++) {
        const val = matrix[r][c];
        if (val !== 0) {
          this.drawBlock(ctx, c, renderY, val, MINI_BLOCK_SIZE);
        }
      }
    }

    // Render opponent active piece
    if (currentPiece) {
      const pMat = currentPiece.matrix;
      const pieceRenderY = currentPiece.y - BUFFER_ROWS;
      for (let r = 0; r < pMat.length; r++) {
        for (let c = 0; c < pMat[r].length; c++) {
          if (pMat[r][c] !== 0) {
            const py = pieceRenderY + r;
            if (py >= 0 && py < BOARD_HEIGHT) {
              this.drawBlock(ctx, currentPiece.x + c, py, pMat[r][c], MINI_BLOCK_SIZE, false);
            }
          }
        }
      }
    }
  }
}
