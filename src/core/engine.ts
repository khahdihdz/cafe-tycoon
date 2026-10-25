import {
  BASE_PATIENCE,
  BOOST_COOLDOWN,
  DAY_LENGTH,
  DOOR,
  DRINKS,
  EVENTS,
  MAX_STAFF,
  RENT,
  SPAWN_INTERVAL,
  STAFF_BASE,
  TABLE_SPOTS,
  UPGRADES,
  WAGES,
  WAITER_SERVE_INTERVAL,
  WALK_SPEED,
  getDrink,
  type EventDef,
} from './config';
import type {
  ActiveEvent,
  Customer,
  DayReport,
  DrinkId,
  GameState,
  StaffRole,
  UpgradeId,
  Vec,
} from './types';

const SAVE_VERSION = 1;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function createState(): GameState {
  return {
    version: SAVE_VERSION,
    phase: 'title',
    paused: false,
    speed: 1,
    day: 1,
    clock: 0,
    money: 120,
    rep: 20,
    repStart: 20,
    served: 0,
    lost: 0,
    revenue: 0,
    tips: 0,
    ingredientCost: 0,
    upgrades: { machine: 0, tables: 0, decor: 0, marketing: 0 },
    unlocked: ['espresso', 'croissant'],
    staff: { waiter: 0, barista: 0 },
    customers: [],
    brews: [],
    events: [],
    toasts: [],
    fx: [],
    spawnTimer: 3,
    eventTimer: 26,
    waiterCd: 0,
    boostCd: 0,
    vipNext: false,
    nextId: 1,
    dayStats: {},
    lastReport: null,
    totals: { days: 0, served: 0, profit: 0 },
  };
}

/* ------------------------------------------------------------------ */
/*  Chỉ số dẫn xuất                                                    */
/* ------------------------------------------------------------------ */

export function tableCount(s: GameState): number {
  return 3 + s.upgrades.tables;
}

export function hasEvent(s: GameState, id: string): boolean {
  return s.events.some((e) => e.id === id);
}

export function brewSpeed(s: GameState): number {
  let v = 1 + 0.3 * s.upgrades.machine;
  v *= 1 + 0.35 * s.staff.barista;
  if (hasEvent(s, 'broken')) v *= 0.5;
  return v;
}

export function patienceMult(s: GameState): number {
  return 1 + 0.13 * s.upgrades.decor;
}

export function tipRate(s: GameState): number {
  return 0.1 + 0.05 * s.upgrades.decor;
}

function dayCurve(t: number): number {
  const rushA = 0.5 * Math.exp(-(((t - 0.32) / 0.13) ** 2));
  const rushB = 0.62 * Math.exp(-(((t - 0.75) / 0.11) ** 2));
  return 0.82 + rushA + rushB;
}

export function spawnMultiplier(s: GameState): number {
  const rep = clamp(s.rep / 100, 0, 1);
  let m = 0.7 + rep * 1.1 + s.upgrades.marketing * 0.2;
  m *= dayCurve(clamp(s.clock / DAY_LENGTH, 0, 1));
  if (hasEvent(s, 'rain')) m *= 0.55;
  if (hasEvent(s, 'tourists')) m *= 1.7;
  return clamp(m, 0.25, 3.4);
}

export function upgradeCost(s: GameState, id: UpgradeId): number {
  const def = UPGRADES[id];
  const level = s.upgrades[id];
  if (level >= def.max) return Infinity;
  return Math.round(def.base * Math.pow(def.growth, level));
}

export function hireCost(s: GameState, role: StaffRole): number {
  return Math.round(STAFF_BASE[role] * Math.pow(2.15, s.staff[role]));
}

export function dailyFixedCost(s: GameState): number {
  return RENT + s.staff.waiter * WAGES.waiter + s.staff.barista * WAGES.barista;
}

/* ------------------------------------------------------------------ */
/*  Vòng đời ngày                                                      */
/* ------------------------------------------------------------------ */

