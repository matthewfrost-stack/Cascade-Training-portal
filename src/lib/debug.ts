export const isDev = process.env.NODE_ENV !== 'production';

export function debugLog(...args: unknown[]): void {
  if (!isDev) return;
  console.log(...args); // eslint-disable-line no-console
}

export function debugWarn(...args: unknown[]): void {
  if (!isDev) return;
  console.warn(...args); // eslint-disable-line no-console
}
