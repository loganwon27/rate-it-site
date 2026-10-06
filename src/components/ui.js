import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { html } from '../lib/html.js';

export function Icon({ name, size = 22 }) {
  const paths = {
    home: 'M3 11.5 12 4l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z',
    flame: 'M12 3c1 3 4 4.5 4 9a4 4 0 0 1-8 0c0-2 1-3 2-4 0 2 1 3 2 3 0-3-1-5 0-8z',
    grid: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',
    plus: 'M12 5v14M5 12h14',
    user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm-7 9a7 7 0 0 1 14 0',
    bell: 'M6 16V11a6 6 0 0 1 12 0v5l2 2H4zM10 20a2 2 0 0 0 4 0',
    gear: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm7.4-3a7.4 7.4 0 0 0-.1-1.2l2-1.6-2-3.4-2.4 1a7 7 0 0 0-2-1.2L14.5 3h-5l-.4 2.6a7 7 0 0 0-2 1.2l-2.4-1-2 3.4 2 1.6a7.4 7.4 0 0 0 0 2.4l-2 1.6 2 3.4 2.4-1a7 7 0 0 0 2 1.2l.4 2.6h5l.4-2.6a7 7 0 0 0 2-1.2l2.4 1 2-3.4-2-1.6c.1-.4.1-.8.1-1.2z',
    heart: 'M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z',
    comment: 'M4 5h16v11H9l-5 4z',
    more: 'M5 12h.01M12 12h.01M19 12h.01',
    back: 'M15 5l-7 7 7 7',
    search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zm9 3-4.3-4.3',
    close: 'M6 6l12 12M18 6 6 18',
    eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zm10 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
    eyeOff: 'M3 3l18 18M10.6 10.6a2 2 0 0 0 2.8 2.8M9.9 5.2A10 10 0 0 1 12 5c6 0 10 7 10 7a17 17 0 0 1-3.2 3.9M6.6 6.6C3.8 8.4 2 12 2 12s4 7 10 7a9.7 9.7 0 0 0 5.4-1.6',
    camera: 'M4 8h3l2-3h6l2 3h3v11H4zM12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
    photo: 'M4 5h16v14H4zM4 15l5-5 5 5 2-2 4 4M15.5 9.5h.01',
    shield: 'M12 3 5 6v6c0 4.5 3 7.7 7 9 4-1.3 7-4.5 7-9V6zM9 12l2 2 4-4',
    star: 'M12 3l2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3 6.5 20.2l1-6.2L3 9.6l6.2-.9z',
    down: 'M12 5v14M6 13l6 6 6-6',
    share: 'M12 4v11M8 8l4-4 4 4M5 13v6h14v-6',
    shield2: 'M12 3 5 6v6c0 4.5 3 7.7 7 9 4-1.3 7-4.5 7-9V6z',
    chart: 'M4 20h16M7 16v-5M12 16V6M17 16v-8',
  };
  const filled = name === 'star';
  return html`<svg class="icon" width=${size} height=${size} viewBox="0 0 24 24" aria-hidden="true"
    fill=${filled ? 'currentColor' : 'none'} stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">
    <path d=${paths[name] || ''} /></svg>`;
}

export function Avatar({ url, name, size = 36 }) {
  // Remember which URL failed, so a new photo (after an edit) gets a fresh try.
  const [failedUrl, setFailedUrl] = useState(null);
  const style = `width:${size}px;height:${size}px;font-size:${size * 0.42}px`;
  if (url && failedUrl !== url) {
    return html`<img class="avatar" style=${style} src=${url} alt="" loading="lazy" decoding="async" onError=${() => setFailedUrl(url)} />`;
  }
  return html`<span class="avatar avatar-fallback" style=${style} aria-hidden="true">${(name || '?')[0].toUpperCase()}</span>`;
}

const RETRY_DELAYS = [1000, 3000, 7000];

/**
 * A photo that fades in once it's loaded, and always ends up visible:
 * - the load state belongs to its URL, and a photo that's already downloaded (the feed pre-loads the next few)
 *   is caught before paint, so it can't be reset to "loading" and stay invisible;
 * - while loading it keeps checking the image itself, in case a browser skips the load event;
 * - CSS reveals the image after a few seconds no matter what (see .photo in styles.css);
 * - a failed load retries on its own (1s, 3s, 7s), again when the connection comes back, then offers a tap to retry.
 * `eager` for the main photo on screen; grids load lazily.
 */