export function startDay(s: GameState): void {
  if (s.phase === 'open') return;
  s.phase = 'open';
  s.paused = false;
  s.clock = 0;
  s.repStart = s.rep;
  s.served = 0;
  s.lost = 0;
  s.revenue = 0;
  s.tips = 0;
  s.ingredientCost = 0;
  s.customers = [];
  s.brews = [];
  s.events = [];
  s.fx = [];
  s.dayStats = {};
  s.spawnTimer = 1.2;
  s.eventTimer = 24 + Math.random() * 10;
  s.waiterCd = 0;
  s.boostCd = 0;
  s.vipNext = Math.random() < 0.16;
  pushToast(s, `Ngày ${s.day} — mở cửa quán!`, 'info');
  if (s.day === 1) {
    pushToast(s, 'Bấm vào khách có ly ☕ để phục vụ và nhận thêm tip.', 'good');
  }
  spawnCustomer(s);
}

export function endDay(s: GameState): DayReport {
  const wages = s.staff.waiter * WAGES.waiter + s.staff.barista * WAGES.barista;
  const profit = s.revenue + s.tips - s.ingredientCost - wages - RENT;
  s.money -= wages + RENT;
  s.phase = 'report';
  s.paused = false;
  s.clock = DAY_LENGTH;

  let bestDrink: DrinkId | null = null;
  let bestCount = 0;
  for (const [id, count] of Object.entries(s.dayStats)) {
    if ((count ?? 0) > bestCount) {
      bestCount = count ?? 0;
      bestDrink = id as DrinkId;
    }
  }

  const report: DayReport = {
    day: s.day,
    revenue: s.revenue,
    tips: s.tips,
    ingredientCost: s.ingredientCost,
    wages,
    rent: RENT,
    profit,
    served: s.served,
    lost: s.lost,
    repStart: s.repStart,
    repEnd: s.rep,
    bestDrink,
  };

  s.lastReport = report;
  s.totals.days += 1;
  s.totals.served += s.served;
  s.totals.profit += profit;
  s.customers = [];
  s.brews = [];
  s.events = [];
  s.fx = [];
  s.toasts = [];
  return report;
}

export function nextDay(s: GameState): void {
  if (s.phase === 'report') s.day += 1;
  startDay(s);
}

/* ------------------------------------------------------------------ */
/*  Tick                                                               */
/* ------------------------------------------------------------------ */

export function tick(s: GameState, dtRaw: number): void {
  if (s.phase !== 'open' || s.paused) return;
  const dt = Math.min(dtRaw, 0.25) * s.speed;
  s.clock += dt;
  s.boostCd = Math.max(0, s.boostCd - dt);

  if (s.clock >= DAY_LENGTH) {
    endDay(s);
    return;
  }

  s.events = s.events.filter((e) => e.until > s.clock);

  s.eventTimer -= dt;
  if (s.eventTimer <= 0) {
    rollEvent(s);
    s.eventTimer = 26 + Math.random() * 14;
  }

  // Khách
  for (const c of s.customers) {
    if (c.phase === 'walk') {
      if (move(c, dt * WALK_SPEED)) {
        c.phase = 'wait';
        startBrew(s, c);
      }
    } else if (c.phase === 'leaving') {
      move(c, dt * WALK_SPEED);
    } else {
      c.patience -= dt;
      if (c.patience <= 0) {
        loseCustomer(s, c);
      }
    }
  }
  s.customers = s.customers.filter((c) => c.phase !== 'leaving' || c.path.length > 0);

  // Máy pha: hàng đợi tuần tự, nâng cấp máy/barista để nhanh hơn
  if (s.brews.length > 0) {
    const brew = s.brews[0];
    brew.remaining -= dt * brewSpeed(s);
    if (brew.remaining <= 0) completeBrew(s);
  }

  // Nhân viên phục vụ tự động
  if (s.staff.waiter > 0) {
    s.waiterCd -= dt;
    if (s.waiterCd <= 0) {
      const target = s.customers.find((c) => c.phase === 'ready');
      if (target) {
        serve(s, target, false);
        s.waiterCd = Math.max(0.7, WAITER_SERVE_INTERVAL - 0.3 * (s.staff.waiter - 1));
      } else {
        s.waiterCd = 0.2;
      }
    }
  }

  // Sinh khách
  s.spawnTimer -= dt * spawnMultiplier(s);
  if (s.spawnTimer <= 0) {
    spawnCustomer(s);
    s.spawnTimer = SPAWN_INTERVAL * (0.8 + Math.random() * 0.4);
  }
}

