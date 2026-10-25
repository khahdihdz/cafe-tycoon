import { COUNTER, DAY_LENGTH, ROOM, TABLE_SPOTS } from '../core/config';
import { tableCount } from '../core/engine';
import type { Customer, GameState, Vec } from '../core/types';

const WALL_H = 3;

const PINK = '#F5BBC9';
const PINK_DEEP = '#E38FA6';
const PINK_SOFT = '#FDE7ED';
const MINT = '#BDE3CF';
const MINT_DEEP = '#8BC5AA';
const BUTTER = '#F8DFA8';
const CREAM = '#FFF9F2';
const WOOD = '#D3A87F';
const WOOD_DEEP = '#B98A62';
const INK = '#4A3A32';

const SHIRTS = [
  '#F2A3A3',
  '#9FCBB5',
  '#A8C4E8',
  '#F2C98B',
  '#C9A8E0',
  '#EFA98F',
  '#8FC1C7',
  '#D9B08C',
];
const SKINS = ['#FAD6B4', '#F0BE95', '#DBA07A', '#B97A56', '#FCE0C6', '#C98E68'];
const HAIRS = ['#5B3A2A', '#7A4E30', '#3B2A22', '#94663C', '#4E3A2E', '#2E2420'];

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
  kind: 'coin' | 'dust' | 'heart';
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

  private circle(x: number, y: number, r: number, fill: string, stroke?: string, width = 1): void {
    const ctx = this.ctx;
    ctx.beginPath();
    ctx.arc(x, y, Math.max(0.1, r), 0, Math.PI * 2);
    ctx.fillStyle = fill;
    ctx.fill();
    if (stroke) {
      ctx.strokeStyle = stroke;
      ctx.lineWidth = width;
      ctx.stroke();
    }
  }

  private heart(x: number, y: number, size: number, color: string, alpha = 1): void {
    const ctx = this.ctx;
    const s = size;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    ctx.moveTo(x, y + s * 0.62);
    ctx.bezierCurveTo(x - s * 1.15, y - s * 0.2, x - s * 0.58, y - s * 1.02, x, y - s * 0.32);
    ctx.bezierCurveTo(x + s * 0.58, y - s * 1.02, x + s * 1.15, y - s * 0.2, x, y + s * 0.62);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
    ctx.restore();
  }

  private flower(x: number, y: number, size: number, color: string): void {
    for (let i = 0; i < 5; i += 1) {
      const angle = (i / 5) * Math.PI * 2 - Math.PI / 2;
      this.circle(
        x + Math.cos(angle) * size * 0.62,
        y + Math.sin(angle) * size * 0.62,
        size * 0.5,
        color,
      );
    }
    this.circle(x, y, size * 0.36, BUTTER);
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
    this.drawStaff(4.95, 0.8, 'barista');
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
    items.push({ depth: 7.45 + 0.5, draw: () => this.drawPlant(7.45, 0.5) });
    items.push({ depth: 6.6 + 1.05, draw: () => this.drawCat(6.6, 1.05) });

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
    sky.addColorStop(0, '#FFFBF5');
    sky.addColorStop(0.5, '#FFF1E3');
    sky.addColorStop(1, '#FBE2D5');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, H);

    const blob = (x: number, y: number, r: number, color: string) => {
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, color);
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
    };
    blob(W * 0.12, H * 0.2, Math.max(W, H) * 0.4, 'rgba(245,187,201,0.24)');
    blob(W * 0.9, H * 0.72, Math.max(W, H) * 0.38, 'rgba(189,227,207,0.22)');
    blob(W * 0.55, H * 0.05, Math.max(W, H) * 0.3, 'rgba(255,255,255,0.55)');
  }

  private drawFloor(): void {
    for (let x = 0; x < ROOM.w; x += 1) {
      for (let y = 0; y < ROOM.d; y += 1) {
        const fill = (x + y) % 2 === 0 ? '#FFF3E7' : '#FCE8D8';
        this.poly(
          [this.iso(x, y), this.iso(x + 1, y), this.iso(x + 1, y + 1), this.iso(x, y + 1)],
          fill,
          'rgba(185,138,98,0.08)',
          1,
        );
      }
    }

    // Thảm hồng có viền scallop
    this.poly(
      [this.iso(0.9, 2.35), this.iso(7.1, 2.35), this.iso(7.1, 5.75), this.iso(0.9, 5.75)],
      '#FCE7EC',
      PINK,
      2.4,
    );
    this.poly(
      [this.iso(1.12, 2.55), this.iso(6.88, 2.55), this.iso(6.88, 5.55), this.iso(1.12, 5.55)],
      'rgba(255,255,255,0.35)',
      'rgba(255,255,255,0.85)',
      1.5,
    );

    const u = this.cam.unit;
    const rugHeart = this.iso(4, 4.05);
    this.heart(rugHeart.x, rugHeart.y, 12 * u, PINK_DEEP, 0.28);

    // Chấm bi trên thảm
    const ctx = this.ctx;
    ctx.save();
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    for (let x = 1.6; x < 6.8; x += 0.9) {
      for (let y = 2.9; y < 5.5; y += 0.85) {
        if ((Math.round(x * 3) + Math.round(y * 3)) % 2 !== 0) continue;
        const p = this.iso(x, y);
        ctx.beginPath();
        ctx.arc(p.x, p.y, 1.7 * u, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();

    // Thảm chào mừng trước cửa
    this.poly(
      [this.iso(0.15, 1.5), this.iso(0.95, 1.5), this.iso(0.95, 2.95), this.iso(0.15, 2.95)],
      'rgba(227,143,166,0.4)',
      'rgba(255,255,255,0.6)',
      1.5,
    );
    const mat = this.iso(0.55, 2.2);
    this.heart(mat.x, mat.y, 4.2 * u, '#FFF9F2', 0.85);

    this.poly(
      [this.iso(0, 0), this.iso(ROOM.w, 0), this.iso(ROOM.w, ROOM.d), this.iso(0, ROOM.d)],
      'rgba(0,0,0,0)',
      'rgba(185,138,98,0.22)',
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
    gradA.addColorStop(0, '#FFF9F2');
    gradA.addColorStop(0.7, '#FFECDA');
    gradA.addColorStop(1, '#FADCC6');
    this.poly(wallA, gradA, 'rgba(185,138,98,0.18)', 1.5);

    const wallB = [
      this.iso(0, 0),
      this.iso(0, ROOM.d),
      this.iso(0, ROOM.d, WALL_H),
      this.iso(0, 0, WALL_H),
    ];
    const gradB = ctx.createLinearGradient(corner.x, corner.y - WALL_H * this.cam.th, corner.x, corner.y);
    gradB.addColorStop(0, '#FFF6EC');
    gradB.addColorStop(0.68, '#FCE7D4');
    gradB.addColorStop(1, '#F6D8C0');
    this.poly(wallB, gradB, 'rgba(185,138,98,0.18)', 1.5);

    for (const wall of [
      [this.iso(0, 0), this.iso(ROOM.w, 0), this.iso(ROOM.w, 0, 0.2), this.iso(0, 0, 0.2)],
      [this.iso(0, 0), this.iso(0, ROOM.d), this.iso(0, ROOM.d, 0.2), this.iso(0, 0, 0.2)],
    ]) {
      this.poly(wall, 'rgba(211,168,127,0.35)');
    }

    this.drawWallDots();
    this.drawWindow();
    this.drawChalkboard();
    this.drawDoor();
    this.drawShelf();
    this.drawBunting();
    this.drawClock();
  }

  private drawWallDots(): void {
    const ctx = this.ctx;
    const u = this.cam.unit;
    ctx.save();
    ctx.fillStyle = 'rgba(245,187,201,0.3)';
    for (let x = 0.3; x < ROOM.w; x += 0.62) {
      for (let z = 0.45; z < 2.85; z += 0.5) {
        const p = this.iso(x + (Math.round(z * 2) % 2) * 0.16, 0, z);
        ctx.beginPath();
        ctx.arc(p.x, p.y, 1.8 * u, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    for (let y = 0.4; y < ROOM.d; y += 0.62) {
      for (let z = 0.5; z < 2.8; z += 0.52) {
        const p = this.iso(0, y, z);
        ctx.beginPath();
        ctx.arc(p.x, p.y, 1.7 * u, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  private drawWindow(): void {
    const ctx = this.ctx;
    const u = this.cam.unit;
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
    g.addColorStop(0, '#CDEAF4');
    g.addColorStop(0.55, '#E5F5F8');
    g.addColorStop(1, '#FFF7E9');
    this.poly(glass, g);

    const p1 = this.iso(x0 + 0.5, 0, z1 - 0.35);
    const p2 = this.iso(x0 + 1.6, 0, z1 - 0.25);
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.beginPath();
    ctx.ellipse(p1.x, p1.y, 12 * u, 6 * u, 0, 0, Math.PI * 2);
    ctx.ellipse(p2.x, p2.y + 2 * u, 15 * u, 7 * u, 0, 0, Math.PI * 2);
    ctx.fill();
    const hill = this.iso(x0 + 2.6, 0, z0);
    ctx.fillStyle = 'rgba(163,214,181,0.5)';
    ctx.beginPath();
    ctx.ellipse(hill.x, hill.y + 2 * u, 34 * u, 16 * u, 0, Math.PI, Math.PI * 2);
    ctx.fill();

    // Rèm hai bên
    const curtain = (a: number, b: number) => {
      this.poly(
        [
          this.iso(a, 0, z0 - 0.12),
          this.iso(b, 0, z0 - 0.12),
          this.iso(b + 0.06, 0, z1 + 0.12),
          this.iso(a, 0, z1 + 0.12),
        ],
        'rgba(253,231,237,0.94)',
        'rgba(227,143,166,0.55)',
        1,
      );
    };
    curtain(x0 - 0.08, x0 + 0.55);
    curtain(x1 - 0.55, x1 + 0.08);

    this.poly(glass, 'rgba(0,0,0,0)', '#FFFBF4', 5);
    const mullionX = this.iso((x0 + x1) / 2, 0, z0);
    const mullionTop = this.iso((x0 + x1) / 2, 0, z1);
    this.line(mullionX, mullionTop, '#FFFBF4', 4);
    this.line(this.iso(x0, 0, (z0 + z1) / 2), this.iso(x1, 0, (z0 + z1) / 2), '#FFFBF4', 4);

    this.isoBox(x0 - 0.12, 0, x1 + 0.12, 0.18, z0 - 0.12, z0 - 0.02, '#FFFBF4', '#F3DCC6', '#FBEEDD');

    // Chậu treo nhỏ góc cửa sổ
    const pot = this.iso(x1 - 0.3, 0.2, z1 + 0.15);
    this.line(this.iso(x1 - 0.3, 0, z1 + 0.5), pot, 'rgba(111,78,55,0.35)', 1.2);
    this.fillRR(pot.x - 5 * u, pot.y - 2 * u, 10 * u, 8 * u, 3 * u, '#E8A98F', 'rgba(111,78,55,0.2)', 1);
    this.circle(pot.x - 2 * u, pot.y - 6 * u, 3 * u, MINT_DEEP);
    this.circle(pot.x + 3 * u, pot.y - 5 * u, 2.6 * u, MINT);
  }

  private drawChalkboard(): void {
    const ctx = this.ctx;
    const u = this.cam.unit;
    const board = [
      this.iso(0.5, 0, 1.25),
      this.iso(3.5, 0, 1.25),
      this.iso(3.5, 0, 2.55),
      this.iso(0.5, 0, 2.55),
    ];
    this.poly(board, '#5C4A40', 'rgba(255,249,242,0.65)', 3);
    this.poly(
      [
        this.iso(0.62, 0, 1.37),
        this.iso(3.38, 0, 1.37),
        this.iso(3.38, 0, 2.43),
        this.iso(0.62, 0, 2.43),
      ],
      '#4A3A32',
    );

    ctx.save();
    ctx.strokeStyle = 'rgba(255,249,242,0.8)';
    ctx.lineCap = 'round';
    const base = this.iso(1.55, 0, 2.22);
    for (let i = 0; i < 2; i += 1) {
      const y = base.y + i * 10 * u;
      ctx.lineWidth = (i === 0 ? 3 : 2) * u;
      ctx.beginPath();
      ctx.moveTo(base.x, y);
      ctx.lineTo(base.x + (i === 0 ? 34 : 46) * u, y);
      ctx.stroke();
    }
    ctx.restore();

    // Ly cà phê mặt cười
    const cup = this.iso(2.95, 0, 2.02);
    ctx.strokeStyle = 'rgba(248,223,168,0.95)';
    ctx.lineWidth = 2 * u;
    ctx.beginPath();
    ctx.moveTo(cup.x - 7 * u, cup.y - 6 * u);
    ctx.lineTo(cup.x + 5 * u, cup.y - 6 * u);
    ctx.lineTo(cup.x + 3.5 * u, cup.y + 5 * u);
    ctx.lineTo(cup.x - 5.5 * u, cup.y + 5 * u);
    ctx.closePath();
    ctx.stroke();
    ctx.strokeStyle = 'rgba(248,223,168,0.95)';
    ctx.beginPath();
    ctx.arc(cup.x + 6.5 * u, cup.y - 2 * u, 3 * u, -Math.PI / 2, Math.PI / 2);
    ctx.stroke();
    ctx.fillStyle = 'rgba(248,223,168,0.95)';
    ctx.beginPath();
    ctx.arc(cup.x - 2.5 * u, cup.y - 1 * u, 0.9 * u, 0, Math.PI * 2);
    ctx.arc(cup.x + 1.5 * u, cup.y - 1 * u, 0.9 * u, 0, Math.PI * 2);
    ctx.fill();
    this.heart(cup.x + 12 * u, cup.y + 8 * u, 3.4 * u, PINK, 0.9);
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
    this.poly(frame, WOOD_DEEP, 'rgba(111,78,55,0.35)', 2);

    const door = [
      this.iso(0, y0, 0),
      this.iso(0, y1, 0),
      this.iso(0, y1, z1),
      this.iso(0, y0, z1),
    ];
    const g = this.ctx.createLinearGradient(door[2].x, door[2].y, door[0].x, door[0].y);
    g.addColorStop(0, '#E8B78E');
    g.addColorStop(1, '#CF9569');
    this.poly(door, g, 'rgba(74,50,38,0.2)', 1.5);

    this.poly(
      [
        this.iso(0, y0 + 0.22, z1 - 0.62),
        this.iso(0, y1 - 0.22, z1 - 0.62),
        this.iso(0, y1 - 0.22, z1 - 0.16),
        this.iso(0, y0 + 0.22, z1 - 0.16),
      ],
      'rgba(255,249,242,0.6)',
      'rgba(74,50,38,0.25)',
      1,
    );

    // Vòng hoa trái tim trên cửa
    const wreath = this.iso(0, (y0 + y1) / 2, z1 - 0.32);
    this.circle(wreath.x, wreath.y, 8 * this.cam.unit, 'rgba(189,227,207,0.9)', MINT_DEEP, 1.5);
    this.heart(wreath.x, wreath.y, 5 * this.cam.unit, PINK_DEEP);

    const knob = this.iso(0, y1 - 0.2, 1);
    this.circle(knob.x, knob.y, 3.2 * this.cam.unit, BUTTER, 'rgba(111,78,55,0.35)', 1);
  }

  private drawShelf(): void {
    const u = this.cam.unit;
    for (const z of [1.05, 1.5]) {
      this.poly(
        [
          this.iso(0, 3.7, z),
          this.iso(0, 5.6, z),
          this.iso(0.28, 5.6, z - 0.02),
          this.iso(0.28, 3.7, z - 0.02),
        ],
        WOOD,
        'rgba(111,78,55,0.2)',
        1,
      );
    }
    const cups = [3.95, 4.55, 5.15];
    cups.forEach((y, i) => {
      const p = this.iso(0.22, y, 1.5);
      this.fillRR(
        p.x - 5 * u,
        p.y - 9 * u,
        10 * u,
        9 * u,
        2 * u,
        i % 2 === 0 ? CREAM : PINK,
        'rgba(111,78,55,0.2)',
        1,
      );
      const ctx = this.ctx;
      ctx.beginPath();
      ctx.ellipse(p.x, p.y - 9 * u, 5 * u, 2 * u, 0, 0, Math.PI * 2);
      ctx.fillStyle = '#8B5E3C';
      ctx.fill();
      this.heart(p.x, p.y - 3 * u, 1.8 * u, PINK_DEEP, 0.8);
    });
  }

  private drawBunting(): void {
    const u = this.cam.unit;
    const a = this.iso(0.2, 0, 2.86);
    const b = this.iso(7.8, 0, 2.86);
    const m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 + 16 * u };
    const ctx = this.ctx;
    ctx.save();
    ctx.strokeStyle = 'rgba(111,78,55,0.32)';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.quadraticCurveTo(m.x, m.y, b.x, b.y);
    ctx.stroke();

    const colors = [PINK, MINT, BUTTER, PINK_SOFT];
    for (let i = 0; i < 9; i += 1) {
      const t = (i + 0.5) / 9;
      const x = (1 - t) * (1 - t) * a.x + 2 * (1 - t) * t * m.x + t * t * b.x;
      const y = (1 - t) * (1 - t) * a.y + 2 * (1 - t) * t * m.y + t * t * b.y;
      ctx.beginPath();
      ctx.moveTo(x - 6 * u, y);
      ctx.lineTo(x + 6 * u, y);
      ctx.lineTo(x, y + 14 * u);
      ctx.closePath();
      ctx.fillStyle = colors[i % colors.length];
      ctx.fill();
      ctx.strokeStyle = 'rgba(111,78,55,0.12)';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(x, y + 5 * u, 1.2 * u, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.fill();
    }
    ctx.restore();
  }

  private drawClock(): void {
    const p = this.iso(0, 4.55, 2.18);
    const u = this.cam.unit;
    const r = 12 * u;

    this.circle(p.x, p.y + 1 * u, r + 2.2 * u, 'rgba(185,138,98,0.35)');
    this.circle(p.x, p.y, r, CREAM, PINK, 2.4 * u);

    for (let i = 0; i < 12; i += 1) {
      const angle = (i / 12) * Math.PI * 2 - Math.PI / 2;
      this.circle(
        p.x + Math.cos(angle) * r * 0.78,
        p.y + Math.sin(angle) * r * 0.78,
        0.85 * u,
        'rgba(74,58,50,0.3)',
      );
    }

    const dayT = Math.min(1, Math.max(0, (this.state?.clock ?? 0) / DAY_LENGTH));
    const hours = 8 + dayT * 14;
    const hourAngle = ((hours % 12) / 12) * Math.PI * 2 - Math.PI / 2;
    const minuteAngle = (hours % 1) * Math.PI * 2 - Math.PI / 2;

    this.line(
      { x: p.x, y: p.y },
      { x: p.x + Math.cos(hourAngle) * r * 0.45, y: p.y + Math.sin(hourAngle) * r * 0.45 },
      INK,
      2.4 * u,
    );
    this.line(
      { x: p.x, y: p.y },
      { x: p.x + Math.cos(minuteAngle) * r * 0.7, y: p.y + Math.sin(minuteAngle) * r * 0.7 },
      PINK_DEEP,
      1.6 * u,
    );
    this.circle(p.x, p.y, 1.6 * u, INK);
    this.heart(p.x, p.y - r * 0.78, 3.2 * u, PINK_DEEP, 0.9);
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
    g.addColorStop(0, 'rgba(255,236,196,0.45)');
    g.addColorStop(1, 'rgba(255,236,196,0)');
    this.poly(beam, g);
    this.poly(
      [this.iso(5.0, 0.1), this.iso(6.9, 0.1), this.iso(6.6, 2.6), this.iso(4.9, 2.4)],
      'rgba(255,244,210,0.18)',
    );
  }

  private drawShadowUnderCounter(): void {
    const p = this.iso(2.85, 1.85);
    const ctx = this.ctx;
    ctx.save();
    ctx.fillStyle = 'rgba(74,50,38,0.1)';
    ctx.beginPath();
    ctx.ellipse(p.x, p.y, 52 * this.cam.unit, 20 * this.cam.unit, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  private drawCounter(): void {
    const u = this.cam.unit;
    const ctx = this.ctx;
    this.isoBox(
      COUNTER.x0,
      COUNTER.y0,
      COUNTER.x1,
      COUNTER.y1,
      0,
      COUNTER.h,
      '#FFF1DE',
      '#E3BF9C',
      '#D7AF8B',
      'rgba(111,78,55,0.16)',
    );

    // Viền scallop trước quầy
    ctx.save();
    ctx.fillStyle = PINK;
    for (let i = 0; i < 7; i += 1) {
      const p = this.iso(COUNTER.x0 + 0.4 + i * 0.55, COUNTER.y1, 0.82);
      ctx.beginPath();
      ctx.arc(p.x, p.y, 6.4 * u, 0, Math.PI);
      ctx.fill();
    }
    ctx.strokeStyle = 'rgba(227,143,166,0.65)';
    ctx.lineWidth = 2 * u;
    ctx.beginPath();
    const lineA = this.iso(COUNTER.x0 + 0.2, COUNTER.y1, 0.83);
    const lineB = this.iso(COUNTER.x1 - 0.2, COUNTER.y1, 0.83);
    ctx.moveTo(lineA.x, lineA.y);
    ctx.lineTo(lineB.x, lineB.y);
    ctx.stroke();
    ctx.restore();

    // Máy pha cà phê màu mint có mặt cười
    const mx0 = 1.3;
    const mx1 = 2.35;
    const my0 = 0.95;
    const my1 = 1.45;
    const base = COUNTER.h;
    this.isoBox(mx0, my0, mx1, my1, base, base + 0.6, '#E4F5EB', MINT, '#A9D6BF', 'rgba(111,78,55,0.18)');

    const face = this.iso((mx0 + mx1) / 2, my1, base + 0.33);
    this.circle(face.x - 5 * u, face.y, 1.5 * u, INK);
    this.circle(face.x + 5 * u, face.y, 1.5 * u, INK);
    this.circle(face.x - 5.5 * u, face.y - 0.3 * u, 0.5 * u, '#FFFFFF');
    this.circle(face.x + 4.5 * u, face.y - 0.3 * u, 0.5 * u, '#FFFFFF');
    ctx.beginPath();
    ctx.arc(face.x, face.y + 2 * u, 2.6 * u, 0.15 * Math.PI, 0.85 * Math.PI);
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.4 * u;
    ctx.lineCap = 'round';
    ctx.stroke();
    this.circle(face.x - 8.5 * u, face.y + 3.5 * u, 2 * u, PINK, undefined);
    this.circle(face.x + 8.5 * u, face.y + 3.5 * u, 2 * u, PINK, undefined);

    const heartSpot = this.iso(mx0 + 0.12, (my0 + my1) / 2, base + 0.35);
    this.heart(heartSpot.x, heartSpot.y, 3.4 * u, PINK_DEEP, 0.9);

    const led = this.iso(mx1 - 0.12, my1 - 0.12, base + 0.42);
    const pulse = 0.55 + 0.45 * Math.sin(this.time * 3);
    this.circle(led.x, led.y, 3.2 * u, `rgba(240,150,170,${0.45 + pulse * 0.5})`);

    const spout = this.iso(mx0 + 0.42, my1, base + 0.28);
    this.line({ x: spout.x - 5 * u, y: spout.y }, { x: spout.x + 5 * u, y: spout.y }, '#C9B7A6', 3 * u);
    const cup = this.iso(mx0 + 0.42, my1 + 0.08, base + 0.1);
    this.fillRR(cup.x - 4 * u, cup.y - 6 * u, 8 * u, 7 * u, 1.5 * u, CREAM, 'rgba(74,50,38,0.2)', 1);

    if (this.state?.phase === 'open') {
      for (let i = 0; i < 3; i += 1) {
        const t = (this.time * 0.45 + i * 0.33) % 1;
        const s = this.iso(
          mx0 + 0.4 + Math.sin(t * 6) * 0.05,
          my1 + 0.05,
          base + 0.65 + t * 0.6,
        );
        this.heart(s.x, s.y, (2.4 + t * 2.2) * u, i % 2 === 0 ? PINK : PINK_SOFT, 0.6 * (1 - t));
      }
    }

    // Tủ bánh ngọt
    this.isoBox(
      3.2,
      1.0,
      4.35,
      1.4,
      base,
      base + 0.4,
      'rgba(255,251,245,0.6)',
      'rgba(238,214,190,0.9)',
      'rgba(226,199,172,0.92)',
      'rgba(120,90,60,0.2)',
    );
    const pastry = this.iso(3.5, 1.2, base + 0.4);
    for (let i = 0; i < 3; i += 1) {
      const px = pastry.x + i * 12 * u;
      const py = pastry.y - i * 4 * u;
      this.circle(px, py, 5 * u, '#E8B873', 'rgba(111,78,55,0.2)', 1);
      this.circle(px, py - 0.6 * u, 3.4 * u, PINK, undefined);
      this.circle(px - 1 * u, py - 1.6 * u, 0.7 * u, '#FFFFFF');
      this.circle(px + 1.4 * u, py, 0.6 * u, MINT);
    }
  }

  /* ------------------------------ Đồ vật ----------------------------- */

  private drawTable(spot: Vec, ready: boolean): void {
    const ctx = this.ctx;
    const u = this.cam.unit;
    const base = this.iso(spot.x, spot.y);
    const top = this.iso(spot.x, spot.y, 0.56);

    // Đệm ngồi bên bàn
    const cushion = this.iso(spot.x + 0.5, spot.y - 0.42);
    ctx.save();
    ctx.fillStyle = 'rgba(74,50,38,0.1)';
    ctx.beginPath();
    ctx.ellipse(cushion.x, cushion.y + 1.5 * u, 12 * u, 5 * u, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.beginPath();
    ctx.ellipse(cushion.x, cushion.y, 11 * u, 5.4 * u, 0, 0, Math.PI * 2);
    ctx.fillStyle = PINK_SOFT;
    ctx.fill();
    ctx.strokeStyle = PINK;
    ctx.lineWidth = 1.4;
    ctx.stroke();
    this.circle(cushion.x, cushion.y, 1.5 * u, PINK);

    // Chân bàn
    ctx.save();
    ctx.fillStyle = 'rgba(74,50,38,0.14)';
    ctx.beginPath();
    ctx.ellipse(base.x, base.y + 2 * u, 28 * u, 12 * u, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    this.line(
      { x: base.x, y: base.y - 1 * u },
      { x: top.x, y: top.y + 1 * u },
      WOOD_DEEP,
      3.2 * u,
    );
    ctx.beginPath();
    ctx.ellipse(base.x, base.y - 1 * u, 7 * u, 3.4 * u, 0, 0, Math.PI * 2);
    ctx.fillStyle = WOOD;
    ctx.fill();

    // Scallop viền khăn bàn
    for (let i = 0; i < 8; i += 1) {
      const angle = ((i + 0.5) / 8) * Math.PI;
      const sx = top.x + Math.cos(angle) * 24 * u;
      const sy = top.y + Math.sin(angle) * 11 * u + 1.5 * u;
      this.circle(sx, sy, 4.2 * u, PINK);
    }
    ctx.beginPath();
    ctx.ellipse(top.x, top.y + 1.5 * u, 25 * u, 12 * u, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#F7E2C6';
    ctx.fill();
    ctx.strokeStyle = PINK;
    ctx.lineWidth = 2 * u;
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(top.x, top.y + 0.5 * u, 20 * u, 9 * u, 0, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255,255,255,0.8)';
    ctx.lineWidth = 1.4 * u;
    ctx.stroke();

    // Lọ hoa
    const vase = this.iso(spot.x - 0.24, spot.y - 0.18, 0.62);
    this.fillRR(vase.x - 2.2 * u, vase.y - 7 * u, 4.4 * u, 7 * u, 1.8 * u, MINT, MINT_DEEP, 1);
    this.line({ x: vase.x, y: vase.y - 7 * u }, { x: vase.x - 2 * u, y: vase.y - 13 * u }, MINT_DEEP, 1.4 * u);
    this.line({ x: vase.x, y: vase.y - 7 * u }, { x: vase.x + 2.5 * u, y: vase.y - 12 * u }, MINT_DEEP, 1.4 * u);
    this.flower(vase.x - 2 * u, vase.y - 14 * u, 2.4 * u, PINK_DEEP);
    this.flower(vase.x + 2.5 * u, vase.y - 13 * u, 2.1 * u, BUTTER);

    if (ready) {
      // Ly đã sẵn sàng: có mặt cười và hơi tim
      const cup = this.iso(spot.x + 0.16, spot.y + 0.18, 0.64);
      ctx.beginPath();
      ctx.ellipse(cup.x, cup.y + 4 * u, 10 * u, 4.2 * u, 0, 0, Math.PI * 2);
      ctx.fillStyle = '#FFFDF9';
      ctx.fill();
      ctx.strokeStyle = 'rgba(227,143,166,0.6)';
      ctx.lineWidth = 1;
      ctx.stroke();

      this.fillRR(cup.x - 6.5 * u, cup.y - 7 * u, 13 * u, 10 * u, 3 * u, '#FFFDF9', PINK, 1.4);
      ctx.beginPath();
      ctx.ellipse(cup.x, cup.y - 7 * u, 5 * u, 2.4 * u, 0, 0, Math.PI * 2);
      ctx.fillStyle = '#9A6B4A';
      ctx.fill();
      ctx.beginPath();
      ctx.arc(cup.x + 7.2 * u, cup.y - 2 * u, 3 * u, -Math.PI / 2, Math.PI / 2);
      ctx.strokeStyle = '#FFFDF9';
      ctx.lineWidth = 1.8 * u;
      ctx.stroke();

      this.circle(cup.x - 2.4 * u, cup.y - 1.5 * u, 0.8 * u, INK);
      this.circle(cup.x + 2.4 * u, cup.y - 1.5 * u, 0.8 * u, INK);
      ctx.beginPath();
      ctx.arc(cup.x, cup.y + 0.6 * u, 1.6 * u, 0.15 * Math.PI, 0.85 * Math.PI);
      ctx.strokeStyle = INK;
      ctx.lineWidth = 0.9 * u;
      ctx.stroke();

      const steam = Math.sin(this.time * 3) * 2 * u;
      this.heart(cup.x - 2 * u, cup.y - 15 * u + steam, 2.6 * u, PINK, 0.75);
      this.heart(cup.x + 2.5 * u, cup.y - 20 * u - steam, 2 * u, PINK_DEEP, 0.55);

      const pulse = 0.5 + 0.5 * Math.sin(this.time * 4);
      ctx.beginPath();
      ctx.ellipse(
        base.x,
        base.y + 2 * u,
        (24 + pulse * 9) * u,
        (10 + pulse * 4) * u,
        0,
        0,
        Math.PI * 2,
      );
      ctx.strokeStyle = `rgba(227,143,166,${0.5 - pulse * 0.28})`;
      ctx.lineWidth = 2 * u;
      ctx.stroke();
    } else {
      // Ly nhỏ in trái tim
      const cup = this.iso(spot.x + 0.22, spot.y + 0.2, 0.62);
      this.fillRR(cup.x - 4 * u, cup.y - 5 * u, 8 * u, 6 * u, 2 * u, '#FFFDF9', PINK, 1);
      this.heart(cup.x, cup.y - 2.4 * u, 1.9 * u, PINK_DEEP, 0.8);
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
        ? Math.abs(Math.sin(this.time * 9 + c.seed)) * 2.4 * u
        : Math.sin(this.time * 2.2 + c.seed) * 1.2 * u;

    const shirt = SHIRTS[c.id % SHIRTS.length];
    const skin = SKINS[(c.id * 3) % SKINS.length];
    const hair = HAIRS[(c.id * 5) % HAIRS.length];
    const variant = c.id % 4;

    ctx.save();
    ctx.fillStyle = 'rgba(74,50,38,0.14)';
    ctx.beginPath();
    ctx.ellipse(p.x, p.y + 1 * u, 9 * u, 4 * u, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Bàn chân
    this.circle(p.x - 3.6 * u, p.y - 1.2 * u, 2.4 * u, '#6B5344');
    this.circle(p.x + 3.6 * u, p.y - 1.2 * u, 2.4 * u, '#6B5344');

    const bodyW = 15 * u;
    const bodyH = 13 * u;
    const bodyTop = p.y - 16 * u + bob;

    this.fillRR(p.x - bodyW / 2, bodyTop, bodyW, bodyH, 6 * u, shirt, 'rgba(74,58,50,0.16)', 1);
    this.circle(p.x - 8 * u, bodyTop + 6 * u, 2.7 * u, shirt, 'rgba(74,58,50,0.12)', 1);
    this.circle(p.x + 8 * u, bodyTop + 6 * u, 2.7 * u, shirt, 'rgba(74,58,50,0.12)', 1);

    const headR = 9 * u;
    const headY = bodyTop - 4 * u;

    // Tóc phía sau + kiểu tóc
    this.circle(p.x, headY - 0.5 * u, headR + 0.7 * u, hair);
    if (variant === 1) {
      this.circle(p.x, headY - headR - 2.2 * u, 3.6 * u, hair);
    } else if (variant === 2) {
      this.circle(p.x - headR - 2.4 * u, headY + 2 * u, 3.2 * u, hair);
      this.circle(p.x + headR + 2.4 * u, headY + 2 * u, 3.2 * u, hair);
    }

    this.circle(p.x, headY + 1 * u, headR, skin);

    // Mái tóc
    ctx.beginPath();
    ctx.arc(p.x, headY + 1 * u, headR * 0.99, Math.PI * 1.02, Math.PI * 1.98);
    ctx.closePath();
    ctx.fillStyle = hair;
    ctx.fill();

    if (variant === 3) {
      ctx.beginPath();
      ctx.arc(p.x, headY, headR * 1.02, Math.PI, Math.PI * 2);
      ctx.closePath();
      ctx.fillStyle = PINK;
      ctx.fill();
      this.fillRR(p.x - headR, headY - 1 * u, headR * 2, 2.6 * u, 1.3 * u, PINK_DEEP);
    }

    // Mắt long lanh
    this.circle(p.x - 3.2 * u, headY + 2.2 * u, 1.35 * u, INK);
    this.circle(p.x + 3.2 * u, headY + 2.2 * u, 1.35 * u, INK);
    this.circle(p.x - 3.6 * u, headY + 1.8 * u, 0.5 * u, '#FFFFFF');
    this.circle(p.x + 2.8 * u, headY + 1.8 * u, 0.5 * u, '#FFFFFF');

    // Má hồng
    ctx.save();
    ctx.fillStyle = 'rgba(240,150,170,0.5)';
    ctx.beginPath();
    ctx.ellipse(p.x - 5.4 * u, headY + 4.2 * u, 2.4 * u, 1.5 * u, 0, 0, Math.PI * 2);
    ctx.ellipse(p.x + 5.4 * u, headY + 4.2 * u, 2.4 * u, 1.5 * u, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Miệng cười
    ctx.beginPath();
    ctx.arc(p.x, headY + 4.4 * u, 2.1 * u, 0.15 * Math.PI, 0.85 * Math.PI);
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1 * u;
    ctx.lineCap = 'round';
    ctx.stroke();

    if (c.vip) {
      const crownY = headY - headR - 2 * u;
      this.heart(p.x - 5 * u, crownY, 3 * u, BUTTER);
      this.heart(p.x, crownY - 3 * u, 4 * u, '#F2C14E');
      this.heart(p.x + 5 * u, crownY, 3 * u, BUTTER);
    }

    if (c.phase === 'wait' || c.phase === 'ready') {
      const ratio = Math.max(0, Math.min(1, c.patience / c.maxPatience));
      const barW = 24 * u;
      const barY = headY - headR - (c.vip ? 12 * u : 5 * u);
      this.fillRR(p.x - barW / 2 - 1 * u, barY - 1 * u, barW + 2 * u, 5 * u, 2.5 * u, '#FFF9F2');
      this.fillRR(p.x - barW / 2, barY, barW, 3 * u, 1.5 * u, 'rgba(74,58,50,0.12)');
      const color = ratio > 0.5 ? MINT_DEEP : ratio > 0.25 ? BUTTER : PINK_DEEP;
      this.fillRR(p.x - barW / 2, barY, barW * ratio, 3 * u, 1.5 * u, color);
    }

    if (c.phase === 'ready') {
      const bubbleY = headY - headR - 19 * u;
      const pulse = 0.5 + 0.5 * Math.sin(this.time * 4.2 + c.seed);
      const scale = 1 + pulse * 0.03;

      ctx.save();
      ctx.translate(p.x, bubbleY);
      ctx.scale(scale, scale);

      ctx.beginPath();
      ctx.arc(0, 0, 15 * u, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(227,143,166,${0.45 - pulse * 0.25})`;
      ctx.lineWidth = 2.2 * u;
      ctx.stroke();

      this.fillRR(-13 * u, -12 * u, 26 * u, 23 * u, 9 * u, '#FFFDF9', PINK, 1.6);
      ctx.beginPath();
      ctx.moveTo(-3 * u, 10 * u);
      ctx.lineTo(3 * u, 10 * u);
      ctx.lineTo(0, 15 * u);
      ctx.closePath();
      ctx.fillStyle = '#FFFDF9';
      ctx.fill();
      ctx.strokeStyle = PINK;
      ctx.lineWidth = 1.2;
      ctx.stroke();

      // Ly có mặt cười
      this.fillRR(-7 * u, -4 * u, 14 * u, 11 * u, 3.5 * u, PINK, PINK_DEEP, 1);
      ctx.beginPath();
      ctx.ellipse(0, -4 * u, 7 * u, 2.8 * u, 0, 0, Math.PI * 2);
      ctx.fillStyle = '#FFF3E2';
      ctx.fill();
      this.circle(-3 * u, 1 * u, 0.9 * u, INK);
      this.circle(3 * u, 1 * u, 0.9 * u, INK);
      ctx.beginPath();
      ctx.arc(0, 2.2 * u, 2 * u, 0.12 * Math.PI, 0.88 * Math.PI);
      ctx.strokeStyle = INK;
      ctx.lineWidth = 1 * u;
      ctx.stroke();
      this.heart(9 * u, -8 * u, 2.8 * u, PINK_DEEP, 0.9);
      ctx.restore();
    }

    this.hits.push({
      id: c.id,
      x: p.x,
      y: p.y - 20 * u,
      r: 32 * u,
      ready: c.phase === 'ready',
    });
  }

  private drawStaff(x: number, y: number, role: 'waiter' | 'barista'): void {
    const ctx = this.ctx;
    const u = this.cam.unit;
    const p = this.iso(x, y);
    const bob = this.reduced ? 0 : Math.sin(this.time * 2 + x) * 1.1 * u;

    ctx.save();
    ctx.fillStyle = 'rgba(74,50,38,0.13)';
    ctx.beginPath();
    ctx.ellipse(p.x, p.y + 1 * u, 9 * u, 4 * u, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    this.circle(p.x - 3.4 * u, p.y - 1.2 * u, 2.2 * u, '#6B5344');
    this.circle(p.x + 3.4 * u, p.y - 1.2 * u, 2.2 * u, '#6B5344');

    const bodyTop = p.y - 17 * u + bob;
    this.fillRR(p.x - 8 * u, bodyTop, 16 * u, 14 * u, 6.5 * u, MINT, 'rgba(74,58,50,0.16)', 1);
    this.fillRR(p.x - 5.5 * u, bodyTop + 5 * u, 11 * u, 9 * u, 3 * u, CREAM);

    const headR = 9 * u;
    const headY = bodyTop - 4 * u;

    this.circle(p.x, headY - 0.5 * u, headR + 0.7 * u, '#5B3A2A');
    this.circle(p.x, headY + 1 * u, headR, '#F3C39A');

    ctx.beginPath();
    ctx.arc(p.x, headY + 1 * u, headR * 0.99, Math.PI * 1.02, Math.PI * 1.98);
    ctx.closePath();
    ctx.fillStyle = '#5B3A2A';
    ctx.fill();

    // Khăn trùm đầu xinh xinh
    ctx.beginPath();
    ctx.arc(p.x, headY - 0.6 * u, headR * 1.03, Math.PI * 1.03, Math.PI * 1.97);
    ctx.closePath();
    ctx.fillStyle = PINK;
    ctx.fill();
    this.circle(p.x, headY - headR * 0.95, 2 * u, PINK_DEEP);

    this.circle(p.x - 3.2 * u, headY + 2.2 * u, 1.2 * u, INK);
    this.circle(p.x + 3.2 * u, headY + 2.2 * u, 1.2 * u, INK);
    this.circle(p.x - 3.6 * u, headY + 1.8 * u, 0.45 * u, '#FFFFFF');
    this.circle(p.x + 2.8 * u, headY + 1.8 * u, 0.45 * u, '#FFFFFF');
    ctx.save();
    ctx.fillStyle = 'rgba(240,150,170,0.45)';
    ctx.beginPath();
    ctx.ellipse(p.x - 5.4 * u, headY + 4.2 * u, 2.2 * u, 1.3 * u, 0, 0, Math.PI * 2);
    ctx.ellipse(p.x + 5.4 * u, headY + 4.2 * u, 2.2 * u, 1.3 * u, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.beginPath();
    ctx.arc(p.x, headY + 4.4 * u, 1.9 * u, 0.15 * Math.PI, 0.85 * Math.PI);
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1 * u;
    ctx.stroke();

    if (role === 'waiter') {
      this.fillRR(p.x - 14 * u, bodyTop + 10 * u, 17 * u, 3 * u, 1.5 * u, WOOD, 'rgba(74,50,38,0.22)', 1);
      this.fillRR(p.x - 11 * u, bodyTop + 4 * u, 4.5 * u, 5.5 * u, 1.4 * u, CREAM, PINK, 1);
      this.heart(p.x - 8.7 * u, bodyTop + 6.4 * u, 1.2 * u, PINK_DEEP, 0.9);
    } else {
      this.fillRR(p.x + 4 * u, bodyTop + 7 * u, 5 * u, 6 * u, 1.6 * u, CREAM, PINK, 1);
      this.heart(p.x + 6.5 * u, bodyTop + 9.5 * u, 1.3 * u, PINK_DEEP, 0.9);
    }
  }

  private drawPlant(x: number, y: number): void {
    const ctx = this.ctx;
    const u = this.cam.unit;
    const p = this.iso(x, y);
    ctx.save();
    ctx.fillStyle = 'rgba(74,50,38,0.12)';
    ctx.beginPath();
    ctx.ellipse(p.x, p.y + 2 * u, 15 * u, 6 * u, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    this.isoBox(
      x - 0.28,
      y - 0.28,
      x + 0.28,
      y + 0.28,
      0,
      0.42,
      '#F0B49C',
      '#DFA08A',
      '#C98A75',
      'rgba(74,50,38,0.16)',
    );
    const base = this.iso(x, y, 0.42);
    ctx.strokeStyle = MINT_DEEP;
    ctx.lineWidth = 2 * u;
    ctx.lineCap = 'round';
    const leaves: { dx: number; dy: number; rot: number; flower: boolean }[] = [
      { dx: 0, dy: -17, rot: 0, flower: true },
      { dx: -9, dy: -12, rot: -0.7, flower: false },
      { dx: 9, dy: -13, rot: 0.7, flower: true },
      { dx: -4, dy: -23, rot: -0.3, flower: false },
      { dx: 6, dy: -24, rot: 0.4, flower: false },
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
      ctx.fillStyle = '#79AF8C';
      ctx.fill();
      ctx.restore();
      if (leaf.flower) this.flower(lx, ly - 3 * u, 3 * u, PINK);
    }
  }

  private drawCat(x: number, y: number): void {
    const ctx = this.ctx;
    const u = this.cam.unit;
    const p = this.iso(x, y);
    const breathe = this.reduced ? 0 : Math.sin(this.time * 1.7) * 0.7 * u;

    // Đệm
    ctx.beginPath();
    ctx.ellipse(p.x, p.y, 17 * u, 7.5 * u, 0, 0, Math.PI * 2);
    ctx.fillStyle = PINK_SOFT;
    ctx.fill();
    ctx.strokeStyle = PINK;
    ctx.lineWidth = 1.4;
    ctx.stroke();
    this.circle(p.x - 9 * u, p.y - 1 * u, 0.9 * u, PINK_DEEP, undefined);
    this.circle(p.x + 8 * u, p.y + 1 * u, 0.9 * u, PINK_DEEP, undefined);

    // Thân mèo cuộn tròn
    ctx.beginPath();
    ctx.ellipse(p.x + 3 * u, p.y - 6 * u + breathe, 11 * u, 7 * u, -0.12, 0, Math.PI * 2);
    ctx.fillStyle = '#F2C08E';
    ctx.fill();
    ctx.strokeStyle = 'rgba(183,122,70,0.5)';
    ctx.lineWidth = 1;
    ctx.stroke();

    // Vằn
    ctx.strokeStyle = 'rgba(200,140,85,0.65)';
    ctx.lineWidth = 1.2 * u;
    for (let i = 0; i < 2; i += 1) {
      ctx.beginPath();
      ctx.arc(p.x + 4 * u + i * 3 * u, p.y - 7 * u + breathe, 3 * u, -0.9, 0.2);
      ctx.stroke();
    }

    // Đuôi
    const wag = Math.sin(this.time * 2.1) * 3 * u;
    ctx.beginPath();
    ctx.moveTo(p.x + 12 * u, p.y - 5 * u);
    ctx.quadraticCurveTo(p.x + 17 * u, p.y - 1 * u, p.x + 13 * u + wag * 0.3, p.y + 1 * u);
    ctx.strokeStyle = '#E7A96F';
    ctx.lineWidth = 3.4 * u;
    ctx.lineCap = 'round';
    ctx.stroke();

    // Đầu
    const headX = p.x - 8 * u;
    const headY = p.y - 11 * u + breathe;
    const headR = 6.8 * u;

    // Tai
    ctx.beginPath();
    ctx.moveTo(headX - headR * 0.85, headY - headR * 0.5);
    ctx.lineTo(headX - headR * 1.05, headY - headR * 1.5);
    ctx.lineTo(headX - headR * 0.15, headY - headR * 0.95);
    ctx.closePath();
    ctx.fillStyle = '#F2C08E';
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(headX + headR * 0.85, headY - headR * 0.5);
    ctx.lineTo(headX + headR * 1.05, headY - headR * 1.5);
    ctx.lineTo(headX + headR * 0.15, headY - headR * 0.95);
    ctx.closePath();
    ctx.fill();

    this.circle(headX, headY, headR, '#F7CFA2', 'rgba(183,122,70,0.45)', 1);

    // Mắt nhắm + miệng
    ctx.strokeStyle = '#7A5540';
    ctx.lineWidth = 1.1 * u;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(headX - 2.4 * u, headY, 1.3 * u, 0.15 * Math.PI, 0.85 * Math.PI);
    ctx.arc(headX + 2.4 * u, headY, 1.3 * u, 0.15 * Math.PI, 0.85 * Math.PI);
    ctx.stroke();
    this.circle(headX, headY + 1.6 * u, 0.9 * u, '#E38FA6');
    ctx.beginPath();
    ctx.arc(headX - 0.9 * u, headY + 2.6 * u, 1.1 * u, 0, Math.PI * 0.8);
    ctx.arc(headX + 0.9 * u, headY + 2.6 * u, 1.1 * u, Math.PI * 0.2, Math.PI);
    ctx.stroke();

    // Má hồng
    ctx.fillStyle = 'rgba(240,150,170,0.45)';
    ctx.beginPath();
    ctx.ellipse(headX - 4.6 * u, headY + 2.6 * u, 1.6 * u, 1 * u, 0, 0, Math.PI * 2);
    ctx.ellipse(headX + 4.6 * u, headY + 2.6 * u, 1.6 * u, 1 * u, 0, 0, Math.PI * 2);
    ctx.fill();

    // zzz
    ctx.save();
    ctx.globalAlpha = 0.4 + Math.sin(this.time * 1.6) * 0.2;
    ctx.fillStyle = '#8A7566';
    ctx.font = `700 ${Math.round(9 * u)}px 'Baloo 2', system-ui, sans-serif`;
    ctx.fillText('z', headX + 8 * u, headY - 7 * u);
    ctx.font = `700 ${Math.round(7 * u)}px 'Baloo 2', system-ui, sans-serif`;
    ctx.fillText('z', headX + 11 * u, headY - 12 * u);
    ctx.restore();
  }

  private drawLamp(x: number, y: number): void {
    const ctx = this.ctx;
    const u = this.cam.unit;
    const p = this.iso(x, y, 2.6);
    ctx.strokeStyle = 'rgba(111,78,55,0.3)';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(p.x, 0);
    ctx.lineTo(p.x, p.y - 12 * u);
    ctx.stroke();

    const glow = ctx.createRadialGradient(p.x, p.y + 6 * u, 0, p.x, p.y + 6 * u, 74 * u);
    glow.addColorStop(0, 'rgba(255,222,160,0.32)');
    glow.addColorStop(1, 'rgba(255,222,160,0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(p.x, p.y + 6 * u, 74 * u, 0, Math.PI * 2);
    ctx.fill();

    ctx.beginPath();
    ctx.arc(p.x, p.y + 8 * u, 15 * u, Math.PI, 0);
    ctx.closePath();
    ctx.fillStyle = PINK_SOFT;
    ctx.fill();
    ctx.strokeStyle = PINK;
    ctx.lineWidth = 1.4;
    ctx.stroke();

    for (let i = 0; i < 5; i += 1) {
      this.circle(p.x - 11 * u + i * 5.5 * u, p.y + 9 * u, 2.4 * u, '#FFF9F2', PINK, 1);
    }
    this.heart(p.x, p.y + 2 * u, 3 * u, PINK_DEEP, 0.7);
  }

  /* ------------------------------ FX -------------------------------- */

  private seedDust(): void {
    if (this.reduced) return;
    for (let i = 0; i < 18; i += 1) {
      const heart = i % 3 === 0;
      this.particles.push({
        x: Math.random() * this.W,
        y: Math.random() * this.H,
        vx: (Math.random() - 0.5) * 6,
        vy: -4 - Math.random() * 8,
        life: 4 + Math.random() * 6,
        max: 10,
        size: heart ? 2.2 + Math.random() * 1.6 : 0.8 + Math.random() * 1.8,
        color: heart ? 'rgba(245,187,201,0.5)' : 'rgba(255,255,255,0.75)',
        kind: heart ? 'heart' : 'dust',
      });
    }
  }

  private pullFx(state: GameState): void {
    if (state.fx.length === 0) return;
    const list = state.fx.splice(0, state.fx.length);
    for (const fx of list) {
      const p = this.iso(fx.x, fx.y, 0.9);
      if (fx.kind === 'coin') {
        const count = this.reduced ? 3 : 6;
        for (let i = 0; i < count; i += 1) {
          this.particles.push({
            x: p.x + (Math.random() - 0.5) * 18,
            y: p.y + (Math.random() - 0.5) * 10,
            vx: (Math.random() - 0.5) * 90,
            vy: -70 - Math.random() * 90,
            life: 0.9,
            max: 0.9,
            size: 2.2 + Math.random() * 2,
            color: Math.random() > 0.35 ? '#F2C14E' : '#F8DFA8',
            kind: 'coin',
          });
        }
        const hearts = this.reduced ? 1 : 3;
        for (let i = 0; i < hearts; i += 1) {
          this.particles.push({
            x: p.x + (Math.random() - 0.5) * 22,
            y: p.y + (Math.random() - 0.5) * 12,
            vx: (Math.random() - 0.5) * 46,
            vy: -50 - Math.random() * 40,
            life: 1.2,
            max: 1.2,
            size: 2.8 + Math.random() * 2.2,
            color: i % 2 === 0 ? PINK_DEEP : PINK,
            kind: 'heart',
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
      else if (p.kind === 'heart') {
        p.vx += Math.sin(this.time * 2 + p.y * 0.05) * 8 * dt;
        p.vy += 8 * dt;
      } else {
        p.vx += (Math.random() - 0.5) * 4 * dt;
        p.vy -= 1.5 * dt;
      }
    }
    this.particles = this.particles.filter((p) => p.life > 0);

    if (!this.reduced) {
      const dust = this.particles.filter((p) => p.kind === 'dust').length;
      if (dust < 12) {
        this.particles.push({
          x: Math.random() * this.W,
          y: this.H + 10,
          vx: (Math.random() - 0.5) * 5,
          vy: -6 - Math.random() * 8,
          life: 7 + Math.random() * 5,
          max: 12,
          size: 0.8 + Math.random() * 1.6,
          color: 'rgba(255,255,255,0.7)',
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
      if (p.kind === 'heart') {
        this.heart(p.x, p.y, p.size, p.color, alpha * 0.85);
        continue;
      }
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
      ctx.strokeStyle = 'rgba(255,250,242,0.92)';
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
      ctx.fillStyle = `rgba(255,170,140,${0.02 + t * 0.08})`;
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
    vignette.addColorStop(1, 'rgba(74,50,38,0.2)');
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
