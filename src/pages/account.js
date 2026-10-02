import { useEffect, useState } from 'preact/hooks';
import * as api from '../lib/api.js';
import { describeError } from '../lib/backend.js';
import { ago, SITE_URL } from '../lib/format.js';
import { APPEARANCES, getAppearance, setAppearance } from '../lib/appearance.js';
import { html } from '../lib/html.js';
import { disablePush, enablePush, pushEnabled, pushSupport } from '../lib/push.js';
import { bumpVersion, setState, useStore } from '../lib/store.js';
import { Avatar, Confirm, Empty, ErrorState, Icon, Modal, Photo, Spinner, toast } from '../components/ui.js';

/** "Push notifications on this device": subscribes this browser to Web Push. */
function PushRow() {
  const support = pushSupport();
  const [on, setOn] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => { pushEnabled().then(setOn).catch(() => {}); }, []);

  async function toggle() {
    setBusy(true);
    try {
      if (on) { await disablePush(); setOn(false); toast('Push notifications off for this device'); }
      else { await enablePush(); setOn(true); toast('Push notifications on'); }
    } catch (e) {
      toast(e.message || describeError(e));
    }
    setBusy(false);
  }

  const hint = support === 'needs-home-screen'
    ? 'On iPhone: tap Share → Add to Home Screen, open Rate It from there, then turn this on.'
    : support === 'unsupported' ? "This browser doesn't support push notifications."
    : 'Get likes, comments and new followers even when Rate It is closed.';
  return html`<label class="switch-row">
    <span>Push notifications on this device<br /><small class="muted">${hint}</small></span>
    <input type="checkbox" class="switch" checked=${on} disabled=${busy || support === 'unsupported'}
      onChange=${toggle} aria-label="Push notifications on this device" />
  </label>`;
}

export function SettingsPage() {
  const store = useStore();
  const settings = store.settings || {};
  const [dialog, setDialog] = useState(null);
  const [appearance, setAppearanceState] = useState(getAppearance);

  function toggle(key) {
    const value = !settings[key];
    setState({ settings: { ...settings, [key]: value } });
    api.saveSettings({ [key]: value }).catch((e) => toast(describeError(e)));
  }

  const toggleRow = (key, label, hint) => html`<label class="switch-row">
    <span>${label}${hint ? html`<br /><small class="muted">${hint}</small>` : null}</span>
    <input type="checkbox" class="switch" checked=${Boolean(settings[key])} onChange=${() => toggle(key)} />
  </label>`;

  return html`<div class="page narrow">
    <h1 class="page-title">Settings</h1>
    <section class="group">
      <h3>Account</h3>
      <div class="kv"><span>Username</span><span>@${store.profile?.username}</span></div>
      <div class="kv"><span>Email</span><span>${store.session?.user?.email}</span></div>
    </section>
    <section class="group">
      <h3>Appearance</h3>
      <div class="seg appearance-seg" role="radiogroup" aria-label="Appearance">
        ${APPEARANCES.map(([value, label]) => html`<button role="radio" aria-checked=${appearance === value}
          class=${appearance === value ? 'on' : ''} onClick=${() => { setAppearance(value); setAppearanceState(value); }}>${label}</button>`)}
      </div>
      <small class="muted">System follows your device's light or dark setting.</small>
    </section>
    <section class="group">
      <h3>Privacy</h3>
      ${toggleRow('rate_anonymously', 'Rate anonymously', 'People see your rating in their totals but not that it came from you.')}
    </section>
    <section class="group">
      <h3>Notifications</h3>
      <${PushRow} />
      ${toggleRow('notify_follows', 'New followers')}
      ${toggleRow('notify_likes', 'Likes')}
      ${toggleRow('notify_comments', 'Comments')}
      ${toggleRow('notify_milestones', 'Rating milestones')}
    </section>
    ${store.isAdmin ? html`<section class="group">
      <h3>Admin</h3>
      <a class="link-row" href="#/moderation"><span><${Icon} name="shield" size=${18} /> Moderation queue</span><span>›</span></a>
      <a class="link-row" href="#/insights"><span><${Icon} name="chart" size=${18} /> Insights</span><span>›</span></a>
    </section>` : null}
    <section class="group">
      <button class="link-row" onClick=${() => setDialog('blocked')}><span>Blocked users</span><span>›</span></button>
      <a class="link-row" href=${`${SITE_URL}support/`} target="_blank" rel="noopener"><span>Help & support</span><span>↗</span></a>
      <a class="link-row" href=${`${SITE_URL}terms/`} target="_blank" rel="noopener"><span>Terms of Service</span><span>↗</span></a>
      <a class="link-row" href=${`${SITE_URL}privacy/`} target="_blank" rel="noopener"><span>Privacy Policy</span><span>↗</span></a>
    </section>
    <section class="group">
      <button class="link-row" onClick=${() => setDialog('logout')}><span>Log out</span></button>
      <button class="link-row danger" onClick=${() => setDialog('delete')}><span>Delete account</span></button>
    </section>
    ${dialog === 'blocked' ? html`<${BlockedUsers} onClose=${() => setDialog(null)} />` : null}
    ${dialog === 'logout' ? html`<${Confirm} title="Log out?" confirmLabel="Log out"
        onConfirm=${() => api.signOut()} onCancel=${() => setDialog(null)} />` : null}
    ${dialog === 'delete' ? html`<${DeleteAccount} onClose=${() => setDialog(null)} />` : null}
  </div>`;
}