/* ------------------------------------------------------------------ */
/*  Hành động của người chơi                                           */
/* ------------------------------------------------------------------ */

export function serveCustomer(s: GameState, id: number): boolean {
  const c = s.customers.find((x) => x.id === id);
  if (!c) return false;
  return serve(s, c, true);
}

export function boost(s: GameState): boolean {
  if (s.phase !== 'open' || s.boostCd > 0 || s.brews.length === 0) return false;
  s.boostCd = BOOST_COOLDOWN;
  const brew = s.brews[0];
  brew.remaining = 0;
  completeBrew(s);
  pushFx(s, 'text', 2.8, 1.4, 'Pha nhanh!');
  return true;
}

export function buyUpgrade(s: GameState, id: UpgradeId): boolean {
  if (s.phase === 'title') return false;
  const cost = upgradeCost(s, id);
  if (!Number.isFinite(cost) || s.money < cost) return false;
  s.money -= cost;
  s.upgrades[id] += 1;
  pushToast(s, `${UPGRADES[id].name} lên cấp ${s.upgrades[id]}`, 'good');
  return true;
}

export function unlockDrink(s: GameState, id: DrinkId): boolean {
  if (s.phase === 'title') return false;
  if (s.unlocked.includes(id)) return false;
  const def = getDrink(id);
  if (s.rep < def.rep || s.money < def.unlock) return false;
  s.money -= def.unlock;
  s.unlocked.push(id);
  pushToast(s, `Đã thêm ${def.name} vào thực đơn`, 'good');
  return true;
}

export function hireStaff(s: GameState, role: StaffRole): boolean {
  if (s.phase === 'title') return false;
  if (s.staff[role] >= MAX_STAFF) return false;
  const cost = hireCost(s, role);
  if (s.money < cost) return false;
  s.money -= cost;
  s.staff[role] += 1;
  pushToast(s, `Đã thuê thêm ${role === 'waiter' ? 'nhân viên phục vụ' : 'barista'}`, 'good');
  return true;
}

/* ------------------------------------------------------------------ */
/*  Nội bộ                                                             */
/* ------------------------------------------------------------------ */

function pushToast(s: GameState, text: string, tone: 'good' | 'warn' | 'info'): void {
  s.toasts.push({ id: s.nextId++, text, tone });
  if (s.toasts.length > 4) s.toasts.shift();
}

function pushFx(s: GameState, kind: 'coin' | 'text', x: number, y: number, text?: string): void {
  s.fx.push({ kind, x, y, text, seed: Math.random() * 1000 });
  if (s.fx.length > 20) s.fx.shift();
}

function move(c: Customer, amount: number): boolean {
  let left = amount;
  while (left > 0 && c.path.length > 0) {
    const wp = c.path[0];
    const dx = wp.x - c.x;
    const dy = wp.y - c.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 1e-4) {
      c.path.shift();
      continue;
    }
    if (dist <= left) {
      c.x = wp.x;
      c.y = wp.y;
      c.path.shift();
      left -= dist;
    } else {
      c.x += (dx / dist) * left;
      c.y += (dy / dist) * left;
      left = 0;
    }
  }
  return c.path.length === 0;
}

function exitPath(x: number, y: number): Vec[] {
  return [
    { x: 1.15, y: 2.75 },
    { x: DOOR.x, y: DOOR.y },
    { x: -0.9, y: DOOR.y - 0.1 },
  ].filter((p) => Math.hypot(p.x - x, p.y - y) > 0.05);
}

function startBrew(s: GameState, c: Customer): void {
  const def = getDrink(c.drink);
  const multiplier = hasEvent(s, 'supplier') ? 0 : 1;
  const cost = Math.round(def.cost * multiplier);
  s.money -= cost;
  s.ingredientCost += cost;
  s.brews.push({
    customerId: c.id,
    drink: c.drink,
    remaining: def.brew,
    total: def.brew,
  });
}

function completeBrew(s: GameState): void {
  const brew = s.brews.shift();
  if (!brew) return;
  const customer = s.customers.find((c) => c.id === brew.customerId);
  if (customer && customer.phase === 'wait') {
    customer.phase = 'ready';
    customer.patience = Math.max(customer.patience, 4);
  }
}

