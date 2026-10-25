import {
  DAY_LENGTH,
  DRINKS,
  MAX_STAFF,
  RENT,
  STAFF_EMOJI,
  STAFF_NAMES,
  UPGRADES,
  WAGES,
  getDrink,
} from '../core/config';
import { dailyFixedCost, hireCost, tableCount, upgradeCost } from '../core/engine';
import type { DayReport, DrinkId, GameState, StaffRole, UpgradeId } from '../core/types';
import { clockText, money, signedMoney } from '../core/utils';

type TabId = 'menu' | 'upgrades' | 'staff';

export interface UiCallbacks {
  onStart: () => void;
  onCloseDay: () => void;
  onNextDay: () => void;
  onPause: () => void;
  onSpeed: () => void;
  onBoost: () => void;
  onUpgrade: (id: UpgradeId) => void;
  onUnlock: (id: DrinkId) => void;
  onHire: (role: StaffRole) => void;
  onRestart: () => void;
}

const TABS: { id: TabId; label: string; icon: string }[] = [
  { id: 'upgrades', label: 'Nâng cấp', icon: '⚙️' },
  { id: 'menu', label: 'Thực đơn', icon: '📋' },
  { id: 'staff', label: 'Nhân viên', icon: '👥' },
];

function must<T extends Element>(selector: string): T {
  const el = document.querySelector<T>(selector);
  if (!el) throw new Error(`Không tìm thấy ${selector}`);
  return el;
}

export class UI {
  private state: GameState;
  private cb: UiCallbacks;
  private tab: TabId = 'upgrades';
  private lastSync = 0;
  private lastPanel = '';
  private lastChips = '';
  private lastOverlay = '';
  private pointerDown = false;

  private hud: HTMLElement;
  private panelBody: HTMLElement;
  private tabsEl: HTMLElement;
  private overlay: HTMLElement;
  private toastsEl: HTMLElement;
  private chipsEl: HTMLElement;
  private hintEl: HTMLElement;
  private pausedEl: HTMLElement;

  private refs!: {
    day: HTMLElement;
    money: HTMLElement;
    rep: HTMLElement;
    repBar: HTMLElement;
    served: HTMLElement;
    clock: HTMLElement;
    daybar: HTMLElement;
    speed: HTMLButtonElement;
    pause: HTMLButtonElement;
    boost: HTMLButtonElement;
    close: HTMLButtonElement;
  };

  constructor(state: GameState, cb: UiCallbacks) {
    this.state = state;
    this.cb = cb;
    this.hud = must<HTMLElement>('#hud');
    this.panelBody = must<HTMLElement>('#panel-body');
    this.tabsEl = must<HTMLElement>('#tabs');
    this.overlay = must<HTMLElement>('#overlay');
    this.toastsEl = must<HTMLElement>('#toasts');
    this.chipsEl = must<HTMLElement>('#event-chips');
    this.hintEl = must<HTMLElement>('#hint');
    this.pausedEl = must<HTMLElement>('#paused-note');

    this.buildHud();
    this.buildTabs();
    this.bind();
    this.panelBody.addEventListener('pointerdown', () => {
      this.pointerDown = true;
    });
    window.addEventListener('pointerup', () => {
      if (!this.pointerDown) return;
      this.pointerDown = false;
      this.lastPanel = '';
      this.sync(true);
    });
    window.addEventListener('pointercancel', () => {
      this.pointerDown = false;
    });
  }

  /* --------------------------- HUD --------------------------- */

