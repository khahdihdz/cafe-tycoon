export type Phase = 'title' | 'open' | 'report';

export type UpgradeId = 'machine' | 'tables' | 'decor' | 'marketing';

export type DrinkId = 'espresso' | 'croissant' | 'latte' | 'coldbrew' | 'matcha' | 'signature';

export type StaffRole = 'waiter' | 'barista';

export interface Vec {
  x: number;
  y: number;
}

export type CustomerPhase = 'walk' | 'wait' | 'ready' | 'leaving';

export interface Customer {
  id: number;
  x: number;
  y: number;
  path: Vec[];
  table: number;
  drink: DrinkId;
  patience: number;
  maxPatience: number;
  phase: CustomerPhase;
  vip: boolean;
  seed: number;
}

export interface Brew {
  customerId: number;
  drink: DrinkId;
  remaining: number;
  total: number;
}

export interface ActiveEvent {
  id: string;
  name: string;
  until: number;
}

export interface Toast {
  id: number;
  text: string;
  tone: 'good' | 'warn' | 'info';
}

export interface Fx {
  kind: 'coin' | 'text';
  x: number;
  y: number;
  text?: string;
  seed: number;
}

export interface DayReport {
  day: number;
  revenue: number;
  tips: number;
  ingredientCost: number;
  wages: number;
  rent: number;
  profit: number;
  served: number;
  lost: number;
  repStart: number;
  repEnd: number;
  bestDrink: DrinkId | null;
}

export interface GameState {
  version: number;
  phase: Phase;
  paused: boolean;
  speed: 1 | 2;
  day: number;
  clock: number;
  money: number;
  rep: number;
  repStart: number;
  served: number;
  lost: number;
  revenue: number;
  tips: number;
  ingredientCost: number;
  upgrades: Record<UpgradeId, number>;
  unlocked: DrinkId[];
  staff: Record<StaffRole, number>;
  customers: Customer[];
  brews: Brew[];
  events: ActiveEvent[];
  toasts: Toast[];
  fx: Fx[];
  spawnTimer: number;
  eventTimer: number;
  waiterCd: number;
  boostCd: number;
  vipNext: boolean;
  nextId: number;
  dayStats: Partial<Record<DrinkId, number>>;
  lastReport: DayReport | null;
  totals: {
    days: number;
    served: number;
    profit: number;
  };
}
