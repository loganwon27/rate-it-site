import { useState } from 'preact/hooks';
import * as api from '../lib/api.js';
import { describeError } from '../lib/backend.js';
import { html } from '../lib/html.js';
import { Chip, Modal, toast } from './ui.js';

const HOUR = 3600 * 1000;
const DAY = 24 * HOUR;
const LENGTHS = [
  ['1 hour', HOUR], ['1 day', DAY], ['3 days', 3 * DAY], ['1 week', 7 * DAY], ['30 days', 30 * DAY], ['Forever', null],
];

/** "Banned until Oct 10, 3:00 PM" / "Banned forever" / null when not banned (a run-out ban doesn't count). */
export function banLabel(profile) {
  if (!profile?.banned_at) return null;
  if (!profile.banned_until) return 'Banned forever';
  const until = new Date(profile.banned_until);
  if (until <= new Date()) return null;
  return `Banned until ${until.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}`;
}

/** Owner only: ban someone for a set time or forever. `onBanned(untilIso | null)` runs after it's saved. */
export function BanDialog({ username, userId, onClose, onBanned }) {
  const [choice, setChoice] = useState('1 day');
  const [customDays, setCustomDays] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const custom = choice === 'Custom';
  const days = Number(customDays);
  const length = custom ? (days > 0 ? days * DAY : undefined) : LENGTHS.find(([label]) => label === choice)[1];
  const valid = length !== undefined && (!custom || (days > 0 && days <= 3650));

  async function ban() {
    setBusy(true);
    setError(null);
    try {
      const until = length === null ? null : new Date(Date.now() + length).toISOString();
      await api.ownerBan(userId, until, reason.trim());
      toast(until ? `@${username} is banned` : `@${username} is banned forever`);
      onBanned(until);
    } catch (e) {
      setError(describeError(e));
      setBusy(false);
    }
  }

  return html`<${Modal} title=${`Ban @${username}`} onClose=${onClose}>
    <p class="muted">They won't be able to post, rate, like, comment or follow, and their profile and posts are hidden
      until the ban ends. Timed bans lift on their own.</p>
    <label class="label">How long</label>
    <div class="chips wrap" role="radiogroup" aria-label="Ban length">
      ${[...LENGTHS.map(([label]) => label), 'Custom'].map((label) => html`<${Chip} label=${label} selected=${choice === label}
        onClick=${() => setChoice(label)} />`)}
    </div>
    ${custom ? html`<label class="field"><input type="number" min="1" max="3650" inputmode="numeric" placeholder="Number of days"
        value=${customDays} onInput=${(e) => setCustomDays(e.target.value)} aria-label="Number of days" /><span class="muted">days</span></label>` : null}
    <label class="label">Reason <span class="muted small">(only you see this)</span></label>
    <textarea rows="2" maxlength="300" value=${reason} onInput=${(e) => setReason(e.target.value)} placeholder="e.g. spam, harassment"></textarea>
    ${error ? html`<p class="error">${error}</p>` : null}
    <div class="row end">
      <button class="btn ghost" onClick=${onClose}>Cancel</button>
      <button class="btn danger" disabled=${!valid || busy} onClick=${ban}>
        ${busy ? 'Banning…' : choice === 'Forever' ? 'Ban forever' : 'Ban'}</button>
    </div>
  </${Modal}>`;
}
