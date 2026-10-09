import { useState } from 'preact/hooks';
import * as api from '../lib/api.js';
import { describeError } from '../lib/backend.js';
import { html } from '../lib/html.js';
import { Badge, Chip, Modal, toast } from './ui.js';

const HOUR = 3600 * 1000;
const DAY = 24 * HOUR;
const LENGTHS = [
  ['1 hour', HOUR], ['1 day', DAY], ['3 days', 3 * DAY], ['1 week', 7 * DAY], ['30 days', 30 * DAY], ['Forever', null],
];

/** Forever bans delete the account this long after the ban (the database's ban_deletes_at matches). */
const DELETE_AFTER = 30 * DAY;

/** When a forever ban deletes the account, or null for a timed ban / no ban. */
export function banDeletesAt(profile) {
  if (!profile?.banned_at || profile.banned_until) return null;
  return new Date(new Date(profile.banned_at).getTime() + DELETE_AFTER);
}

export const shortDate = (date) => date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

/** "Banned until Oct 10, 3:00 PM" / "Banned forever · account deletes Nov 2" / null when not banned. */
export function banLabel(profile) {
  if (!profile?.banned_at) return null;
  if (!profile.banned_until) return `Banned forever · account deletes ${shortDate(banDeletesAt(profile))}`;
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
    ${choice === 'Forever' ? html`<p class="notice">A forever ban <strong>permanently deletes the account after 30 days</strong> (photos, ratings, comments,
      everything). Unban before then to stop it.</p>` : null}
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

const ROLES = [
  ['founder', 'Founder', 'Can ban, give roles, moderate and see insights.'],
  ['admin', 'Admin', 'Can moderate reports and see insights.'],
  ['friend', 'Founders-Friend', 'Just the tag, no extra powers.'],
  ['none', 'None', 'No tag, no extra powers.'],
];

/** Founders only: give someone a role (its powers and its tag). `onSaved(badge | null)` runs after it's saved. */
export function RoleDialog({ username, userId, current, onClose, onSaved }) {
  const [role, setRole] = useState(current || 'none');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await api.ownerSetRole(userId, role);
      const label = ROLES.find(([key]) => key === role)[1];
      toast(role === 'none' ? `@${username} has no role now` : `@${username} is now ${label}`);
      onSaved(role === 'none' ? null : role);
    } catch (e) {
      setError(describeError(e));
      setBusy(false);
    }
  }

  return html`<${Modal} title=${`Role for @${username}`} onClose=${onClose}>
    <div class="role-options" role="radiogroup" aria-label="Role">
      ${ROLES.map(([key, label, about]) => html`<button key=${key} role="radio" aria-checked=${role === key}
          class=${`role-option ${role === key ? 'selected' : ''}`} onClick=${() => setRole(key)}>
        <span>${key === 'none' ? html`<strong>${label}</strong>` : html`<${Badge} kind=${key} />`}</span>
        <small class="muted">${about}</small>
      </button>`)}
    </div>
    ${role === 'founder' && current !== 'founder' ? html`<p class="notice">Founders have the same powers as you, including
      banning and giving roles. Only make someone a founder if you fully trust them.</p>` : null}
    ${error ? html`<p class="error">${error}</p>` : null}
    <div class="row end">
      <button class="btn ghost" onClick=${onClose}>Cancel</button>
      <button class="btn primary" disabled=${busy || role === (current || 'none')} onClick=${save}>${busy ? 'Saving…' : 'Save'}</button>
    </div>
  </${Modal}>`;
}