export function Photo({ url, alt = '', className = '', eager = false }) {
  const fresh = { url, state: 'loading', attempt: 0 };
  const [load, setLoad] = useState(fresh);
  const current = load.url === url ? load : fresh;
  const img = useRef(null);
  const update = (changes) => setLoad((l) => ({ ...(l.url === url ? l : { url, state: 'loading', attempt: 0 }), ...changes }));

  // Already loaded (from cache) before we were listening. Only ever concludes "loaded": Safari can report
  // `complete` on an image that hasn't started downloading, so failures come from the error event alone.
  const check = () => {
    const el = img.current;
    if (el && el.complete && el.naturalWidth > 0) update({ state: 'loaded' });
  };
  useLayoutEffect(check, [url, current.attempt]);
  useEffect(() => {
    if (current.state !== 'loading') return undefined;
    const timer = setInterval(check, 400);
    return () => clearInterval(timer);
  }, [url, current.state, current.attempt]);

  // Retry failures on their own, and as soon as the device is back online.
  useEffect(() => {
    if (current.state !== 'error') return undefined;
    const again = () => update({ state: 'loading', attempt: current.attempt + 1 });
    const timer = current.attempt < RETRY_DELAYS.length ? setTimeout(again, RETRY_DELAYS[current.attempt]) : null;
    window.addEventListener('online', again);
    return () => { clearTimeout(timer); window.removeEventListener('online', again); };
  }, [url, current.state, current.attempt]);

  const src = url && current.attempt > 0 ? `${url}${url.includes('?') ? '&' : '?'}retry=${current.attempt}` : url;
  const gaveUp = current.state === 'error' && current.attempt >= RETRY_DELAYS.length;
  const retry = (e) => { e.stopPropagation(); e.preventDefault(); update({ state: 'loading', attempt: current.attempt + 1 }); };
  return html`<div class=${`photo ${className} ${current.state}`}>
    ${gaveUp ? html`<button class="photo-error" onClick=${retry} aria-label="Photo didn't load. Tap to retry">
      <${Icon} name="photo" size=${28} /><span class="small">Tap to retry</span></button>` : null}
    <img ref=${img} key=${src} src=${src} alt=${alt} loading=${eager ? 'eager' : 'lazy'} decoding="async"
      fetchpriority=${eager ? 'high' : 'auto'}
      onLoad=${() => update({ state: 'loaded' })} onError=${() => update({ state: 'error' })} />
  </div>`;
}

const BADGES = { founder: 'Founder', admin: 'Admin' };

/** The small public tag next to a team member's username. Renders nothing for everyone else. */
export function Badge({ kind }) {
  if (!BADGES[kind]) return null;
  return html`<span class=${`role-tag ${kind}`} title=${`Rate It ${BADGES[kind]}`}>${BADGES[kind]}</span>`;
}

export function Spinner({ big = false }) {
  return html`<div class=${big ? 'spinner big' : 'spinner'} role="status" aria-label="Loading"></div>`;
}

export function Empty({ icon = 'photo', title, message, action, onAction }) {
  return html`<div class="empty">
    <span class="empty-icon"><${Icon} name=${icon} size=${34} /></span>
    <h2>${title}</h2>
    ${message ? html`<p>${message}</p>` : null}
    ${action ? html`<button class="btn secondary" onClick=${onAction}>${action}</button>` : null}
  </div>`;
}

export function ErrorState({ message, onRetry }) {
  return html`<${Empty} icon="close" title="Something went wrong"
    message=${message && message !== 'Something went wrong. Try again.' ? message : 'Try again.'}
    action="Retry" onAction=${onRetry} />`;
}

export function Chip({ label, selected, onClick }) {
  return html`<button class=${`chip ${selected ? 'selected' : ''}`} onClick=${onClick} aria-pressed=${selected}>${label}</button>`;
}

export function Modal({ title, onClose, children, wide = false }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    document.body.classList.add('modal-open');
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.classList.remove('modal-open');
    };
  }, []);
  return html`<div class="modal-backdrop" onClick=${(e) => e.target === e.currentTarget && onClose()}>
    <div class=${`modal ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true" aria-label=${title}>
      <header class="modal-head">
        <h2>${title}</h2>
        <button class="icon-btn" onClick=${onClose} aria-label="Close"><${Icon} name="close" /></button>
      </header>
      <div class="modal-body">${children}</div>
    </div>
  </div>`;
}

/** Asks before doing something destructive (the in-page replacement for confirm()). */
export function Confirm({ title, message, confirmLabel, danger = true, onConfirm, onCancel }) {
  return html`<${Modal} title=${title} onClose=${onCancel}>
    ${message ? html`<p class="muted">${message}</p>` : null}
    <div class="row end">
      <button class="btn ghost" onClick=${onCancel}>Cancel</button>
      <button class=${`btn ${danger ? 'danger' : 'primary'}`} onClick=${onConfirm}>${confirmLabel}</button>
    </div>
  </${Modal}>`;
}

// ---------- Toasts ----------
let pushToast = () => {};
export function toast(message) {
  pushToast(message);
}

export function Toasts() {
  const [message, setMessage] = useState(null);
  useEffect(() => {
    let timer;
    pushToast = (text) => {
      setMessage(text);
      clearTimeout(timer);
      timer = setTimeout(() => setMessage(null), 2600);
    };
  }, []);
  return message ? html`<div class="toast" role="status">${message}</div>` : null;
}

/** True when the window has room for the side-by-side desktop layouts (sidebar + photo + panel). */
const WIDE_QUERY = '(min-width: 1100px)';
export function useWide() {
  const [wide, setWide] = useState(() => window.matchMedia(WIDE_QUERY).matches);
  useEffect(() => {
    const query = window.matchMedia(WIDE_QUERY);
    const onChange = () => setWide(query.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);
  return wide;
}
