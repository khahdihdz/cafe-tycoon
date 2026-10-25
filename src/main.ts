import './styles.css';
import {
  boost,
  buyUpgrade,
  createState,
  endDay,
  hireStaff,
  nextDay,
  serveCustomer,
  startDay,
  tick,
  unlockDrink,
} from './core/engine';
import { clearSave, loadGame, saveGame } from './core/save';
import type { GameState } from './core/types';
import { Scene } from './render/scene';
import { UI, type UiCallbacks } from './ui/ui';

const canvas = document.querySelector<HTMLCanvasElement>('#scene');
if (!canvas) throw new Error('Không tìm thấy canvas #scene');

const loaded = loadGame();
const state: GameState = loaded ?? createState();
const resumedMidDay = loaded !== null && loaded.phase === 'open';
if (resumedMidDay) state.paused = true;

const scene = new Scene(canvas);

function beginDay(): void {
  if (state.phase === 'open') return;
  startDay(state);
  state.paused = false;
  ui.hideOverlay();
  ui.setHintVisible(true);
  saveGame(state);
  ui.sync(true);
}

function handleEndOfDay(): void {
  ui.setHintVisible(false);
  saveGame(state);
  if (state.lastReport) ui.showReport(state.lastReport);
  ui.sync(true);
}

const callbacks: UiCallbacks = {
  onStart: () => beginDay(),
  onCloseDay: () => {
    if (state.phase !== 'open') return;
    endDay(state);
    handleEndOfDay();
  },
  onNextDay: () => {
    nextDay(state);
    ui.hideOverlay();
    ui.setHintVisible(true);
    saveGame(state);
    ui.sync(true);
  },
  onPause: () => {
    if (state.phase !== 'open') return;
    state.paused = !state.paused;
    ui.sync(true);
  },
  onSpeed: () => {
    state.speed = state.speed === 1 ? 2 : 1;
    ui.sync(true);
  },
  onBoost: () => {
    if (boost(state)) ui.sync(true);
  },
  onUpgrade: (id) => {
    if (buyUpgrade(state, id)) {
      saveGame(state);
      ui.sync(true);
    }
  },
  onUnlock: (id) => {
    if (unlockDrink(state, id)) {
      saveGame(state);
      ui.sync(true);
    }
  },
  onHire: (role) => {
    if (hireStaff(state, role)) {
      saveGame(state);
      ui.sync(true);
    }
  },
  onRestart: () => {
    const ok = window.confirm('Chơi lại từ đầu? Toàn bộ tiến trình hiện tại sẽ bị xoá.');
    if (!ok) return;
    clearSave();
    Object.assign(state, createState());
    ui.hideOverlay();
    ui.showTitle(false);
    ui.setHintVisible(false);
    ui.sync(true);
  },
};

const ui = new UI(state, callbacks);

canvas.addEventListener('click', (event) => {
  const rect = canvas.getBoundingClientRect();
  const id = scene.pick(event.clientX - rect.left, event.clientY - rect.top);
  if (id === null) return;
  const customer = state.customers.find((c) => c.id === id);
  if (!customer) return;
  if (customer.phase === 'ready') {
    if (serveCustomer(state, id)) {
      saveGame(state);
      ui.sync(true);
    }
  } else if (customer.phase === 'wait') {
    ui.toast('Đồ uống đang được pha, chờ một chút nhé!', 'info');
  }
});

window.addEventListener('keydown', (event) => {
  if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
  if (event.code === 'Space' && !event.repeat) {
    event.preventDefault();
    callbacks.onPause();
  } else if ((event.key === 'b' || event.key === 'B') && !event.repeat) {
    callbacks.onBoost();
  }
});

document.addEventListener('visibilitychange', () => {
  if (!document.hidden) return;
  if (state.phase === 'open') state.paused = true;
  saveGame(state);
  ui.sync(true);
});

window.addEventListener('beforeunload', () => saveGame(state));

let last = performance.now();
let lastSave = last;

function frame(now: number): void {
  const dt = Math.min(0.1, Math.max(0, (now - last) / 1000));
  last = now;

  const wasOpen = state.phase === 'open';
  tick(state, dt);
  if (wasOpen && state.phase === 'report') handleEndOfDay();

  scene.draw(state, dt);
  ui.sync();

  if (now - lastSave > 8000 && state.phase !== 'title') {
    lastSave = now;
    saveGame(state);
  }
  requestAnimationFrame(frame);
}

ui.sync(true);
if (state.phase === 'title') {
  const hasProgress = state.day > 1 || state.totals.days > 0 || state.money !== 120;
  ui.showTitle(hasProgress);
  ui.setHintVisible(false);
} else if (state.phase === 'report' && state.lastReport) {
  ui.showReport(state.lastReport);
  ui.setHintVisible(false);
} else {
  ui.setHintVisible(true);
  if (resumedMidDay) ui.toast('Đang tiếp tục ca dở — bấm "Chơi tiếp" để chạy tiếp.', 'info');
}

requestAnimationFrame(frame);