  private buildHud(): void {
    this.hud.innerHTML = `
      <div class="brand">
        <div class="brand-mark" aria-hidden="true">☕</div>
        <div class="brand-text">
          <strong>Cafe Tycoon</strong>
          <span id="hud-day">Ngày 1</span>
        </div>
      </div>
      <div class="stats">
        <div class="stat money">
          <span class="stat-label">Tiền mặt</span>
          <b id="hud-money">$0</b>
        </div>
        <div class="stat">
          <span class="stat-label">Danh tiếng</span>
          <b id="hud-rep">20</b>
          <div class="meter"><i id="hud-rep-bar" style="width:20%"></i></div>
        </div>
        <div class="stat served-stat">
          <span class="stat-label">Đã phục vụ</span>
          <b id="hud-served">0</b>
        </div>
        <div class="stat clock">
          <span class="stat-label" id="hud-clock">08:00</span>
          <div class="meter time"><i id="hud-daybar" style="width:0%"></i></div>
        </div>
      </div>
      <div class="hud-actions">
        <button class="btn ghost" id="btn-speed" data-action="speed" title="Tốc độ game">1×</button>
        <button class="btn ghost" id="btn-pause" data-action="pause">Tạm dừng</button>
        <button class="btn gold" id="btn-boost" data-action="boost">Pha nhanh</button>
        <button class="btn primary" id="btn-close" data-action="close-day">Đóng cửa</button>
      </div>
    `;
    this.refs = {
      day: must<HTMLElement>('#hud-day'),
      money: must<HTMLElement>('#hud-money'),
      rep: must<HTMLElement>('#hud-rep'),
      repBar: must<HTMLElement>('#hud-rep-bar'),
      served: must<HTMLElement>('#hud-served'),
      clock: must<HTMLElement>('#hud-clock'),
      daybar: must<HTMLElement>('#hud-daybar'),
      speed: must<HTMLButtonElement>('#btn-speed'),
      pause: must<HTMLButtonElement>('#btn-pause'),
      boost: must<HTMLButtonElement>('#btn-boost'),
      close: must<HTMLButtonElement>('#btn-close'),
    };
  }

  private buildTabs(): void {
    this.tabsEl.innerHTML = TABS.map(
      (t) =>
        `<button class="tab ${t.id === this.tab ? 'active' : ''}" data-action="tab" data-tab="${t.id}">
          <span aria-hidden="true">${t.icon}</span>${t.label}
        </button>`,
    ).join('');
  }

  private updateHud(): void {
    const s = this.state;
    this.refs.day.textContent = `Ngày ${s.day}`;
    this.refs.money.textContent = money(s.money);
    this.refs.money.classList.toggle('neg', s.money < 0);
    this.refs.rep.textContent = `${Math.round(s.rep)}`;
    this.refs.repBar.style.width = `${Math.min(100, s.rep)}%`;
    this.refs.served.textContent = `${s.served}`;

    const closed = s.phase === 'report';
    this.refs.clock.textContent =
      s.phase === 'open' ? clockText(s.clock) : closed ? 'Đã đóng' : '08:00';
    this.refs.daybar.style.width = `${(Math.min(s.clock, DAY_LENGTH) / DAY_LENGTH) * 100}%`;

    this.refs.close.hidden = s.phase !== 'open';
    this.refs.close.disabled = s.phase !== 'open';
    this.refs.pause.disabled = s.phase !== 'open';
    this.refs.pause.textContent = s.paused ? 'Chơi tiếp' : 'Tạm dừng';
    this.refs.speed.textContent = `${s.speed}×`;
    this.refs.boost.disabled =
      s.phase !== 'open' || s.boostCd > 0 || s.brews.length === 0;
    this.refs.boost.textContent =
      s.boostCd > 0 ? `Pha nhanh ${Math.ceil(s.boostCd)}s` : 'Pha nhanh';

    this.pausedEl.hidden = !s.paused || s.phase !== 'open';

    const chips = [
      ...s.events.map((e) => {
        if (e.id === 'supplier') return `<span class="chip good">${e.name}</span>`;
        const left = Math.max(0, Math.ceil(e.until - s.clock));
        return `<span class="chip ${e.id === 'tourists' ? 'good' : 'warn'}">${e.name} · ${left}s</span>`;
      }),
      ...(s.vipNext ? ['<span class="chip vip">★ Khách VIP sắp tới</span>'] : []),
    ].join('');
    if (chips !== this.lastChips) {
      this.chipsEl.innerHTML = chips;
      this.lastChips = chips;
    }
    this.chipsEl.classList.toggle('empty', chips.length === 0);

    if (this.hintEl.hidden) return;
    const hint = hintText(s);
    if (this.hintEl.textContent !== hint) this.hintEl.textContent = hint;
  }

  /* -------------------------- Panel -------------------------- */

  private panelHtml(): string {
    const s = this.state;
    const summary = `
      <div class="panel-summary">
        <span class="pill">🪑 ${tableCount(s)} bàn</span>
        <span class="pill">📋 ${s.unlocked.length} món</span>
        <span class="pill">👥 ${s.staff.waiter + s.staff.barista} nhân viên</span>
        <span class="pill cost">Cố định ${money(dailyFixedCost(s))}/ngày</span>
      </div>`;

    if (this.tab === 'menu') return summary + this.menuHtml();
    if (this.tab === 'staff') return summary + this.staffHtml();
    return summary + this.upgradeHtml();
  }

