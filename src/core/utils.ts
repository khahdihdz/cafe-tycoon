import { CLOSE_HOUR, DAY_LENGTH, OPEN_HOUR } from './config';

export function money(value: number): string {
  const sign = value < 0 ? '-' : '';
  const rounded = Math.round(Math.abs(value));
  return `${sign}$${rounded.toLocaleString('vi-VN')}`;
}

export function signedMoney(value: number): string {
  return `${value >= 0 ? '+' : ''}${money(value)}`;
}

export function clockText(clock: number): string {
  const totalMinutes =
    OPEN_HOUR * 60 + (Math.min(clock, DAY_LENGTH) / DAY_LENGTH) * (CLOSE_HOUR - OPEN_HOUR) * 60;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = Math.floor(totalMinutes % 60);
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}
