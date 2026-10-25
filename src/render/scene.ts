import { COUNTER, DAY_LENGTH, ROOM, TABLE_SPOTS } from '../core/config';
import { tableCount } from '../core/engine';
import type { Customer, GameState, Vec } from '../core/types';

const WALL_H = 3;
const SHIRTS = ['#C4553B', '#4E7A5A', '#5B7FA6', '#D9A066', '#8A6A9E', '#B5644D', '#3F6B72', '#A67C52'];
const SKINS = ['#F2C9A0', '#E0AC7E', '#C98D63', '#8D5B3C', '#F6D7B4', '#A9714B'];
const HAIRS = ['#3B2A20', '#5B3A24', '#2C2320', '#7A5230', '#4A3728', '#241C18'];

interface Cam {
  unit: number;
  tw: number;
  th: number;
  ox: number;
  oy: number;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  color: string;
  kind: 'coin' | 'dust';
}

interface FloatText {
  x: number;
  y: number;
  life: number;
  max: number;
  text: string;
}

interface Hit {
  id: number;
  x: number;
  y: number;
  r: number;
  ready: boolean;
}

export class Scene {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private W = 1;
  private H = 1;
  private dpr = 1;
  private cam: Cam = { unit: 1, tw: 88, th: 44, ox: 0, oy: 0 };
  private time = 0;
  private particles: Particle[] = [];
  private texts: FloatText[] = [];
  private hits: Hit[] = [];
  private reduced = false;
  private state: GameState | null = null;

  constructor(canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Trình duyệt không hỗ trợ Canvas 2D');
    this.canvas = canvas;
    this.ctx = ctx;
    this.reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.resize();
    new ResizeObserver(() => this.resize()).observe(canvas);
    window.addEventListener('resize', () => this.resize());
    this.seedDust();
    canvas.addEventListener('pointermove', (event) => {
      const rect = canvas.getBoundingClientRect();
      const hit = this.pick(event.clientX - rect.left, event.clientY - rect.top);
      canvas.style.cursor = hit !== null && this.isReady(hit) ? 'pointer' : 'default';
    });
    canvas.addEventListener('pointerleave', () => {
      canvas.style.cursor = 'default';
    });
  }

  private isReady(id: number): boolean {
    return this.state?.customers.find((c) => c.id === id)?.phase === 'ready';
  }

  private resize(): void {
    const rect = this.canvas.getBoundingClientRect();
    this.W = Math.max(1, rect.width || this.canvas.clientWidth || 800);
    this.H = Math.max(1, rect.height || this.canvas.clientHeight || 600);
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.canvas.width = Math.round(this.W * this.dpr);
    this.canvas.height = Math.round(this.H * this.dpr);
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.computeCam();
  }

  private computeCam(): void {
    const unit = Math.max(0.52, Math.min(this.W / 760, this.H / 500, 1.42));
    const tw = 88 * unit;
    const th = 44 * unit;
    const ox = this.W / 2 - ((ROOM.w - ROOM.d) * tw) / 4;
    const oy = Math.max(
      WALL_H * th + 8 * unit,
      (this.H - ((ROOM.w + ROOM.d) * th) / 2) / 2 + 8 * unit,
    );
    this.cam = { unit, tw, th, ox, oy };
  }

  private iso(x: number, y: number, up = 0): { x: number; y: number } {
    const { tw, th, ox, oy } = this.cam;
    return { x: ox + ((x - y) * tw) / 2, y: oy + ((x + y) * th) / 2 - up * th };
  }