function BlockedUsers({ onClose }) {
  const [people, setPeople] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => { api.blockedUsers().then(setPeople).catch((e) => setError(describeError(e))); }, []);
  async function unblock(person) {
    try {
      await api.unblock(person.id);
      setPeople(people.filter((p) => p.id !== person.id));
      bumpVersion();
    } catch (e) {
      toast(describeError(e));
    }
  }
  return html`<${Modal} title="Blocked users" onClose=${onClose}>
    ${error ? html`<p class="error">${error}</p>` : !people ? html`<${Spinner} />`
      : people.length === 0 ? html`<p class="muted center">No one blocked. People you block show up here.</p>`
      : html`<ul class="people">${people.map((p) => html`<li>
          <${Avatar} url=${api.avatarUrl(p.avatar_path)} name=${p.username} size=${36} /><strong>@${p.username}</strong>
          <button class="btn ghost small" onClick=${() => unblock(p)}>Unblock</button>
        </li>`)}</ul>`}
  </${Modal}>`;
}

function DeleteAccount({ onClose }) {
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  async function confirm() {
    setBusy(true);
    try {
      await api.deleteAccount();
    } catch (e) {
      setError(describeError(e));
      setBusy(false);
    }
  }
  return html`<${Modal} title="Delete your account?" onClose=${onClose}>
    <p class="muted">This permanently deletes your profile, posts, photos, ratings and comments. It can't be undone.</p>
    <input class="field" placeholder="Type DELETE to confirm" value=${typed} onInput=${(e) => setTyped(e.target.value)} />
    ${error ? html`<p class="error">${error}</p>` : null}
    <div class="row end">
      <button class="btn ghost" onClick=${onClose}>Cancel</button>
      <button class="btn danger" disabled=${typed.trim().toUpperCase() !== 'DELETE' || busy} onClick=${confirm}>
        ${busy ? 'Deleting…' : 'Delete forever'}
      </button>
    </div>
  </${Modal}>`;
}

