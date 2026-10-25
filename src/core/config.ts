import type { DrinkId, StaffRole, UpgradeId, Vec } from './types';

export interface DrinkDef {
  id: DrinkId;
  name: string;
  emoji: string;
  cost: number;
  price: number;
  brew: number;
  popularity: number;
  rep: number;
  unlock: number;
  note: string;
}

export const DRINKS: DrinkDef[] = [
  {
    id: 'espresso',
    name: 'Espresso',
    emoji: '☕',
    cost: 3,
    price: 12,
    brew: 2.2,
    popularity: 3,
    rep: 0,
    unlock: 0,
    note: 'Ly nhỏ, pha nhanh, khách nào cũng gọi.',
  },
  {
    id: 'croissant',
    name: 'Croissant',
    emoji: '🥐',
    cost: 4,
    price: 15,
    brew: 1.2,
    popularity: 2,
    rep: 0,
    unlock: 0,
    note: 'Bánh nướng sẵn, thời gian phục vụ rất ngắn.',
  },
  {
    id: 'latte',
    name: 'Latte sữa',
    emoji: '🥛',
    cost: 5,
    price: 19,
    brew: 2.8,
    popularity: 2.8,
    rep: 0,
    unlock: 90,
    note: 'Món chủ lực, giá tốt, khách rất thích.',
  },
  {
    id: 'coldbrew',
    name: 'Cold Brew',
    emoji: '🧊',
    cost: 6,
    price: 24,
    brew: 2.4,
    popularity: 2.1,
    rep: 10,
    unlock: 240,
    note: 'Đồ uống lạnh, biên lợi nhuận cao.',
  },
  {
    id: 'matcha',
    name: 'Matcha Latte',
    emoji: '🍵',
    cost: 7,
    price: 27,
    brew: 3.2,
    popularity: 1.7,
    rep: 18,
    unlock: 420,
    note: 'Món "sống ảo" giúp danh tiếng tăng nhanh.',
  },
  {
    id: 'signature',
    name: 'Signature Cafe',
    emoji: '✨',
    cost: 10,
    price: 44,
    brew: 4,
    popularity: 1.1,
    rep: 35,
    unlock: 1500,
    note: 'Công thức riêng, khách VIP chuộng món này.',
  },
];

export const DRINK_MAP = Object.fromEntries(DRINKS.map((d) => [d.id, d])) as Record<DrinkId, DrinkDef>;

export function getDrink(id: DrinkId): DrinkDef {
  return DRINK_MAP[id] ?? DRINKS[0];
}

export interface UpgradeDef {
  id: UpgradeId;
  name: string;
  emoji: string;
  base: number;
  growth: number;
  max: number;
  desc: string;
}

export const UPGRADES: Record<UpgradeId, UpgradeDef> = {
  machine: {
    id: 'machine',
    name: 'Máy pha cà phê',
    emoji: '⚙️',
    base: 110,
    growth: 1.85,
    max: 5,
    desc: 'Tăng tốc độ pha chế',
  },
  tables: {
    id: 'tables',
    name: 'Bàn phục vụ',
    emoji: '🪑',
    base: 170,
    growth: 2,
    max: 3,
    desc: 'Thêm chỗ cho khách',
  },
  decor: {
    id: 'decor',
    name: 'Trang trí quán',
    emoji: '🖼️',
    base: 140,
    growth: 1.8,
    max: 5,
    desc: 'Khách kiên nhẫn hơn, tiền tip cao hơn',
  },
  marketing: {
    id: 'marketing',
    name: 'Quảng cáo',
    emoji: '📣',
    base: 160,
    growth: 1.9,
    max: 5,
    desc: 'Kéo thêm khách đến quán',
  },
};

export interface EventDef {
  id: string;
  name: string;
  text: string;
  duration: number;
  weight: number;
  tone: 'good' | 'warn' | 'info';
}

export const EVENTS: EventDef[] = [
  {
    id: 'rain',
    name: 'Mưa rào',
    text: 'Mưa lớn, khách thưa hơn trong 18 giây.',
    duration: 18,
    weight: 3,
    tone: 'warn',
  },
  {
    id: 'tourists',
    name: 'Đoàn khách du lịch',
    text: 'Đoàn khách ghé qua, khách đến đông hơn trong 14 giây.',
    duration: 14,
    weight: 3,
    tone: 'info',
  },
  {
    id: 'broken',
    name: 'Máy pha bị kẹt',
    text: 'Máy pha chạy chậm lại trong 12 giây.',
    duration: 12,
    weight: 2,
    tone: 'warn',
  },
  {
    id: 'supplier',
    name: 'Nguyên liệu giảm giá',
    text: 'Nhà cung cấp giảm giá, nguyên liệu miễn phí hôm nay.',
    duration: 0,
    weight: 2,
    tone: 'good',
  },
  {
    id: 'vip',
    name: 'Khách VIP ghé thăm',
    text: 'Vị khách tiếp theo sẽ trả gấp 3 lần giá menu.',
    duration: 0,
    weight: 2,
    tone: 'good',
  },
];

/* ---------- Thế giới ---------- */

export const DAY_LENGTH = 90;
export const OPEN_HOUR = 8;
export const CLOSE_HOUR = 22;
export const RENT = 30;
export const START_MONEY = 120;
export const BASE_PATIENCE = 19;
export const SPAWN_INTERVAL = 6.2;
export const WALK_SPEED = 1.9;
export const WAITER_SERVE_INTERVAL = 1.5;
export const BOOST_COOLDOWN = 15;
export const MAX_STAFF = 2;

export const WAGES: Record<StaffRole, number> = { waiter: 55, barista: 70 };
export const STAFF_BASE: Record<StaffRole, number> = { waiter: 180, barista: 240 };
export const STAFF_NAMES: Record<StaffRole, string> = {
  waiter: 'Nhân viên phục vụ',
  barista: 'Barista',
};
export const STAFF_EMOJI: Record<StaffRole, string> = { waiter: '🧑‍🍳', barista: '👩‍🍳' };

export const ROOM = { w: 8, d: 6 };

export const DOOR: Vec = { x: 0.35, y: 2.2 };

export const TABLE_SPOTS: Vec[] = [
  { x: 2.1, y: 3.2 },
  { x: 4.0, y: 3.2 },
  { x: 5.9, y: 3.2 },
  { x: 2.1, y: 4.8 },
  { x: 4.0, y: 4.8 },
  { x: 5.9, y: 4.8 },
];

export const COUNTER = { x0: 1.1, y0: 0.75, x1: 4.6, y1: 1.65, h: 0.95 };
