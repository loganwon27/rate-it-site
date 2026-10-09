import { useEffect, useRef, useState } from 'preact/hooks';
import * as api from '../lib/api.js';
import { describeError } from '../lib/backend.js';
import { CATEGORIES } from '../lib/format.js';
import { html } from '../lib/html.js';
import { loadBitmap } from '../lib/image.js';
import { navigate } from '../lib/router.js';
import { bumpVersion, getState, setState } from '../lib/store.js';
import { PostHeader, RatingBar } from '../components/post.js';
import { Chip, DEFAULT_PROMPT, Icon, postPrompt } from '../components/ui.js';

const ASPECT = 4 / 5;

/** Pick → crop → details → preview → post. */
export function CreatePage() {
  const [step, setStep] = useState('pick');
  const [bitmap, setBitmap] = useState(null);
  const [canvas, setCanvas] = useState(null);
  const [details, setDetails] = useState({ category: '', caption: '', prompt: '', showUsername: true });
  const [error, setError] = useState(null);

  async function pick(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setError(null);
    try {
      setBitmap(await loadBitmap(file));
      setStep('crop');
    } catch (err) {
      setError(describeError(err));
    }
  }

  if (step === 'crop') {
    return html`<${Cropper} bitmap=${bitmap} onBack=${() => setStep('pick')}
      onDone=${(c) => { setCanvas(c); setStep('details'); }} />`;
  }
  if (step === 'details') {
    return html`<${Details} canvas=${canvas} value=${details} onChange=${setDetails}
      onBack=${() => setStep('crop')} onNext=${() => setStep('preview')} />`;
  }
  if (step === 'preview') {
    return html`<${Preview} canvas=${canvas} details=${details} onBack=${() => setStep('details')} />`;
  }
  return html`<div class="page narrow">
    <h1 class="page-title">New post</h1>
    <p class="muted">Post anything. See what people think.</p>
    <label class="source-tile">
      <span class="tile-icon"><${Icon} name="photo" size=${26} /></span>
      <span><strong>Choose a photo</strong><small>From your device</small></span>
      <input type="file" accept="image/*" onChange=${pick} hidden />
    </label>
    <label class="source-tile mobile-only">
      <span class="tile-icon"><${Icon} name="camera" size=${26} /></span>
      <span><strong>Take a photo</strong><small>Use your camera</small></span>
      <input type="file" accept="image/*" capture="environment" onChange=${pick} hidden />
    </label>
    ${error ? html`<p class="error">${error}</p>` : null}
  </div>`;
}