export function NotificationsPage() {
  const [items, setItems] = useState(null);
  const [error, setError] = useState(null);
  const load = async () => {
    setError(null);
    try {
      setItems(await api.notifications());
      await api.markAllRead();
      setState({ unread: 0 });
    } catch (e) {
      setError(describeError(e));
    }
  };
  useEffect(() => { load(); }, []);
  const message = (n) => {
    const name = n.actor ? `@${n.actor.username}` : 'Someone';
    return {
      follow: `${name} followed you`, like: `${name} liked your post`, comment: `${name} commented on your post`,
      rating_milestone: `Your post reached ${n.data?.count ?? ''} ratings`,
    }[n.type];
  };
  return html`<div class="page narrow">
    <h1 class="page-title">Notifications</h1>
    ${error ? html`<${ErrorState} message=${error} onRetry=${load} />` : !items ? html`<${Spinner} />`
      : items.length === 0 ? html`<${Empty} icon="bell" title="No notifications yet"
          message="When people follow you, like or comment on your posts, it'll show up here." />`
      : html`<ul class="notes">${items.map((n) => html`<li class=${n.read_at ? '' : 'unread'}>
          <a href=${n.post_id ? `#/p/${n.post_id}` : n.actor ? `#/u/${n.actor.id}` : '#/notifications'}>
            ${n.type === 'rating_milestone'
              ? html`<span class="milestone"><${Icon} name="star" size=${18} /></span>`
              : html`<${Avatar} url=${api.avatarUrl(n.actor?.avatar_path)} name=${n.actor?.username} size=${40} />`}
            <span>${message(n)}<br /><small class="muted">${ago(n.created_at)}</small></span>
          </a></li>`)}</ul>`}
  </div>`;
}

const REASON_LABELS = { spam: 'Spam', harassment: 'Harassment', inappropriate: 'Inappropriate content', hate: 'Hate',
  sexual: 'Sexual content', violence: 'Violence', other: 'Other' };

/** Admins review reports here. Apple expects reports to be handled within 24 hours. */
export function ModerationPage() {
  const store = useStore();
  const [items, setItems] = useState(null);
  const [error, setError] = useState(null);
  const [confirming, setConfirming] = useState(null);
  const load = () => { setError(null); api.openReports().then(setItems).catch((e) => setError(describeError(e))); };
  useEffect(() => { load(); }, []);

  async function resolve() {
    const { item, action } = confirming;
    setConfirming(null);
    try {
      await api.resolveReport(item, action);
      setItems(items.filter((i) => !(i.target_id === item.target_id && i.target_type === item.target_type)));
      toast(action === 'dismiss' ? 'Reports closed' : 'Done');
    } catch (e) {
      toast(describeError(e));
    }
  }

  if (!store.isAdmin) return html`<${Empty} icon="shield" title="Admins only" />`;
  const titles = { dismiss: 'Keep it and close these reports?', remove: 'Remove this?', ban: 'Remove it and ban the author?' };
  return html`<div class="page narrow">
    <h1 class="page-title">Moderation</h1>
    ${error ? html`<${ErrorState} message=${error} onRetry=${load} />` : !items ? html`<${Spinner} />`
      : items.length === 0 ? html`<${Empty} icon="shield" title="All clear" message="No open reports." />`
      : items.map((item) => html`<div class="report-card">
          ${item.target_type === 'post' && item.thumb_path
            ? html`<a href=${`#/p/${item.target_id}`}><${Photo} url=${api.postThumb(item)} className="report-thumb" /></a>` : null}
          <div class="report-info">
            <div><strong class="gold">${item.target_type[0].toUpperCase() + item.target_type.slice(1)}</strong>
              · ${item.report_count} ${item.report_count === 1 ? 'report' : 'reports'}
              ${item.is_hidden ? html`<small class="muted"> · auto-hidden</small>` : null}</div>
            <div class="muted small">${item.reasons.map((r) => REASON_LABELS[r] || r).join(', ')}</div>
            ${item.author_username ? html`<div>by <a href=${`#/u/${item.author_id}`}>@${item.author_username}</a></div>`
              : html`<div class="muted small">Already deleted</div>`}
            ${item.comment_body || item.caption ? html`<p>“${item.comment_body || item.caption}”</p>` : null}
            ${item.latest_details ? html`<p class="muted small">Reporter: ${item.latest_details}</p>` : null}
            <div class="row">
              <button class="btn ghost small" onClick=${() => setConfirming({ item, action: 'dismiss' })}>Keep</button>
              ${item.author_id ? html`
                <button class="btn ghost small warn" onClick=${() => setConfirming({ item, action: 'remove' })}>Remove</button>
                <button class="btn ghost small danger-text" onClick=${() => setConfirming({ item, action: 'ban' })}>Ban</button>` : null}
            </div>
          </div>
        </div>`)}
    ${confirming ? html`<${Confirm} title=${titles[confirming.action]} danger=${confirming.action !== 'dismiss'}
        confirmLabel=${{ dismiss: 'Keep it', remove: 'Remove', ban: 'Remove and ban' }[confirming.action]}
        onConfirm=${resolve} onCancel=${() => setConfirming(null)} />` : null}
  </div>`;
}