  private menuHtml(): string {
    const s = this.state;
    const cards = DRINKS.map((d) => {
      const owned = s.unlocked.includes(d.id);
      const icon = `<span class="card-icon" aria-hidden="true">${d.emoji}</span>`;
      const desc = `Giá vốn ${money(d.cost)} · pha ${d.brew}s · ${d.note}`;
      if (owned) {
        return `
          <div class="card static">
            ${icon}
            <span class="card-main">
              <span class="card-top"><b>${d.name}</b><em>${money(d.price)}/ly</em></span>
              <span class="card-desc">${desc}</span>
            </span>
            <span class="badge-good">Đang bán</span>
          </div>`;
      }
      const lackRep = s.rep < d.rep;
      const lackMoney = s.money < d.unlock;
      const disabled = lackRep || lackMoney;
      return `
        <button class="card ${disabled ? 'is-locked' : ''}" data-action="unlock" data-id="${d.id}" ${
          disabled ? 'disabled' : ''
        }>
          ${icon}
          <span class="card-main">
            <span class="card-top"><b>${d.name}</b><em>${money(d.price)}/ly</em></span>
            <span class="card-desc">${lackRep ? `Cần ${d.rep} danh tiếng · ` : ''}${desc}</span>
          </span>
          <span class="price ${disabled ? 'locked' : ''}">${money(d.unlock)}</span>
        </button>`;
    }).join('');

    return `
      <p class="sec-title">Thực đơn</p>
      <p class="sec-note">Mở thêm món để tăng giá trị mỗi lượt khách. Món đắt cần danh tiếng cao.</p>
      ${cards}`;
  }

  private upgradeHtml(): string {
    const s = this.state;
    const cards = (Object.keys(UPGRADES) as UpgradeId[])
      .map((id) => {
        const def = UPGRADES[id];
        const level = s.upgrades[id];
        const maxed = level >= def.max;
        const cost = upgradeCost(s, id);
        const disabled = maxed || s.money < cost;
        const effect = upgradeEffect(id, level, s);
        return `
          <button class="card" data-action="upgrade" data-id="${id}" ${disabled ? 'disabled' : ''}>
            <span class="card-icon" aria-hidden="true">${def.emoji}</span>
            <span class="card-main">
              <span class="card-top"><b>${def.name}</b><em>${maxed ? 'Tối đa' : `Cấp ${level}/${def.max}`}</em></span>
              <span class="card-desc">${effect}${maxed ? '' : ` → ${upgradeEffect(id, level + 1, s)}`}</span>
            </span>
            ${
              maxed
                ? '<span class="badge-good">MAX</span>'
                : `<span class="price ${s.money < cost ? 'locked' : ''}">${money(cost)}</span>`
            }
          </button>`;
      })
      .join('');

    return `
      <p class="sec-title">Nâng cấp quán</p>
      <p class="sec-note">Chi phí trả ngay. Nâng cấp có hiệu lực tức thì, kể cả giữa ca.</p>
      ${cards}
      <p class="sec-note">Mẹo: ưu tiên máy pha khi khách phải chờ lâu, thêm bàn khi quán thường xuyên hết chỗ.</p>`;
  }

  private staffHtml(): string {
    const s = this.state;
    const roles: StaffRole[] = ['waiter', 'barista'];
    const cards = roles
      .map((role) => {
        const count = s.staff[role];
        const maxed = count >= MAX_STAFF;
        const cost = hireCost(s, role);
        const disabled = maxed || s.money < cost;
        const desc =
          role === 'waiter'
            ? `Tự phục vụ khách đã có đồ uống · lương ${money(WAGES[role])}/ngày`
            : `Mỗi barista giúp pha nhanh hơn 35% · lương ${money(WAGES[role])}/ngày`;
        return `
          <button class="card" data-action="hire" data-role="${role}" ${disabled ? 'disabled' : ''}>
            <span class="card-icon" aria-hidden="true">${STAFF_EMOJI[role]}</span>
            <span class="card-main">
              <span class="card-top"><b>${STAFF_NAMES[role]}</b><em>${count}/${MAX_STAFF}</em></span>
              <span class="card-desc">${desc}</span>
            </span>
            ${
              maxed
                ? '<span class="badge-good">Đủ người</span>'
                : `<span class="price ${s.money < cost ? 'locked' : ''}">${money(cost)}</span>`
            }
          </button>`;
      })
      .join('');

    return `
      <p class="sec-title">Đội ngũ</p>
      <p class="sec-note">Lương được trừ vào cuối ngày. Thuê người giúp quán tự vận hành khi đông khách.</p>
      ${cards}
      <div class="mini-table">
        <div><span>Tiền thuê mặt bằng</span><b>${money(RENT)}/ngày</b></div>
        <div><span>Lương phục vụ</span><b>${s.staff.waiter} × ${money(WAGES.waiter)}</b></div>
        <div><span>Lương barista</span><b>${s.staff.barista} × ${money(WAGES.barista)}</b></div>
        <div class="total"><span>Tổng cố định</span><b>${money(dailyFixedCost(s))}/ngày</b></div>
      </div>`;
  }

