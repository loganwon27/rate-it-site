import { useEffect, useRef, useState } from 'preact/hooks';
import * as api from '../lib/api.js';
import { compact } from '../lib/format.js';
import { html } from '../lib/html.js';
import { Avatar } from './ui.js';

// Same rules as the database (extract_hashtags / extract_mentions), so what links here is what gets indexed
// and notified. Usernames are 3–20 of a–z 0–9 _ . (a trailing "." is punctuation, not part of the name).
const TOKEN = /(^|[^A-Za-z0-9_&#.@])(#[A-Za-z0-9_]{1,30}(?![A-Za-z0-9_])|@[A-Za-z0-9_.]{3,21})/g;

/** Text with #hashtags and @mentions turned into links. `onNavigate` runs when one is clicked (e.g. close a modal). */
export function RichText({ text, onNavigate }) {
  if (!text) return null;
  const parts = [];
  let last = 0;
  for (const match of text.matchAll(TOKEN)) {
    const [, lead, raw] = match;
    const start = match.index + lead.length;
    let token = raw;
    if (token[0] === '@') token = token.replace(/\.+$/, '');
    if (token[0] === '@' && token.length < 4) continue;
    if (token[0] === '#' && !/[A-Za-z]/.test(token)) continue; // "#3" in "attempt #3" isn't a tag
    if (start > last) parts.push(text.slice(last, start));
    const name = token.slice(1).toLowerCase();
    const href = token[0] === '#' ? `#/tag/${name}` : `#/user/${name}`;
    parts.push(html`<a class=${token[0] === '#' ? 'hashtag' : 'mention'} href=${href}
      onClick=${(e) => { e.stopPropagation(); onNavigate?.(); }}>${token}</a>`);
    last = start + token.length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

/** The @name or #tag being typed right before the caret, if any. */
function activeToken(value, caret) {
  const before = value.slice(0, caret);
  const m = before.match(/(^|[\s(])([@#])([A-Za-z0-9_.]{0,30})$/);
  if (!m) return null;
  return { kind: m[2], query: m[3].toLowerCase(), start: caret - m[3].length - 1, end: caret };
}

/**
 * A text input or textarea that suggests people after "@" and tags after "#", like other social apps.
 * Pick one with a click, Tab or Enter (↑/↓ to move, Esc to close).
 */
export function MentionField({ multiline = false, value, onInput, className = '', ...props }) {
  const ref = useRef(null);
  const [token, setToken] = useState(null);
  const [items, setItems] = useState([]);
  const [active, setActive] = useState(0);

  useEffect(() => {
    if (!token) { setItems([]); return undefined; }
    let cancelled = false;
    const timer = setTimeout(async () => {
      const found = token.kind === '@'
        ? (token.query ? await api.searchProfiles(token.query).catch(() => []) : [])
        : await api.searchHashtags(token.query).catch(() => []);
      if (!cancelled) { setItems(found.slice(0, 6)); setActive(0); }
    }, 120);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [token?.kind, token?.query]);

  const update = (el) => setToken(activeToken(el.value, el.selectionStart ?? el.value.length));

  function pick(item) {
    const text = token.kind === '@' ? `@${item.username} ` : `#${item.tag} `;
    const next = value.slice(0, token.start) + text + value.slice(token.end).replace(/^\s/, '');
    onInput(next);
    setToken(null);
    const caret = token.start + text.length;
    requestAnimationFrame(() => { ref.current?.focus(); ref.current?.setSelectionRange(caret, caret); });
  }

  function onKeyDown(e) {
    if (!token || !items.length) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((active + (e.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length);
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      pick(items[active]);
    } else if (e.key === 'Escape') {
      e.stopPropagation();
      setToken(null);
    }
  }

  const field = {
    ...props,
    ref,
    value,
    onInput: (e) => { onInput(e.target.value); update(e.target); },
    onKeyDown,
    onClick: (e) => update(e.target),
    onBlur: () => setTimeout(() => setToken(null), 150),
    'aria-autocomplete': 'list',
    'aria-expanded': Boolean(token && items.length),
  };
  return html`<div class=${`mention-field ${className}`}>
    ${multiline ? html`<textarea ...${field}></textarea>` : html`<input ...${field} />`}
    ${token && items.length ? html`<ul class="suggestions" role="listbox">
      ${items.map((item, i) => html`<li key=${item.id || item.tag} role="option" aria-selected=${i === active}
          class=${i === active ? 'active' : ''} onMouseDown=${(e) => { e.preventDefault(); pick(item); }}>
        ${token.kind === '@'
          ? html`<${Avatar} url=${api.avatarUrl(item.avatar_path)} name=${item.username} size=${28} /><strong>@${item.username}</strong>`
          : html`<span class="tag-icon">#</span><strong>${item.tag}</strong>
              <small class="muted">${compact(item.post_count)} ${item.post_count === 1 ? 'post' : 'posts'}</small>`}
      </li>`)}
    </ul>` : null}
  </div>`;
}