function serve(s: GameState, c: Customer, byPlayer: boolean): boolean {
  if (c.phase !== 'ready') return false;
  const def = getDrink(c.drink);
  const price = Math.round(def.price * (c.vip ? 3 : 1));
  const tip = byPlayer ? Math.round(price * tipRate(s)) + (c.vip ? 8 : 0) : 0;

  s.money += price + tip;
  s.revenue += price;
  s.tips += tip;
  s.served += 1;
  s.dayStats[c.drink] = (s.dayStats[c.drink] ?? 0) + 1;
  s.rep = Math.min(100, s.rep + (c.vip ? 2 : 0.55));

  pushFx(s, 'text', c.x, c.y, `+$${price + tip}`);
  pushFx(s, 'coin', c.x, c.y);
  if (c.vip) pushToast(s, 'Khách VIP hài lòng, danh tiếng tăng mạnh!', 'good');

  c.phase = 'leaving';
  c.path = exitPath(c.x, c.y);
  return true;
}

function loseCustomer(s: GameState, c: Customer): void {
  const wasReady = c.phase === 'ready';
  s.lost += 1;
  s.rep = Math.max(0, s.rep - 1.8);
  s.brews = s.brews.filter((b) => b.customerId !== c.id);
  pushToast(
    s,
    wasReady ? 'Khách bỏ đi vì chờ phục vụ quá lâu' : 'Khách rời quán vì chờ đồ uống quá lâu',
    'warn',
  );
  c.phase = 'leaving';
  c.path = exitPath(c.x, c.y);
}

function pickDrink(s: GameState): DrinkId {
  const pool = DRINKS.filter((d) => s.unlocked.includes(d.id));
  const total = pool.reduce((sum, d) => sum + d.popularity, 0);
  let roll = Math.random() * total;
  for (const d of pool) {
    roll -= d.popularity;
    if (roll <= 0) return d.id;
  }
  return pool[0]?.id ?? 'espresso';
}

function spawnCustomer(s: GameState): void {
  const occupied = new Set(
    s.customers.filter((c) => c.phase !== 'leaving').map((c) => c.table),
  );
  const free: number[] = [];
  for (let i = 0; i < tableCount(s); i += 1) {
    if (!occupied.has(i)) free.push(i);
  }
  if (free.length === 0) {
    s.lost += 1;
    s.rep = Math.max(0, s.rep - 0.5);
    pushToast(s, 'Hết bàn trống — nâng cấp thêm bàn để đón khách', 'warn');
    return;
  }

  const index = free[Math.floor(Math.random() * free.length)];
  const spot = TABLE_SPOTS[index] ?? TABLE_SPOTS[0];
  const drink = pickDrink(s);
  const vip = s.vipNext;
  s.vipNext = false;
  const patience = BASE_PATIENCE * patienceMult(s) * (0.85 + Math.random() * 0.3);

  const customer: Customer = {
    id: s.nextId++,
    x: DOOR.x,
    y: DOOR.y,
    path: [
      { x: 1.15, y: 2.75 },
      { x: spot.x - 0.72, y: spot.y + 0.4 },
    ],
    table: index,
    drink,
    patience,
    maxPatience: patience,
    phase: 'walk',
    vip,
    seed: Math.random() * 100,
  };
  s.customers.push(customer);
}

function rollEvent(s: GameState): void {
  const available = EVENTS.filter((e) => {
    if (hasEvent(s, e.id)) return false;
    if (e.id === 'supplier' && hasEvent(s, 'supplier')) return false;
    if (e.id === 'vip' && s.vipNext) return false;
    return true;
  });
  if (available.length === 0) return;

  const total = available.reduce((sum, e) => sum + e.weight, 0);
  let roll = Math.random() * total;
  let picked: EventDef = available[0];
  for (const e of available) {
    roll -= e.weight;
    if (roll <= 0) {
      picked = e;
      break;
    }
  }

  if (picked.id === 'vip') {
    s.vipNext = true;
  } else if (picked.id === 'supplier') {
    const event: ActiveEvent = { id: picked.id, name: picked.name, until: DAY_LENGTH };
    s.events.push(event);
  } else {
    s.events.push({ id: picked.id, name: picked.name, until: s.clock + picked.duration });
  }

  pushToast(s, `${picked.name}: ${picked.text}`, picked.tone);
}