  private poly(points: Vec[], fill: string | CanvasGradient, stroke?: string, width = 1): void {
    const ctx = this.ctx;
    ctx.beginPath();
    points.forEach((p, index) => {
      if (index === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    });
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
    if (stroke) {
      ctx.strokeStyle = stroke;
      ctx.lineWidth = width;
      ctx.stroke();
    }
  }

  private line(a: Vec, b: Vec, color: string, width: number): void {
    const ctx = this.ctx;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.lineCap = 'round';
    ctx.stroke();
  }

  private rrect(x: number, y: number, w: number, h: number, r: number): void {
    const ctx = this.ctx;
    const rr = Math.max(0, Math.min(r, w / 2, h / 2));
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
  }

  private fillRR(
    x: number,
    y: number,
    w: number,
    h: number,
    r: number,
    fill: string,
    stroke?: string,
    width = 1,
  ): void {
    this.rrect(x, y, w, h, r);
    const ctx = this.ctx;
    ctx.fillStyle = fill;
    ctx.fill();
    if (stroke) {
      ctx.strokeStyle = stroke;
      ctx.lineWidth = width;
      ctx.stroke();
    }
  }

  private isoBox(
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    z0: number,
    z1: number,
    top: string,
    sideA: string,
    sideB: string,
    outline?: string,
  ): void {
    this.poly(
      [this.iso(x1, y0, z1), this.iso(x1, y1, z1), this.iso(x1, y1, z0), this.iso(x1, y0, z0)],
      sideA,
      outline,
      1,
    );
    this.poly(
      [this.iso(x0, y1, z1), this.iso(x1, y1, z1), this.iso(x1, y1, z0), this.iso(x0, y1, z0)],
      sideB,
      outline,
      1,
    );
    this.poly(
      [this.iso(x0, y0, z1), this.iso(x1, y0, z1), this.iso(x1, y1, z1), this.iso(x0, y1, z1)],
      top,
      outline,
      1,
    );
  }

  /* ------------------------------ Frame ------------------------------ */

  draw(state: GameState, dt: number): void {
    this.state = state;
    this.time += dt;
    this.hits = [];
    this.pullFx(state);
    this.updateParticles(dt);

    const { ctx, W, H } = this;
    ctx.clearRect(0, 0, W, H);
    this.drawBackdrop();
    this.drawFloor();
    this.drawWalls();
    this.drawWindowLight();
    this.drawShadowUnderCounter();
    this.drawStaff(3.05, 0.45, 'barista');
    this.drawCounter();

    const items: { depth: number; draw: () => void }[] = [];
    const spots = TABLE_SPOTS.slice(0, Math.min(tableCount(state), TABLE_SPOTS.length));
    spots.forEach((spot, index) => {
      const ready = state.customers.some((c) => c.table === index && c.phase === 'ready');
      items.push({ depth: spot.x + spot.y, draw: () => this.drawTable(spot, ready) });
    });
    if (state.staff.waiter > 0) {
      items.push({ depth: 7.4, draw: () => this.drawStaff(5.35, 2.25, 'waiter') });
    }
    for (const c of state.customers) {
      items.push({ depth: c.x + c.y, draw: () => this.drawCustomer(c) });
    }
    items.push({ depth: 0.6 + 0.55, draw: () => this.drawPlant(0.6, 0.55) });
    items.push({ depth: 7.25 + 0.65, draw: () => this.drawPlant(7.25, 0.65) });

    items.sort((a, b) => a.depth - b.depth);
    for (const item of items) item.draw();

    this.drawLamp(2.7, 0.9);
    this.drawParticles();
    this.drawTexts();
    this.drawAtmosphere(state);
  }

  /* ----------------------------- Cảnh nền ---------------------------- */

  private drawBackdrop(): void {
    const { ctx, W, H } = this;
    const sky = ctx.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, '#FFF9F0');
    sky.addColorStop(0.5, '#FBEDDC');
    sky.addColorStop(1, '#F2DFC6');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, H);