/** Drag to position and zoom (slider, scroll wheel or pinch) inside a 4:5 frame. */
function Cropper({ bitmap, onBack, onDone }) {
  const frameRef = useRef(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const drag = useRef(null);
  const pointers = useRef(new Map());

  useEffect(() => {
    const measure = () => {
      const w = frameRef.current.clientWidth;
      setSize({ w, h: w / ASPECT });
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);

  const base = size.w ? Math.max(size.w / bitmap.width, size.h / bitmap.height) : 1;
  const scale = base * zoom;
  const clamp = (o, z = zoom) => {
    const maxX = Math.max(0, (bitmap.width * base * z - size.w) / 2);
    const maxY = Math.max(0, (bitmap.height * base * z - size.h) / 2);
    return { x: Math.min(maxX, Math.max(-maxX, o.x)), y: Math.min(maxY, Math.max(-maxY, o.y)) };
  };
  const setZoomClamped = (z) => {
    const next = Math.min(5, Math.max(1, z));
    setZoom(next);
    setOffset((o) => clamp(o, next));
  };

  function down(e) {
    e.currentTarget.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    drag.current = { x: e.clientX, y: e.clientY, start: offset, zoom, dist: pinchDistance() };
  }
  function pinchDistance() {
    const [a, b] = [...pointers.current.values()];
    return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : null;
  }
  function move(e) {
    if (!drag.current || !pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const dist = pinchDistance();
    if (dist && drag.current.dist) {
      setZoomClamped(drag.current.zoom * (dist / drag.current.dist));
    } else {
      setOffset(clamp({ x: drag.current.start.x + e.clientX - drag.current.x, y: drag.current.start.y + e.clientY - drag.current.y }));
    }
  }
  function up(e) {
    pointers.current.delete(e.pointerId);
    drag.current = pointers.current.size ? { ...drag.current, start: offset, zoom, dist: pinchDistance() } : null;
  }

  function finish() {
    // Map the visible frame back onto the original photo's pixels.
    const cropW = size.w / scale;
    const cropH = size.h / scale;
    const sx = bitmap.width / 2 - offset.x / scale - cropW / 2;
    const sy = bitmap.height / 2 - offset.y / scale - cropH / 2;
    const outW = Math.round(Math.min(cropW, 1440));
    const canvas = document.createElement('canvas');
    canvas.width = outW;
    canvas.height = Math.round(outW / ASPECT);
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(bitmap, sx, sy, cropW, cropH, 0, 0, canvas.width, canvas.height);
    onDone(canvas);
  }

  const imgStyle = `width:${bitmap.width * scale}px;height:${bitmap.height * scale}px;transform:translate(calc(-50% + ${offset.x}px), calc(-50% + ${offset.y}px))`;
  return html`<div class="page narrow">
    <${StepHeader} title="Crop" onBack=${onBack} />
    <div class="crop-frame" ref=${frameRef} style=${`height:${size.h}px`}
        onPointerDown=${down} onPointerMove=${move} onPointerUp=${up} onPointerCancel=${up}
        onWheel=${(e) => { e.preventDefault(); setZoomClamped(zoom * (e.deltaY < 0 ? 1.08 : 0.93)); }}>
      <${BitmapImage} bitmap=${bitmap} style=${imgStyle} />
    </div>
    <label class="zoom"><span class="muted small">Zoom</span>
      <input type="range" min="1" max="5" step="0.01" value=${zoom} onInput=${(e) => setZoomClamped(Number(e.target.value))} />
    </label>
    <p class="muted small center">Drag to adjust. Scroll or pinch to zoom.</p>
    <button class="btn primary block" onClick=${finish}>Next</button>
  </div>`;
}

/** Shows an ImageBitmap (canvas-backed so rotation from the camera is already applied). */
function BitmapImage({ bitmap, style }) {
  const ref = useRef(null);
  useEffect(() => {
    const c = ref.current;
    c.width = bitmap.width;
    c.height = bitmap.height;
    c.getContext('2d').drawImage(bitmap, 0, 0);
  }, [bitmap]);
  return html`<canvas ref=${ref} class="crop-image" style=${style}></canvas>`;
}

function CanvasImage({ canvas, className }) {
  const [url, setUrl] = useState(null);
  useEffect(() => { setUrl(canvas.toDataURL('image/jpeg', 0.85)); }, [canvas]);
  return url ? html`<img class=${className} src=${url} alt="Your photo" />` : null;
}

function Details({ canvas, value, onChange, onBack, onNext }) {
  const [custom, setCustom] = useState(!CATEGORIES.includes(value.category) && value.category !== '');
  const set = (patch) => onChange({ ...value, ...patch });
  const valid = value.category.trim().length > 0 && value.category.trim().length <= 24 && value.caption.length <= 200
    && value.prompt.length <= 60;
  return html`<div class="page narrow">
    <${StepHeader} title="Details" onBack=${onBack} />
    <${CanvasImage} canvas=${canvas} className="details-thumb" />
    <h3>Category</h3>
    <div class="chips wrap">
      ${CATEGORIES.map((c) => html`<${Chip} label=${c} selected=${!custom && value.category === c}
        onClick=${() => { setCustom(false); set({ category: c }); }} />`)}
      <${Chip} label="+ Custom" selected=${custom} onClick=${() => { setCustom(true); set({ category: '' }); }} />
    </div>
    ${custom ? html`<input class="field" placeholder="Name your category" maxlength="24" value=${value.category}
      onInput=${(e) => set({ category: e.target.value })} autofocus />` : null}
    <h3>Caption</h3>
    <textarea rows="2" maxlength="200" placeholder="Rate my new setup" value=${value.caption}
      onInput=${(e) => set({ caption: e.target.value })}></textarea>
    <h3>Question</h3>
    <input class="field" maxlength="60" placeholder=${DEFAULT_PROMPT} value=${value.prompt}
      onInput=${(e) => set({ prompt: e.target.value })} aria-label="Question above the rating bar" />
    <p class="muted small">What people see above the 1–10 bar. Leave it empty for "${DEFAULT_PROMPT}"</p>
    <label class="switch-row">
      <span><strong>Show my username</strong><br /><small class="muted">${value.showUsername
        ? 'People will see this is yours.' : "Posted anonymously — it won't appear on your profile to others."}</small></span>
      <input type="checkbox" class="switch" checked=${value.showUsername} onChange=${(e) => set({ showUsername: e.target.checked })} />
    </label>
    <button class="btn primary block" disabled=${!valid} onClick=${onNext}>Preview</button>
  </div>`;
}

/** Shows the post exactly as it will appear in the feed, then uploads it. */
function Preview({ canvas, details, onBack }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const me = getState().profile;
  const fake = {
    id: 'preview', author_id: details.showUsername ? me?.id : null, author_username: details.showUsername ? me?.username : null,
    author_avatar_path: details.showUsername ? me?.avatar_path : null, category: details.category.trim(),
    caption: details.caption.trim(), prompt: details.prompt.trim(), created_at: new Date().toISOString(), like_count: 0, comment_count: 0,
  };

  async function post() {
    setBusy(true);
    setError(null);
    try {
      await api.createPost({ canvas, ...details });
      bumpVersion();
      setState({ profile: await api.myProfile() });
      navigate(`/u/${me.id}`);
    } catch (e) {
      setError(describeError(e));
      setBusy(false);
    }
  }

  return html`<div class="page narrow">
    <${StepHeader} title="Preview" onBack=${onBack} />
    <article class="feed-card preview" aria-label="Preview">
      <${PostHeader} post=${fake} />
      <div class="feed-photo">
        <${CanvasImage} canvas=${canvas} className="photo-img" />
        <div class="photo-shade"></div>
        ${fake.caption ? html`<p class="caption">${fake.caption}</p>` : null}
      </div>
      <div class="rate-area">
        <div class="rate-head"><strong>${postPrompt(fake)}</strong></div>
        <${RatingBar} locked=${null} busy=${true} onRate=${() => {}} />
      </div>
    </article>
    ${error ? html`<p class="error">${error}</p>` : null}
    <button class="btn primary block" disabled=${busy} onClick=${post}>${busy ? 'Posting…' : error ? 'Try again' : 'Post'}</button>
  </div>`;
}

function StepHeader({ title, onBack }) {
  return html`<div class="step-head">
    <button class="icon-btn" onClick=${onBack} aria-label="Back"><${Icon} name="back" /></button>
    <h1>${title}</h1>
    <span></span>
  </div>`;
}
