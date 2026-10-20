import type { Particle } from './types.ts';

export class ParticleSystem {
  private particles: Particle[] = [];

  public createLineClearBurst(y: number, blockCount: number, color: string, canvasWidth: number, blockSize: number) {
    const count = blockCount * 6;
    for (let i = 0; i < count; i++) {
      const px = Math.random() * canvasWidth;
      const py = y * blockSize + Math.random() * blockSize;
      const speed = 1.5 + Math.random() * 5;
      const angle = Math.random() * Math.PI * 2;

      this.particles.push({
        x: px,
        y: py,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 1.2,
        size: 3 + Math.random() * 4,
        color: color,
        alpha: 1,
        decay: 0.02 + Math.random() * 0.03,
        shape: Math.random() > 0.5 ? 'sparkle' : 'square',
      });
    }
  }

  public createHardDropImpact(x: number, y: number, width: number, color: string, blockSize: number) {
    const count = 12;
    for (let i = 0; i < count; i++) {
      const px = x * blockSize + Math.random() * (width * blockSize);
      const py = y * blockSize + blockSize;
      const speed = 1 + Math.random() * 3.5;
      const angle = Math.PI + (Math.random() - 0.5) * Math.PI * 0.8; // spray upwards

      this.particles.push({
        x: px,
        y: py,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        size: 2 + Math.random() * 3,
        color: color,
        alpha: 0.9,
        decay: 0.03 + Math.random() * 0.04,
        shape: 'circle',
      });
    }
  }

  public update() {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.08; // gravity
      p.alpha -= p.decay;

      if (p.alpha <= 0) {
        this.particles.splice(i, 1);
      }
    }
  }

  public draw(ctx: CanvasRenderingContext2D) {
    ctx.save();
    for (const p of this.particles) {
      ctx.globalAlpha = Math.max(0, p.alpha);
      ctx.fillStyle = p.color;
      ctx.shadowBlur = 8;
      ctx.shadowColor = p.color;

      if (p.shape === 'circle') {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size / 2, 0, Math.PI * 2);
        ctx.fill();
      } else if (p.shape === 'sparkle') {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.alpha * 5);
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
        ctx.restore();
      } else {
        ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
      }
    }
    ctx.restore();
  }

  public clear() {
    this.particles = [];
  }
}
