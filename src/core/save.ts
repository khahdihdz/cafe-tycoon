import { createState } from './engine';
import { DRINK_MAP, UPGRADES } from './config';
import type { DrinkId, GameState, StaffRole, UpgradeId } from './types';

const KEY = 'cafe-tycoon-save-v1';
const VERSION = 1;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function num(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

export function saveGame(state: GameState): void {
  try {
    const snapshot: GameState = {
      ...state,
      paused: false,
      toasts: [],
      fx: [],
      customers: state.customers.map((c) => ({ ...c })),
      brews: state.brews.map((b) => ({ ...b })),
      events: state.events.map((e) => ({ ...e })),
    };
    localStorage.setItem(KEY, JSON.stringify({ v: VERSION, at: Date.now(), state: snapshot }));
  } catch {
    /* localStorage có thể bị chặn — game vẫn chạy trong bộ nhớ */
  }
}

export function hasSave(): boolean {
  try {
    return localStorage.getItem(KEY) !== null;
  } catch {
    return false;
  }
}

export function clearSave(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

export function loadGame(): GameState | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed) || parsed.v !== VERSION || !isRecord(parsed.state)) return null;

    const data = parsed.state;
    const base = createState();
    const upgrades: Record<UpgradeId, number> = { ...base.upgrades };
    if (isRecord(data.upgrades)) {
      for (const key of Object.keys(UPGRADES) as UpgradeId[]) {
        const def = UPGRADES[key];
        upgrades[key] = Math.min(def.max, Math.max(0, Math.floor(num(data.upgrades[key], 0))));
      }
    }

    const staff: Record<StaffRole, number> = { ...base.staff };
    if (isRecord(data.staff)) {
      staff.waiter = Math.min(2, Math.max(0, Math.floor(num(data.staff.waiter, 0))));
      staff.barista = Math.min(2, Math.max(0, Math.floor(num(data.staff.barista, 0))));
    }

    const unlocked = Array.isArray(data.unlocked)
      ? (data.unlocked.filter((id): id is DrinkId => typeof id === 'string' && id in DRINK_MAP) as DrinkId[])
      : [...base.unlocked];
    if (!unlocked.includes('espresso')) unlocked.unshift('espresso');

    const phase =
      data.phase === 'open' || data.phase === 'report' || data.phase === 'title'
        ? data.phase
        : 'title';

    const restored: GameState = {
      ...base,
      phase,
      day: Math.max(1, Math.floor(num(data.day, 1))),
      clock: Math.min(num(data.clock, 0), 90),
      money: Math.round(num(data.money, base.money)),
      rep: Math.min(100, Math.max(0, num(data.rep, base.rep))),
      repStart: Math.min(100, Math.max(0, num(data.repStart, base.rep))),
      served: Math.max(0, Math.floor(num(data.served, 0))),
      lost: Math.max(0, Math.floor(num(data.lost, 0))),
      revenue: Math.max(0, num(data.revenue, 0)),
      tips: Math.max(0, num(data.tips, 0)),
      ingredientCost: Math.max(0, num(data.ingredientCost, 0)),
      upgrades,
      staff,
      unlocked,
      customers: Array.isArray(data.customers) ? (data.customers as GameState['customers']) : [],
      brews: Array.isArray(data.brews) ? (data.brews as GameState['brews']) : [],
      events: Array.isArray(data.events) ? (data.events as GameState['events']) : [],
      spawnTimer: Math.max(0, num(data.spawnTimer, 2)),
      eventTimer: Math.max(0, num(data.eventTimer, 25)),
      waiterCd: Math.max(0, num(data.waiterCd, 0)),
      boostCd: Math.max(0, num(data.boostCd, 0)),
      vipNext: data.vipNext === true,
      nextId: Math.max(1, Math.floor(num(data.nextId, 1))),
      dayStats: isRecord(data.dayStats) ? (data.dayStats as GameState['dayStats']) : {},
      lastReport: isRecord(data.lastReport) ? (data.lastReport as unknown as GameState['lastReport']) : null,
      totals: isRecord(data.totals)
        ? {
            days: Math.max(0, Math.floor(num(data.totals.days, 0))),
            served: Math.max(0, Math.floor(num(data.totals.served, 0))),
            profit: num(data.totals.profit, 0),
          }
        : { ...base.totals },
    };

    restored.toasts = [];
    restored.fx = [];
    restored.paused = false;

    if (restored.phase === 'open' && restored.clock >= 90) {
      restored.phase = 'report';
      restored.clock = 90;
    }

    return restored;
  } catch {
    return null;
  }
}
