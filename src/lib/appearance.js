/** Settings → Appearance: dark (the default), light, or follow the device. Saved in this browser. */
const KEY = 'appearance';
export const APPEARANCES = [['dark', 'Dark'], ['light', 'Light'], ['system', 'System']];

export function getAppearance() {
  try {
    const value = localStorage.getItem(KEY);
    if (APPEARANCES.some(([v]) => v === value)) return value;
  } catch {}
  return 'dark';
}

export function setAppearance(value) {
  try { localStorage.setItem(KEY, value); } catch {}
  applyAppearance(value);
}

/** Also runs inline in index.html before the page draws, so there's no flash of the wrong theme. */
export function applyAppearance(value = getAppearance()) {
  document.documentElement.dataset.theme = value;
  const light = value === 'light' || (value === 'system' && window.matchMedia('(prefers-color-scheme: light)').matches);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', light ? '#f4f4f6' : '#09090a');
}