    const blob = (x: number, y: number, r: number, color: string) => {
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, color);
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
    };
    blob(W * 0.12, H * 0.2, Math.max(W, H) * 0.4, 'rgba(217,160,102,0.16)');
    blob(W * 0.9, H * 0.75, Math.max(W, H) * 0.38, 'rgba(78,122,90,0.12)');
    blob(W * 0.55, H * 0.05, Math.max(W, H) * 0.3, 'rgba(255,255,255,0.5)');
  }

  private drawFloor(): void {
    for (let x = 0; x < ROOM.w; x += 1) {
      for (let y = 0; y < ROOM.d; y += 1) {
        const fill = (x + y) % 2 === 0 ? '#F7E8D4' : '#F1DFC7';
        this.poly(
          [this.iso(x, y), this.iso(x + 1, y), this.iso(x + 1, y + 1), this.iso(x, y + 1)],
          fill,
          'rgba(120,90,60,0.055)',
          1,
        );
      }
    }

    // Thảm dưới khu vực bàn
    this.poly(
      [this.iso(0.9, 2.35), this.iso(7.1, 2.35), this.iso(7.1, 5.75), this.iso(0.9, 5.75)],
      'rgba(196,85,59,0.13)',
      'rgba(196,85,59,0.32)',
      2,
    );
    this.poly(
      [this.iso(1.1, 2.55), this.iso(6.9, 2.55), this.iso(6.9, 5.55), this.iso(1.1, 5.55)],
      'rgba(0,0,0,0)',
      'rgba(255,248,238,0.55)',
      1.5,
    );

    // Thảm chùi chân trước cửa
    this.poly(
      [this.iso(0.15, 1.5), this.iso(0.95, 1.5), this.iso(0.95, 2.95), this.iso(0.15, 2.95)],
      'rgba(111,78,55,0.32)',
      'rgba(74,50,38,0.25)',
      1,
    );

    this.poly(
      [this.iso(0, 0), this.iso(ROOM.w, 0), this.iso(ROOM.w, ROOM.d), this.iso(0, ROOM.d)],
      'rgba(0,0,0,0)',
      'rgba(111,78,55,0.2)',
      2,
    );
  }

  private drawWalls(): void {
    const ctx = this.ctx;
    const corner = this.iso(0, 0);

    const wallA = [
      this.iso(0, 0),
      this.iso(ROOM.w, 0),
      this.iso(ROOM.w, 0, WALL_H),
      this.iso(0, 0, WALL_H),
    ];
    const gradA = ctx.createLinearGradient(corner.x, corner.y - WALL_H * this.cam.th, corner.x, corner.y);
    gradA.addColorStop(0, '#FFF3E2');
    gradA.addColorStop(0.72, '#F6E1C8');
    gradA.addColorStop(1, '#EBD2B5');
    this.poly(wallA, gradA, 'rgba(111,78,55,0.16)', 1.5);

    const wallB = [
      this.iso(0, 0),
      this.iso(0, ROOM.d),
      this.iso(0, ROOM.d, WALL_H),
      this.iso(0, 0, WALL_H),
    ];
    const gradB = ctx.createLinearGradient(corner.x, corner.y - WALL_H * this.cam.th, corner.x, corner.y);
    gradB.addColorStop(0, '#F8E7D0');
    gradB.addColorStop(0.7, '#EFD6B8');
    gradB.addColorStop(1, '#E2C4A2');
    this.poly(wallB, gradB, 'rgba(111,78,55,0.16)', 1.5);

    // Chân tường
    for (const wall of [
      [
        this.iso(0, 0),
        this.iso(ROOM.w, 0),
        this.iso(ROOM.w, 0, 0.2),
        this.iso(0, 0, 0.2),
      ],
      [
        this.iso(0, 0),
        this.iso(0, ROOM.d),
        this.iso(0, ROOM.d, 0.2),
        this.iso(0, 0, 0.2),
      ],
    ]) {
      this.poly(wall, 'rgba(139,104,74,0.28)');
    }

    this.drawWindow();
    this.drawChalkboard();
    this.drawDoor();
    this.drawShelf();
  }

  private drawWindow(): void {
    const ctx = this.ctx;
    const x0 = 4.5;
    const x1 = 7.5;
    const z0 = 0.95;
    const z1 = 2.45;
    const glass = [
      this.iso(x0, 0, z0),
      this.iso(x1, 0, z0),
      this.iso(x1, 0, z1),
      this.iso(x0, 0, z1),
    ];
    const g = ctx.createLinearGradient(glass[3].x, glass[3].y, glass[0].x, glass[0].y);
    g.addColorStop(0, '#BFE3F2');
    g.addColorStop(0.55, '#DDF1F7');
    g.addColorStop(1, '#F4F8EF');
    this.poly(glass, g);

    // Mây và đồi phía ngoài
    const p1 = this.iso(x0 + 0.5, 0, z1 - 0.35);
    const p2 = this.iso(x0 + 1.6, 0, z1 - 0.25);
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.beginPath();
    ctx.ellipse(p1.x, p1.y, 12, 6, 0, 0, Math.PI * 2);
    ctx.ellipse(p2.x, p2.y + 2, 15, 7, 0, 0, Math.PI * 2);
    ctx.fill();
    const hill = this.iso(x0 + 2.6, 0, z0);
    ctx.fillStyle = 'rgba(143,191,155,0.55)';
    ctx.beginPath();
    ctx.ellipse(hill.x, hill.y + 2, 34, 16, 0, Math.PI, Math.PI * 2);
    ctx.fill();

    // Khung cửa
    this.poly(glass, 'rgba(0,0,0,0)', '#FFF8ED', 5);
    const mullionX = this.iso((x0 + x1) / 2, 0, z0);
    const mullionTop = this.iso((x0 + x1) / 2, 0, z1);
    this.line(mullionX, mullionTop, '#FFF8ED', 4);
    const mullionZ = this.iso(x0, 0, (z0 + z1) / 2);
    const mullionZ2 = this.iso(x1, 0, (z0 + z1) / 2);
    this.line(mullionZ, mullionZ2, '#FFF8ED', 4);

    // Bệ cửa sổ
    this.isoBox(x0 - 0.12, 0, x1 + 0.12, 0.18, z0 - 0.12, z0 - 0.02, '#FFF8ED', '#EBD8BE', '#F5E6D0');
  }

  private drawChalkboard(): void {
    const ctx = this.ctx;
    const board = [
      this.iso(0.5, 0, 1.25),
      this.iso(3.5, 0, 1.25),
      this.iso(3.5, 0, 2.55),
      this.iso(0.5, 0, 2.55),
    ];
    this.poly(board, '#4B3B32', 'rgba(255,248,237,0.5)', 3);
    this.poly(
      [
        this.iso(0.62, 0, 1.37),
        this.iso(3.38, 0, 1.37),
        this.iso(3.38, 0, 2.43),
        this.iso(0.62, 0, 2.43),
      ],
      '#3E3029',
    );

    const u = this.cam.unit;
    ctx.save();
    ctx.strokeStyle = 'rgba(255,248,237,0.75)';
    ctx.lineCap = 'round';
    const base = this.iso(0.8, 0, 2.2);
    for (let i = 0; i < 3; i += 1) {
      const y = base.y + i * 9 * u;
      const startX = base.x + i * 3 * u;
      ctx.lineWidth = (i === 0 ? 3 : 2) * u;
      ctx.beginPath();
      ctx.moveTo(startX, y);
      ctx.lineTo(startX + (i === 0 ? 34 : 44) * u, y);
      ctx.stroke();
    }
    // Biểu tượng ly cà phê nhỏ
    const cup = this.iso(2.95, 0, 2.12);
    ctx.strokeStyle = 'rgba(232,180,90,0.9)';
    ctx.lineWidth = 2 * u;
    ctx.beginPath();
    ctx.moveTo(cup.x - 6 * u, cup.y - 4 * u);
    ctx.lineTo(cup.x + 5 * u, cup.y - 4 * u);
    ctx.lineTo(cup.x + 3.5 * u, cup.y + 5 * u);
    ctx.lineTo(cup.x - 4.5 * u, cup.y + 5 * u);
    ctx.closePath();
    ctx.stroke();
    ctx.restore();
  }

  private drawDoor(): void {
    const y0 = 1.4;
    const y1 = 2.95;
    const z1 = 2.05;
    const frame = [
      this.iso(0, y0 - 0.12, 0),
      this.iso(0, y1 + 0.12, 0),
      this.iso(0, y1 + 0.12, z1 + 0.12),
      this.iso(0, y0 - 0.12, z1 + 0.12),
    ];
    this.poly(frame, '#6F4E37', 'rgba(74,50,38,0.35)', 2);

    const door = [
      this.iso(0, y0, 0),
      this.iso(0, y1, 0),
      this.iso(0, y1, z1),
      this.iso(0, y0, z1),
    ];
    const g = this.ctx.createLinearGradient(door[2].x, door[2].y, door[0].x, door[0].y);
    g.addColorStop(0, '#A9794F');
    g.addColorStop(1, '#8A5F3C');
    this.poly(door, g, 'rgba(74,50,38,0.2)', 1.5);

    // Ô kính trên cửa
    this.poly(
      [
        this.iso(0, y0 + 0.22, z1 - 0.62),
        this.iso(0, y1 - 0.22, z1 - 0.62),
        this.iso(0, y1 - 0.22, z1 - 0.16),
        this.iso(0, y0 + 0.22, z1 - 0.16),
      ],
      'rgba(255,247,232,0.55)',
      'rgba(74,50,38,0.25)',
      1,
    );

    // Tay nắm
    const knob = this.iso(0, y1 - 0.2, 1);
    this.ctx.beginPath();
    this.ctx.arc(knob.x, knob.y, 3.2 * this.cam.unit, 0, Math.PI * 2);
    this.ctx.fillStyle = '#E8B45A';
    this.ctx.fill();
    this.ctx.strokeStyle = 'rgba(74,50,38,0.35)';
    this.ctx.lineWidth = 1;
    this.ctx.stroke();
  }

  private drawShelf(): void {
    const planks = [1.05, 1.5];
    for (const z of planks) {
      this.poly(
        [
          this.iso(0, 3.7, z),
          this.iso(0, 5.6, z),
          this.iso(0.28, 5.6, z - 0.02),
          this.iso(0.28, 3.7, z - 0.02),
        ],
        '#B98A5F',
        'rgba(74,50,38,0.2)',
        1,
      );
    }
    const u = this.cam.unit;
    const cups = [3.95, 4.55, 5.15];
    cups.forEach((y, i) => {
      const p = this.iso(0.22, y, 1.5);
      this.fillRR(p.x - 5 * u, p.y - 9 * u, 10 * u, 9 * u, 2 * u, i % 2 === 0 ? '#FFF8ED' : '#E8B45A', 'rgba(74,50,38,0.2)', 1);
      this.ctx.beginPath();
      this.ctx.ellipse(p.x, p.y - 9 * u, 5 * u, 2 * u, 0, 0, Math.PI * 2);
      this.ctx.fillStyle = '#6F4E37';
      this.ctx.fill();
    });
  }

  private drawWindowLight(): void {
    const ctx = this.ctx;
    const beam = [
      this.iso(4.6, 0.1),
      this.iso(7.4, 0.1),
      this.iso(7.0, 3.4),
      this.iso(4.2, 3.0),
    ];
    const g = ctx.createLinearGradient(beam[0].x, beam[0].y, beam[2].x, beam[2].y);
    g.addColorStop(0, 'rgba(255,236,196,0.42)');
    g.addColorStop(1, 'rgba(255,236,196,0)');
    this.poly(beam, g);
    this.poly(
      [
        this.iso(5.0, 0.1),
        this.iso(6.9, 0.1),
        this.iso(6.6, 2.6),
        this.iso(4.9, 2.4),
      ],
      'rgba(255,244,210,0.16)',
    );
  }

  private drawShadowUnderCounter(): void {
    const p = this.iso(2.85, 1.85);
    const ctx = this.ctx;
    ctx.save();
    ctx.fillStyle = 'rgba(74,50,38,0.12)';
    ctx.beginPath();
    ctx.ellipse(p.x, p.y, 52 * this.cam.unit, 20 * this.cam.unit, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  private drawCounter(): void {
    this.isoBox(
      COUNTER.x0,
      COUNTER.y0,
      COUNTER.x1,
      COUNTER.y1,
      0,
      COUNTER.h,
      '#E8C9A4',
      '#B98A5F',
      '#A97C55',
      'rgba(74,50,38,0.18)',
    );

    const u = this.cam.unit;
    // Chi tiết gỗ trên mặt trước
    const ctx = this.ctx;
    ctx.save();
    ctx.strokeStyle = 'rgba(74,50,38,0.16)';
    ctx.lineWidth = 1.4;
    for (let i = 1; i < 3; i += 1) {
      const p = this.iso(COUNTER.x0 + i * 1.0, COUNTER.y1, COUNTER.h - 0.05);
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x, p.y + COUNTER.h * this.cam.th * 0.72);
      ctx.stroke();
    }
    ctx.restore();

    // Máy pha cà phê
    const mx0 = 1.3;
    const mx1 = 2.35;
    const my0 = 0.95;
    const my1 = 1.45;
    const base = COUNTER.h;
    this.isoBox(mx0, my0, mx1, my1, base, base + 0.62, '#52413A', '#3B2E28', '#2F2521', 'rgba(20,14,12,0.35)');

    const top = this.iso((mx0 + mx1) / 2, (my0 + my1) / 2, base + 0.62);
    this.fillRR(top.x - 12 * u, top.y - 5 * u, 24 * u, 7 * u, 2 * u, '#6B5448');

    // Đèn báo
    const led = this.iso(mx1 - 0.12, my1 - 0.12, base + 0.45);
    const pulse = 0.55 + 0.45 * Math.sin(this.time * 3);
    ctx.beginPath();
    ctx.arc(led.x, led.y, 3 * u, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(232,120,90,${0.5 + pulse * 0.5})`;
    ctx.fill();

    // Hai tay pha và ly
    const spout = this.iso(mx0 + 0.42, my1, base + 0.28);
    this.line(
      { x: spout.x - 5 * u, y: spout.y },
      { x: spout.x + 5 * u, y: spout.y },
      '#C9B7A6',
      3 * u,
    );
    const cup = this.iso(mx0 + 0.42, my1 + 0.08, base + 0.1);
    this.fillRR(cup.x - 4 * u, cup.y - 6 * u, 8 * u, 7 * u, 1.5 * u, '#FFF8ED', 'rgba(74,50,38,0.2)', 1);

    // Hơi nước
    if (this.state?.phase === 'open') {
      for (let i = 0; i < 3; i += 1) {
        const t = (this.time * 0.5 + i * 0.33) % 1;
        const steam = this.iso(mx0 + 0.45 + Math.sin(t * 6) * 0.05, my1 + 0.05, base + 0.45 + t * 0.7);
        ctx.beginPath();
        ctx.arc(steam.x, steam.y, (2 + t * 5) * u, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255,255,255,${0.24 * (1 - t)})`;
        ctx.fill();
      }
    }

    // Khay bánh
    this.isoBox(3.2, 1.0, 4.35, 1.4, base, base + 0.4, 'rgba(255,250,240,0.55)', 'rgba(226,199,168,0.85)', 'rgba(213,183,150,0.9)', 'rgba(120,90,60,0.2)');
    const pastry = this.iso(3.55, 1.2, base + 0.4);
    for (let i = 0; i < 3; i += 1) {
      ctx.beginPath();
      ctx.ellipse(pastry.x + i * 12 * u, pastry.y - i * 4 * u, 6 * u, 3.5 * u, -0.3, 0, Math.PI * 2);
      ctx.fillStyle = '#D9A066';
      ctx.fill();
      ctx.strokeStyle = 'rgba(111,78,55,0.35)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }

  /* ------------------------------ Đồ vật ----------------------------- */

  private drawTable(spot: Vec, ready: boolean): void {
    const ctx = this.ctx;
    const u = this.cam.unit;
    const base = this.iso(spot.x, spot.y);

    ctx.save();
    ctx.fillStyle = 'rgba(74,50,38,0.14)';
    ctx.beginPath();
    ctx.ellipse(base.x, base.y + 2 * u, 32 * u, 14 * u, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    for (const [dx, dy] of [
      [-0.34, -0.34],
      [0.34, -0.34],
      [0.34, 0.34],
      [-0.34, 0.34],
    ]) {
      this.line(
        this.iso(spot.x + dx, spot.y + dy, 0.44),
        this.iso(spot.x + dx, spot.y + dy, 0),
        '#8A6A4F',
        2.2 * u,
      );
    }

    this.isoBox(spot.x - 0.54, spot.y - 0.54, spot.x + 0.54, spot.y + 0.54, 0.44, 0.52, '#F1DABA', '#D8B791', '#C7A37B', 'rgba(111,78,55,0.2)');

    // Lọ hoa nhỏ
    const vase = this.iso(spot.x + 0.22, spot.y - 0.16, 0.56);
    this.fillRR(vase.x - 2.6 * u, vase.y - 8 * u, 5.2 * u, 8 * u, 2 * u, '#8FBFA1');
    this.line(
      { x: vase.x, y: vase.y - 8 * u },
      { x: vase.x - 2 * u, y: vase.y - 15 * u },
      '#4E7A5A',
      1.6 * u,
    );
    ctx.beginPath();
    ctx.arc(vase.x - 2.5 * u, vase.y - 15.5 * u, 2.4 * u, 0, Math.PI * 2);
    ctx.fillStyle = '#C4553B';
    ctx.fill();

    if (ready) {
      const cup = this.iso(spot.x - 0.18, spot.y + 0.08, 0.62);
      ctx.beginPath();
      ctx.ellipse(cup.x, cup.y + 3 * u, 8 * u, 3.4 * u, 0, 0, Math.PI * 2);
      ctx.fillStyle = '#FFFDF7';
      ctx.fill();
      this.fillRR(cup.x - 5.5 * u, cup.y - 6 * u, 11 * u, 8 * u, 2 * u, '#FFFFFF', 'rgba(111,78,55,0.3)', 1);
      ctx.beginPath();
      ctx.ellipse(cup.x, cup.y - 6 * u, 4.6 * u, 2.2 * u, 0, 0, Math.PI * 2);
      ctx.fillStyle = '#6F4E37';
      ctx.fill();
      ctx.beginPath();
      ctx.arc(cup.x + 6 * u, cup.y - 2 * u, 2.6 * u, -Math.PI / 2, Math.PI / 2);
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = 1.6 * u;
      ctx.stroke();

      const pulse = 0.5 + 0.5 * Math.sin(this.time * 4);
      ctx.beginPath();
      ctx.ellipse(base.x, base.y + 2 * u, (24 + pulse * 10) * u, (11 + pulse * 4) * u, 0, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(78,122,90,${0.45 - pulse * 0.25})`;
      ctx.lineWidth = 2 * u;
      ctx.stroke();
    }
  }

  private drawCustomer(c: Customer): void {
    const ctx = this.ctx;
    const u = this.cam.unit;
    const p = this.iso(c.x, c.y);
    const walking = c.phase === 'walk' || c.phase === 'leaving';
    const bob = this.reduced
      ? 0
      : walking
        ? Math.abs(Math.sin(this.time * 9 + c.seed)) * 2.2 * u
        : Math.sin(this.time * 2.2 + c.seed) * 1.1 * u;

    const shirt = SHIRTS[c.id % SHIRTS.length];
    const skin = SKINS[(c.id * 3) % SKINS.length];
    const hair = HAIRS[(c.id * 5) % HAIRS.length];

    ctx.save();
    ctx.fillStyle = 'rgba(74,50,38,0.17)';
    ctx.beginPath();
    ctx.ellipse(p.x, p.y + 1 * u, 9 * u, 4 * u, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    const bodyTop = p.y - 26 * u + bob;
    const bw = 16 * u;
    const bh = 17 * u;
    this.fillRR(p.x - bw / 2, bodyTop, bw, bh, 6 * u, shirt, 'rgba(51,36,27,0.18)', 1);

    // Tay
    this.fillRR(p.x - bw / 2 - 3 * u, bodyTop + 4 * u, 4 * u, 9 * u, 2 * u, shirt);
    this.fillRR(p.x + bw / 2 - 1 * u, bodyTop + 4 * u, 4 * u, 9 * u, 2 * u, shirt);

    // Đầu
    const headY = bodyTop - 6 * u;
    const headR = 7.2 * u;
    ctx.beginPath();
    ctx.arc(p.x, headY, headR, 0, Math.PI * 2);
    ctx.fillStyle = hair;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(p.x, headY + 1.6 * u, headR * 0.92, 0, Math.PI * 2);
    ctx.fillStyle = skin;
    ctx.fill();

    // Mắt
    ctx.fillStyle = '#33241B';
    ctx.beginPath();
    ctx.arc(p.x - 2.4 * u, headY + 2.2 * u, 0.9 * u, 0, Math.PI * 2);
    ctx.arc(p.x + 2.4 * u, headY + 2.2 * u, 0.9 * u, 0, Math.PI * 2);
    ctx.fill();

    if (c.vip) {
      const crownY = headY - headR - 1.2 * u;
      ctx.beginPath();
      ctx.moveTo(p.x - 8 * u, crownY);
      ctx.lineTo(p.x - 4 * u, crownY - 6 * u);
      ctx.lineTo(p.x, crownY - 1.5 * u);
      ctx.lineTo(p.x + 4 * u, crownY - 6 * u);
      ctx.lineTo(p.x + 8 * u, crownY);
      ctx.closePath();
      ctx.fillStyle = '#E8B45A';
      ctx.fill();
      ctx.strokeStyle = 'rgba(111,78,55,0.3)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    if (c.phase === 'wait' || c.phase === 'ready') {
      const ratio = Math.max(0, Math.min(1, c.patience / c.maxPatience));
      const barW = 26 * u;
      const barY = headY - headR - (c.vip ? 12 * u : 6 * u);
      this.fillRR(p.x - barW / 2, barY, barW, 4 * u, 2 * u, 'rgba(51,36,27,0.22)');
      const color = ratio > 0.5 ? '#4E7A5A' : ratio > 0.25 ? '#D9A066' : '#C4553B';
      this.fillRR(p.x - barW / 2, barY, barW * ratio, 4 * u, 2 * u, color);
    }

    if (c.phase === 'ready') {
      const bubbleY = headY - headR - 20 * u;
      const pulse = 0.5 + 0.5 * Math.sin(this.time * 4.2 + c.seed);
      ctx.beginPath();
      ctx.arc(p.x, bubbleY, (12 + pulse * 2.5) * u, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(78,122,90,${0.5 - pulse * 0.3})`;
      ctx.lineWidth = 2 * u;
      ctx.stroke();

      this.fillRR(p.x - 11 * u, bubbleY - 11 * u, 22 * u, 22 * u, 8 * u, '#FFFDF7', 'rgba(111,78,55,0.25)', 1);
      this.fillRR(p.x - 5 * u, bubbleY - 3 * u, 9 * u, 7 * u, 2 * u, '#6F4E37');
      ctx.beginPath();
      ctx.arc(p.x + 4.5 * u, bubbleY + 0.5 * u, 2.4 * u, -Math.PI / 2, Math.PI / 2);
      ctx.strokeStyle = '#6F4E37';
      ctx.lineWidth = 1.8 * u;
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(p.x - 3 * u, bubbleY - 9 * u);
      ctx.quadraticCurveTo(p.x - 5 * u, bubbleY - 14 * u, p.x - 1 * u, bubbleY - 17 * u);
      ctx.strokeStyle = 'rgba(255,255,255,0.85)';
      ctx.lineWidth = 1.6 * u;
      ctx.stroke();
    }

    this.hits.push({
      id: c.id,
      x: p.x,
      y: p.y - 18 * u,
      r: 24 * u,
      ready: c.phase === 'ready',
    });
  }

  private drawStaff(x: number, y: number, role: 'waiter' | 'barista'): void {
    const ctx = this.ctx;
    const u = this.cam.unit;
    const p = this.iso(x, y);
    const bob = this.reduced ? 0 : Math.sin(this.time * 2 + x) * 1.2 * u;

    ctx.save();
    ctx.fillStyle = 'rgba(74,50,38,0.16)';
    ctx.beginPath();
    ctx.ellipse(p.x, p.y + 1 * u, 9 * u, 3.8 * u, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    const bodyTop = p.y - 27 * u + bob;
    this.fillRR(p.x - 8 * u, bodyTop, 16 * u, 18 * u, 6 * u, '#4E7A5A', 'rgba(51,36,27,0.2)', 1);
    // Tạp dề
    this.fillRR(p.x - 6 * u, bodyTop + 5 * u, 12 * u, 12 * u, 3 * u, '#E8D9C2');
    // Đầu
    const headY = bodyTop - 6 * u;
    ctx.beginPath();
    ctx.arc(p.x, headY, 7.2 * u, 0, Math.PI * 2);
    ctx.fillStyle = '#3B2A20';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(p.x, headY + 1.6 * u, 6.6 * u, 0, Math.PI * 2);
    ctx.fillStyle = '#E8B98F';
    ctx.fill();
    ctx.fillStyle = '#33241B';
    ctx.beginPath();
    ctx.arc(p.x - 2.2 * u, headY + 2 * u, 0.85 * u, 0, Math.PI * 2);
    ctx.arc(p.x + 2.2 * u, headY + 2 * u, 0.85 * u, 0, Math.PI * 2);
    ctx.fill();
    // Mũ
    this.fillRR(p.x - 7 * u, headY - 11 * u, 14 * u, 5 * u, 2.5 * u, '#FFF8ED', 'rgba(74,50,38,0.2)', 1);

    if (role === 'waiter') {
      // Khay
      this.fillRR(p.x - 14 * u, bodyTop + 10 * u, 16 * u, 3 * u, 1.5 * u, '#D8B791', 'rgba(74,50,38,0.25)', 1);
      const cup = { x: p.x - 10 * u, y: bodyTop + 6 * u };
      this.fillRR(cup.x - 2.5 * u, cup.y, 5 * u, 4.5 * u, 1 * u, '#FFFDF7');
    }
  }

  private drawPlant(x: number, y: number): void {
    const ctx = this.ctx;
    const u = this.cam.unit;
    const p = this.iso(x, y);
    ctx.save();
    ctx.fillStyle = 'rgba(74,50,38,0.15)';
    ctx.beginPath();
    ctx.ellipse(p.x, p.y + 2 * u, 15 * u, 6 * u, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    this.isoBox(x - 0.28, y - 0.28, x + 0.28, y + 0.28, 0, 0.42, '#C97B5B', '#B4674A', '#9E573D', 'rgba(74,50,38,0.2)');
    const base = this.iso(x, y, 0.42);
    ctx.strokeStyle = '#4E7A5A';
    ctx.lineWidth = 2 * u;
    ctx.lineCap = 'round';
    const leaves: { dx: number; dy: number; rot: number }[] = [
      { dx: 0, dy: -16, rot: 0 },
      { dx: -9, dy: -12, rot: -0.7 },
      { dx: 9, dy: -13, rot: 0.7 },
      { dx: -4, dy: -22, rot: -0.3 },
      { dx: 6, dy: -23, rot: 0.4 },
    ];
    for (const leaf of leaves) {
      const lx = base.x + leaf.dx * u;
      const ly = base.y + leaf.dy * u;
      ctx.beginPath();
      ctx.moveTo(base.x, base.y - 4 * u);
      ctx.quadraticCurveTo(lx, ly + 6 * u, lx, ly);
      ctx.stroke();
      ctx.save();
      ctx.translate(lx, ly);
      ctx.rotate(leaf.rot);
      ctx.beginPath();
      ctx.ellipse(0, 0, 5 * u, 8.5 * u, 0, 0, Math.PI * 2);
      ctx.fillStyle = '#5E8F6B';
      ctx.fill();
      ctx.restore();
    }
  }

  private drawLamp(x: number, y: number): void {
    const ctx = this.ctx;
    const u = this.cam.unit;
    const p = this.iso(x, y, 2.6);
    ctx.strokeStyle = 'rgba(74,50,38,0.35)';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(p.x, 0);
    ctx.lineTo(p.x, p.y - 14 * u);
    ctx.stroke();

    const glow = ctx.createRadialGradient(p.x, p.y + 6 * u, 0, p.x, p.y + 6 * u, 70 * u);
    glow.addColorStop(0, 'rgba(255,222,150,0.34)');
    glow.addColorStop(1, 'rgba(255,222,150,0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(p.x, p.y + 6 * u, 70 * u, 0, Math.PI * 2);
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(p.x - 15 * u, p.y);
    ctx.lineTo(p.x + 15 * u, p.y);
    ctx.lineTo(p.x + 9 * u, p.y + 12 * u);
    ctx.lineTo(p.x - 9 * u, p.y + 12 * u);
    ctx.closePath();
    ctx.fillStyle = '#E7C98B';
    ctx.fill();
    ctx.strokeStyle = 'rgba(111,78,55,0.3)';
    ctx.lineWidth = 1.2;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(p.x, p.y + 12 * u, 4 * u, 0, Math.PI);
    ctx.fillStyle = 'rgba(255,240,200,0.95)';
    ctx.fill();
  }

  /* ------------------------------ FX -------------------------------- */

  private seedDust(): void {
    if (this.reduced) return;
    for (let i = 0; i < 18; i += 1) {
      this.particles.push({
        x: Math.random() * this.W,
        y: Math.random() * this.H,
        vx: (Math.random() - 0.5) * 6,
        vy: -4 - Math.random() * 8,
        life: 4 + Math.random() * 6,
        max: 10,
        size: 0.8 + Math.random() * 1.8,
        color: 'rgba(255,255,255,0.7)',
        kind: 'dust',
      });
    }
  }

  private pullFx(state: GameState): void {
    if (state.fx.length === 0) return;
    const list = state.fx.splice(0, state.fx.length);
    for (const fx of list) {
      const p = this.iso(fx.x, fx.y, 0.9);
      if (fx.kind === 'coin') {
        const count = this.reduced ? 3 : 7;
        for (let i = 0; i < count; i += 1) {
          this.particles.push({
            x: p.x + (Math.random() - 0.5) * 18,
            y: p.y + (Math.random() - 0.5) * 10,
            vx: (Math.random() - 0.5) * 90,
            vy: -70 - Math.random() * 90,
            life: 0.9,
            max: 0.9,
            size: 2.2 + Math.random() * 2,
            color: Math.random() > 0.35 ? '#E8B45A' : '#F6D79A',
            kind: 'coin',
          });
        }
      } else if (fx.text) {
        this.texts.push({ x: p.x, y: p.y - 30, life: 1.3, max: 1.3, text: fx.text });
      }
    }
  }

  private updateParticles(dt: number): void {
    for (const p of this.particles) {
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.kind === 'coin') p.vy += 260 * dt;
      else {
        p.vx += (Math.random() - 0.5) * 4 * dt;
        p.vy -= 1.5 * dt;
      }
    }
    this.particles = this.particles.filter((p) => p.life > 0);

    // Bụi lơ lửng tái sinh
    if (!this.reduced) {
      const dust = this.particles.filter((p) => p.kind === 'dust').length;
      if (dust < 14) {
        this.particles.push({
          x: Math.random() * this.W,
          y: this.H + 10,
          vx: (Math.random() - 0.5) * 5,
          vy: -6 - Math.random() * 8,
          life: 7 + Math.random() * 5,
          max: 12,
          size: 0.8 + Math.random() * 1.6,
          color: 'rgba(255,255,255,0.65)',
          kind: 'dust',
        });
      }
    }

    for (const t of this.texts) {
      t.life -= dt;
      t.y -= 30 * dt;
    }
    this.texts = this.texts.filter((t) => t.life > 0);
  }

  private drawParticles(): void {
    const ctx = this.ctx;
    for (const p of this.particles) {
      const alpha = Math.max(0, Math.min(1, p.life / p.max));
      ctx.globalAlpha = p.kind === 'coin' ? alpha : alpha * 0.55;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fillStyle = p.color;
      ctx.fill();
      if (p.kind === 'coin') {
        ctx.strokeStyle = 'rgba(150,100,40,0.5)';
        ctx.lineWidth = 0.8;
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
  }

  private drawTexts(): void {
    const ctx = this.ctx;
    const u = this.cam.unit;
    for (const t of this.texts) {
      const alpha = Math.max(0, Math.min(1, t.life / t.max));
      ctx.globalAlpha = alpha;
      ctx.font = `800 ${Math.round(14 * u)}px 'Baloo 2', system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.lineWidth = 4;
      ctx.strokeStyle = 'rgba(255,250,242,0.9)';
      ctx.strokeText(t.text, t.x, t.y);
      ctx.fillStyle = '#3F6B4E';
      ctx.fillText(t.text, t.x, t.y);
      ctx.globalAlpha = 1;
    }
  }

  private drawAtmosphere(state: GameState): void {
    const { ctx, W, H } = this;
    const t = Math.min(1, state.clock / DAY_LENGTH);
    if (state.phase === 'open') {
      ctx.fillStyle = `rgba(255,164,86,${0.03 + t * 0.1})`;
      ctx.fillRect(0, 0, W, H);
    }

    const vignette = ctx.createRadialGradient(
      W / 2,
      H * 0.45,
      Math.min(W, H) * 0.25,
      W / 2,
      H * 0.45,
      Math.max(W, H) * 0.75,
    );
    vignette.addColorStop(0, 'rgba(74,50,38,0)');
    vignette.addColorStop(1, 'rgba(74,50,38,0.22)');
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, W, H);
  }

  pick(x: number, y: number): number | null {
    let best: Hit | null = null;
    let bestDist = Infinity;
    for (const hit of this.hits) {
      const d = Math.hypot(hit.x - x, hit.y - y);
      if (d <= hit.r && d < bestDist) {
        best = hit;
        bestDist = d;
      }
    }
    return best?.id ?? null;
  }
}