  /* ------------------------- Overlay ------------------------- */

  showTitle(resume: boolean): void {
    const s = this.state;
    const card = `
      <div class="modal title-modal" role="dialog" aria-modal="true" aria-labelledby="title-h">
        <p class="eyebrow">Web game quản lý · Canvas 2D</p>
        <h1 id="title-h">Cafe <span>Tycoon</span></h1>
        <p class="lede">
          Một quán nhỏ, một máy pha cà phê và 90 giây mỗi ngày.
          Phục vụ khách, giữ danh tiếng và mở rộng thành chuỗi quán.
        </p>
        <ul class="features">
          <li><b>3</b> bàn lúc mở quán</li>
          <li><b>6</b> món có thể mở</li>
          <li><b>∞</b> ngày để phát triển</li>
        </ul>
        <div class="modal-actions">
          <button class="btn primary big" data-action="start">${resume ? 'Tiếp tục quán' : 'Mở quán'}</button>
        </div>
        ${
          resume
            ? `<p class="resume-line">Đang có tiến trình: <b>Ngày ${s.day}</b> · ${money(s.money)}</p>`
            : '<p class="tiny">Tiến trình được lưu trong trình duyệt của bạn. Không cần tài khoản.</p>'
        }
      </div>`;
    this.setOverlay(card);
  }

  showReport(report: DayReport): void {
    const best = report.bestDrink ? getDrink(report.bestDrink) : null;
    const costTotal = report.ingredientCost + report.wages + report.rent;
    const max = Math.max(1, report.revenue + report.tips, costTotal, Math.abs(report.profit));
    const bar = (label: string, value: number, cls: string) => `
      <div class="bar-row">
        <span>${label}</span>
        <div class="bar"><i class="${cls}" style="width:${Math.max(2, (Math.abs(value) / max) * 100)}%"></i></div>
        <b class="${value >= 0 ? 'pos' : 'neg'}">${signedMoney(value)}</b>
      </div>`;

    const card = `
      <div class="modal report-modal" role="dialog" aria-modal="true" aria-labelledby="report-h">
        <p class="eyebrow">Ngày ${report.day} · 08:00–22:00</p>
        <h2 id="report-h">Tổng kết cuối ngày</h2>
        <div class="report-grid">
          <div><span>Doanh thu</span><b class="pos">${signedMoney(report.revenue)}</b></div>
          <div><span>Tiền tip</span><b class="pos">${signedMoney(report.tips)}</b></div>
          <div><span>Nguyên liệu</span><b class="neg">${money(-report.ingredientCost)}</b></div>
          <div><span>Lương + mặt bằng</span><b class="neg">${money(-(report.wages + report.rent))}</b></div>
        </div>
        <div class="bars">
          ${bar('Doanh thu', report.revenue + report.tips, 'good')}
          ${bar('Chi phí', -costTotal, 'bad')}
          ${bar('Lợi nhuận', report.profit, report.profit >= 0 ? 'good' : 'bad')}
        </div>
        <div class="report-sum">
          <div><span>Khách phục vụ</span><b>${report.served} · mất ${report.lost}</b></div>
          <div><span>Danh tiếng</span><b>${Math.round(report.repStart)} → ${Math.round(report.repEnd)}</b></div>
          <div><span>Bán chạy nhất</span><b>${best ? `${best.emoji} ${best.name}` : '—'}</b></div>
          <div><span>Số dư</span><b class="${this.state.money >= 0 ? 'pos' : 'neg'}">${money(this.state.money)}</b></div>
        </div>
        <div class="modal-actions">
          <button class="btn ghost" data-action="restart">Chơi lại</button>
          <button class="btn primary" data-action="next">Sang ngày ${report.day + 1} →</button>
        </div>
      </div>`;
    this.setOverlay(card);
  }

