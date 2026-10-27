import { useEffect, useState } from 'preact/hooks';
import * as api from '../lib/api.js';
import { describeError } from '../lib/backend.js';
import { CATEGORIES, compact, plural } from '../lib/format.js';

const entries = (n) => `${compact(n)} ${n === 1 ? 'entry' : 'entries'}`;
import { html } from '../lib/html.js';
import { navigate } from '../lib/router.js';
import { setState, useStore } from '../lib/store.js';
import { Chip, Confirm, Empty, ErrorState, Icon, Modal, Photo, Spinner, toast } from '../components/ui.js';

/** "3 days left", "Starts in 5 hours", "Ended Oct 12". */
export function challengeTime(ch) {
  const now = Date.now();
  const start = new Date(ch.starts_at).getTime();
  const end = new Date(ch.ends_at).getTime();
  const span = (ms) => {
    const hours = Math.max(1, Math.round(ms / 3600000));
    return hours < 48 ? plural(hours, 'hour') : plural(Math.round(hours / 24), 'day');
  };
  if (now < start) return `Starts in ${span(start - now)}`;
  if (now < end) return `${span(end - now)} left`;
  return `Ended ${new Date(end).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;
}

/** 🔥 streak and today's progress toward the daily goal. Loads once, then updates after each rating. */
export function StreakPill({ large = false }) {
  const { streak } = useStore();
  useEffect(() => { if (!streak) api.streak().then((s) => setState({ streak: s })).catch(() => {}); }, []);
  if (!streak) return null;
  const done = Math.min(streak.today, streak.goal);
  const label = `${plural(streak.current, 'day')} streak · ${done} of ${streak.goal} today`;
  return html`<div class=${`streak ${large ? 'large' : ''} ${streak.today >= streak.goal ? 'done' : ''}`} title=${label} aria-label=${label}>
    <span class=${`flame ${streak.today > 0 ? 'lit' : ''}`} aria-hidden="true">🔥</span>
    <strong>${streak.current}</strong>
    <span class="streak-track" aria-hidden="true"><span style=${`width:${(100 * done) / streak.goal}%`}></span></span>
    <small>${done}/${streak.goal}</small>
    ${large ? html`<small class="muted">Best ${plural(streak.best, 'day')}</small>` : null}
  </div>`;
}

/** The running challenge, for the top of Discover. */
export function ChallengeBanner() {
  const [list, setList] = useState(null);
  useEffect(() => { api.challenges().then(setList).catch(() => setList([])); }, []);
  const active = list?.find((c) => c.status === 'active');
  if (!active) return null;
  return html`<a class="challenge-banner" href=${`#/challenge/${active.id}`}>
    <span class="challenge-icon" aria-hidden="true">🏆</span>
    <span><small>Weekly challenge · ${challengeTime(active)}</small><strong>${active.title}</strong>
      <small class="muted">#${active.tag} · ${entries(active.entry_count)}</small></span>
    <${Icon} name="right" size=${18} />
  </a>`;
}

/** #/top: challenges and leaderboards. */
export function TopPage() {
  const store = useStore();
  const [tab, setTab] = useState('challenges');
  return html`<div class="page wide-page">
    <div class="page-title-row">
      <h1 class="page-title">Top</h1>
      <${StreakPill} />
    </div>
    <div class="tabs" role="tablist">
      ${[['challenges', 'Challenges'], ['leaderboard', 'Leaderboard']].map(([value, label]) => html`
        <button role="tab" aria-selected=${tab === value} class=${tab === value ? 'on' : ''} onClick=${() => setTab(value)}>${label}</button>`)}
    </div>
    ${tab === 'challenges' ? html`<${Challenges} canCreate=${store.isAdmin} />` : html`<${Leaderboard} />`}
  </div>`;
}

function Challenges({ canCreate }) {
  const [list, setList] = useState(null);
  const [error, setError] = useState(null);
  const [creating, setCreating] = useState(false);
  const load = () => { setError(null); api.challenges().then(setList).catch((e) => setError(describeError(e))); };
  useEffect(load, []);

  if (error) return html`<${ErrorState} message=${error} onRetry=${load} />`;
  if (!list) return html`<${Spinner} />`;
  const groups = [['active', 'Now'], ['upcoming', 'Coming up'], ['ended', 'Past challenges']];
  return html`<div class="challenges">
    ${canCreate ? html`<button class="btn small" onClick=${() => setCreating(true)}><${Icon} name="plus" size=${16} /> New challenge</button>` : null}
    ${list.length === 0 ? html`<${Empty} icon="star" title="No challenges yet"
        message="Each week there's a theme. Post with its #tag, and the top rated post wins." />` : null}
    ${groups.map(([status, title]) => {
      const items = list.filter((c) => c.status === status);
      return items.length ? html`<section key=${status}>
        <h3>${title}</h3>
        ${items.map((c) => html`<${ChallengeCard} key=${c.id} challenge=${c} />`)}
      </section>` : null;
    })}
    ${creating ? html`<${NewChallenge} onClose=${() => setCreating(false)} onCreated=${() => { setCreating(false); load(); }} />` : null}
  </div>`;
}

function ChallengeCard({ challenge: c }) {
  return html`<a class=${`challenge-card ${c.status}`} href=${`#/challenge/${c.id}`}>
    ${c.winner ? html`<span class="challenge-thumb"><${Photo} url=${api.postThumb(c.winner)} alt="Winning post" /></span>`
      : html`<span class="challenge-icon" aria-hidden="true">${c.status === 'ended' ? '🏁' : '🏆'}</span>`}
    <span class="challenge-text">
      <strong>${c.title}</strong>
      <small>#${c.tag} · ${challengeTime(c)} · ${entries(c.entry_count)}</small>
      ${c.winner ? html`<small class="gold">Won by ${c.winner.author_username ? `@${c.winner.author_username}` : 'an anonymous post'}</small>`
        : c.status === 'ended' ? html`<small class="muted">No winner (needed 3+ ratings)</small>` : null}
    </span>
    <${Icon} name="right" size=${18} />
  </a>`;
}

/** #/challenge/<id>: the theme, a button to enter, and its leaderboard. */
export function ChallengePage({ id }) {
  const store = useStore();
  const [challenge, setChallenge] = useState(undefined);
  const [rows, setRows] = useState(null);
  const [error, setError] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const load = async () => {
    setError(null);
    try {
      const [list, board] = await Promise.all([api.challenges(), api.challengeLeaderboard(id)]);
      setChallenge(list.find((c) => c.id === id) ?? null);
      setRows(board);
    } catch (e) {
      setError(describeError(e));
    }
  };
  useEffect(() => { load(); }, [id]);

  async function remove() {
    try {
      await api.deleteChallenge(id);
      toast('Challenge deleted');
      navigate('/top');
    } catch (e) {
      toast(describeError(e));
    }
  }

  if (error) return html`<${ErrorState} message=${error} onRetry=${load} />`;
  if (challenge === undefined) return html`<${Spinner} big />`;
  if (!challenge) return html`<${Empty} icon="search" title="Challenge not found" action="See challenges" onAction=${() => navigate('/top')} />`;
  return html`<div class="page narrow">
    <button class="link back" onClick=${() => history.back()}><${Icon} name="back" size=${18} /> Back</button>
    <div class="challenge-hero">
      <span class="challenge-icon big" aria-hidden="true">🏆</span>
      <small class="muted">${challengeTime(challenge)} · ${entries(challenge.entry_count)}</small>
      <h1>${challenge.title}</h1>
      <a class="hashtag" href=${`#/tag/${challenge.tag}`}>#${challenge.tag}</a>
      ${challenge.description ? html`<p>${challenge.description}</p>` : null}
      ${challenge.status === 'active' ? html`<button class="btn primary" onClick=${() => navigate(`/create?tag=${challenge.tag}`)}>
          <${Icon} name="plus" size=${18} /> Enter with a post</button>
        <small class="muted">Post with #${challenge.tag} before it ends. The top rated post (3+ ratings) wins.</small>` : null}
      ${store.isAdmin ? html`<button class="link small danger" onClick=${() => setConfirmDelete(true)}>Delete challenge</button>` : null}
    </div>
    <h3>${challenge.status === 'ended' ? 'Final standings' : 'Leaderboard'}</h3>
    <${RankedList} rows=${rows} empty="No entries yet. Be the first!" />
    ${confirmDelete ? html`<${Confirm} title="Delete this challenge?" message="Its posts stay up; only the challenge is removed."
      confirmLabel="Delete" danger=${true} onConfirm=${remove} onCancel=${() => setConfirmDelete(false)} />` : null}
  </div>`;
}

function Leaderboard() {
  const [period, setPeriod] = useState('week');
  const [category, setCategory] = useState(null);
  const [rows, setRows] = useState(null);
  const [error, setError] = useState(null);
  const load = () => {
    setError(null);
    setRows(null);
    api.leaderboard(period, category).then(setRows).catch((e) => setError(describeError(e)));
  };
  useEffect(load, [period, category]);
  return html`<div class="leaderboard">
    <div class="chips">
      ${[['week', 'This week'], ['month', 'This month'], ['all', 'All time']].map(([value, label]) => html`
        <${Chip} label=${label} selected=${period === value} onClick=${() => setPeriod(value)} />`)}
    </div>
    <div class="chips">
      <${Chip} label="All" selected=${!category} onClick=${() => setCategory(null)} />
      ${CATEGORIES.map((c) => html`<${Chip} label=${c} selected=${category === c} onClick=${() => setCategory(category === c ? null : c)} />`)}
    </div>
    ${error ? html`<${ErrorState} message=${error} onRetry=${load} />` : html`<${RankedList} rows=${rows}
      empty=${period === 'week' ? 'Nothing rated this week yet.' : 'Nothing rated yet.'} />`}
  </div>`;
}

/** Ranked posts. The average shows once you've rated a post (or if it's yours), so the list doesn't sway your rating. */
export function RankedList({ rows, empty }) {
  if (!rows) return html`<${Spinner} />`;
  if (!rows.length) return html`<p class="muted center">${empty}</p>`;
  return html`<ol class="ranked">
    ${rows.map(({ rank, average, post }) => html`<li key=${post.id}>
      <a href=${`#/p/${post.id}`} class=${`rank-row ${rank <= 3 ? `top${rank}` : ''}`}>
        <span class="rank">${rank <= 3 ? ['🥇', '🥈', '🥉'][rank - 1] : rank}</span>
        <span class="rank-thumb"><${Photo} url=${api.postThumb(post)} alt=${post.caption || `${post.category} post`} /></span>
        <span class="rank-text">
          <strong>${post.caption || post.category}</strong>
          <small>${post.author_username ? `@${post.author_username}` : 'Anonymous'} · ${plural(post.rating_count, 'rating')}</small>
        </span>
        <span class="rank-score">${average != null ? html`<strong>${Number(average).toFixed(1)}</strong>`
          : html`<small class="muted">Rate to see</small>`}</span>
      </a>
    </li>`)}
  </ol>`;
}

function NewChallenge({ onClose, onCreated }) {
  const today = new Date();
  const iso = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  const [form, setForm] = useState({
    title: '', tag: '', description: '', start: iso(today), end: iso(new Date(today.getTime() + 7 * 86400000)),
  });
  const [busy, setBusy] = useState(false);
  const set = (patch) => setForm({ ...form, ...patch });
  const tag = form.tag.replace(/^#+/, '').toLowerCase();
  const valid = form.title.trim() && /^[a-z0-9_]{1,30}$/.test(tag) && /[a-z]/.test(tag) && form.end > form.start;

  async function create(e) {
    e.preventDefault();
    setBusy(true);
    try {
      await api.createChallenge({
        tag, title: form.title.trim(), description: form.description.trim(),
        startsAt: new Date(form.start).toISOString(), endsAt: new Date(form.end).toISOString(),
      });
      toast('Challenge created');
      onCreated();
    } catch (err) {
      toast(describeError(err));
      setBusy(false);
    }
  }

  return html`<${Modal} title="New challenge" onClose=${onClose}>
    <form class="form" onSubmit=${create}>
      <label>Title<input class="field" maxlength="60" placeholder="Desk setup week" value=${form.title}
        onInput=${(e) => set({ title: e.target.value })} required /></label>
      <label>Hashtag<input class="field" maxlength="31" placeholder="#desksetupweek" value=${form.tag}
        onInput=${(e) => set({ tag: e.target.value })} required /></label>
      <label>Description <small class="muted">(optional)</small><textarea class="field" maxlength="300" rows="3"
        placeholder="Show off your desk. Cable management counts." value=${form.description}
        onInput=${(e) => set({ description: e.target.value })}></textarea></label>
      <div class="row">
        <label>Starts<input class="field" type="datetime-local" value=${form.start} onInput=${(e) => set({ start: e.target.value })} /></label>
        <label>Ends<input class="field" type="datetime-local" value=${form.end} onInput=${(e) => set({ end: e.target.value })} /></label>
      </div>
      <p class="muted small">Rated posts with the hashtag made between these times compete. The top rated one (3+ ratings) wins.</p>
      <button class="btn primary block" disabled=${!valid || busy}>${busy ? 'Creating…' : 'Create challenge'}</button>
    </form>
  </${Modal}>`;
}