  private setOverlay(html: string): void {
    if (html !== this.lastOverlay) {
      this.overlay.innerHTML = html;
      this.lastOverlay = html;
    }
    this.overlay.classList.add('show');
  }

  hideOverlay(): void {
    this.overlay.classList.remove('show');
    this.overlay.innerHTML = '';
    this.lastOverlay = '';
  }

  toast(text: string, tone: 'good' | 'warn' | 'info'): void {
    const el = document.createElement('div');
    el.className = `toast ${tone}`;
    el.textContent = text;
    this.toastsEl.append(el);
    while (this.toastsEl.children.length > 3) {
      this.toastsEl.firstElementChild?.remove();
    }
    window.setTimeout(() => {
      el.classList.add('out');
      window.setTimeout(() => el.remove(), 320);
    }, 3400);
  }

  /* -------------------------- Sync -------------------------- */

  sync(force = false): void {
    const now = performance.now();
    if (!force && now - this.lastSync < 160) return;
    this.lastSync = now;

    if (this.state.toasts.length > 0) {
      const pending = this.state.toasts.splice(0, this.state.toasts.length);
      for (const t of pending) this.toast(t.text, t.tone);
    }

    this.updateHud();
    if (this.pointerDown) return;
    const html = this.panelHtml();
    if (html !== this.lastPanel) {
      const scroll = this.panelBody.scrollTop;
      this.panelBody.innerHTML = html;
      this.panelBody.scrollTop = scroll;
      this.lastPanel = html;
    }
  }

  /* -------------------------- Events ------------------------ */

  private bind(): void {
    document.addEventListener('click', (event) => {
      if (!(event.target instanceof Element)) return;
      const el = event.target.closest<HTMLElement>('[data-action]');
      if (!el) return;
      const action = el.dataset.action;
      switch (action) {
        case 'start':
          this.cb.onStart();
          break;
        case 'close-day':
          this.cb.onCloseDay();
          break;
        case 'next':
          this.cb.onNextDay();
          break;
        case 'pause':
          this.cb.onPause();
          break;
        case 'speed':
          this.cb.onSpeed();
          break;
        case 'boost':
          this.cb.onBoost();
          break;
        case 'upgrade':
          if (el.dataset.id) this.cb.onUpgrade(el.dataset.id as UpgradeId);
          break;
        case 'unlock':
          if (el.dataset.id) this.cb.onUnlock(el.dataset.id as DrinkId);
          break;
        case 'hire':
          if (el.dataset.role) this.cb.onHire(el.dataset.role as StaffRole);
          break;
        case 'tab':
          if (el.dataset.tab) {
            this.tab = el.dataset.tab as TabId;
            for (const btn of this.tabsEl.querySelectorAll<HTMLElement>('.tab')) {
              btn.classList.toggle('active', btn.dataset.tab === this.tab);
            }
            this.lastPanel = '';
            this.sync(true);
          }
          break;
        case 'restart':
          this.cb.onRestart();
          break;
        default:
          break;
      }
    });
  }

  setHintVisible(visible: boolean): void {
    this.hintEl.hidden = !visible;
  }
}

function hintText(s: GameState): string {
  if (s.phase === 'report') return 'Ca đã kết thúc — xem báo cáo để sang ngày mới.';
  if (s.phase === 'title') return 'Bấm "Mở quán" để bắt đầu ngày đầu tiên.';
  if (s.brews.length > 0) return 'Bấm vào khách có ly ☕ để phục vụ và nhận thêm tip.';
  return 'Khách đang được phục vụ. Nâng cấp quán để đón đông hơn.';
}

function upgradeEffect(id: UpgradeId, level: number, s: GameState): string {
  switch (id) {
    case 'machine':
      return `Tốc độ pha +${level * 30}%`;
    case 'tables':
      return `${tableCount(s)} bàn phục vụ`;
    case 'decor':
      return `Kiên nhẫn +${level * 13}% · tip +${level * 5}%`;
    case 'marketing':
      return `Lượng khách +${level * 20}%`;
    default:
      return '';
  }
}
