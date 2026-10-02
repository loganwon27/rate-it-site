import { useEffect, useState } from 'preact/hooks';
import * as api from '../lib/api.js';
import { describeError } from '../lib/backend.js';
import { ago, compact, ratingColor } from '../lib/format.js';
import { html } from '../lib/html.js';
import { useStore } from '../lib/store.js';
import { Avatar, Empty, ErrorState, Photo, Spinner } from '../components/ui.js';

const REFRESH_MS = 30_000;

/** Admin-only dashboard: app-wide rating activity, refreshed every 30 seconds while the tab is open. */
export function InsightsPage() {
  const store = useStore();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [days, setDays] = useState(14);
  const [hideSample, setHideSample] = useState(false);
  const [, tick] = useState(0);

  const load = () => api.insights(days).then((d) => { setData(d); setError(null); }).catch((e) => setError(describeError(e)));
  useEffect(() => {
    if (!store.isAdmin) return undefined;
    load();
    const refresh = setInterval(() => { if (!document.hidden) load(); }, REFRESH_MS);
    const clock = setInterval(() => tick((n) => n + 1), 5_000);
    const onVisible = () => { if (!document.hidden) load(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { clearInterval(refresh); clearInterval(clock); document.removeEventListener('visibilitychange', onVisible); };
  }, [days, store.isAdmin]);

  if (!store.isAdmin) return html`<${Empty} icon="shield" title="Admins only" />`;
  if (error && !data) return html`<${ErrorState} message=${error} onRetry=${load} />`;
  if (!data) return html`<div class="page center"><${Spinner} big /></div>`;

  const t = data.totals;
  const accounts = hideSample ? data.accounts.filter((a) => !a.is_sample) : data.accounts;
  return html`<div class="page wide-page insights">
    <div class="insights-head">
      <h1 class="page-title">Insights</h1>
      <span class="muted small live"><i></i> Live · updated ${ago(data.generated_at) === 'now' ? 'just now' : `${ago(data.generated_at)} ago`}</span>
    </div>
    ${error ? html`<p class="notice">Couldn't refresh: ${error}. Showing the last update.</p>` : null}

    <div class="stat-grid">
      <${Stat} label="Ratings" value=${t.ratings} sub=${`${compact(t.ratings_24h)} in the last 24h`} />
      <${Stat} label="Average score" value=${t.average_score ?? '—'} sub=${`${Math.round((t.anonymous_share || 0) * 100)}% anonymous`} />
      <${Stat} label="Active people" value=${t.active_24h} sub=${`${compact(t.active_7d)} this week`} />
      <${Stat} label="Accounts" value=${t.accounts} sub=${`${compact(t.sample_accounts)} starter · ${compact(t.new_accounts_7d)} new this week`} />
      <${Stat} label="Posts" value=${t.posts} sub=${`${compact(t.likes)} likes · ${compact(t.comments)} comments`} />
    </div>

    <div class="insights-row">
      <section class="panel grow">
        <div class="panel-head">
          <h2>Ratings per day</h2>
          <div class="seg" role="tablist">
            ${[7, 14, 30].map((d) => html`<button role="tab" aria-selected=${days === d} class=${days === d ? 'on' : ''}
              onClick=${() => setDays(d)}>${d}d</button>`)}
          </div>
        </div>
        <${BarChart} items=${data.daily.map((d) => ({
          key: d.day, value: d.ratings,
          label: new Date(`${d.day}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
          detail: `${d.ratings} ratings · ${d.likes} likes · ${d.posts} posts · ${d.signups} sign-ups`,
        }))} labelEvery=${days > 14 ? 5 : days > 7 ? 2 : 1} />
      </section>
      <section class="panel">
        <div class="panel-head"><h2>Scores given</h2></div>
        <${BarChart} items=${data.scores.map((n, i) => ({
          key: i + 1, value: n, label: `${i + 1}`, color: ratingColor(i + 1),
          detail: `${compact(n)} ${n === 1 ? 'rating' : 'ratings'} of ${i + 1}`,
        }))} />
      </section>
    </div>

    <div class="insights-row">
      <section class="panel grow">
        <div class="panel-head"><h2>Categories</h2></div>
        <${CategoryTable} rows=${data.categories} />
      </section>
      <section class="panel">
        <div class="panel-head"><h2>Highest rated</h2><span class="muted small">3+ ratings</span></div>
        ${data.top_posts.length === 0 ? html`<p class="muted small">Nothing with 3 ratings yet.</p>`
          : html`<div class="top-posts">${data.top_posts.map((p) => html`<a href=${`#/p/${p.id}`} title=${p.caption || p.category}>
              <${Photo} url=${api.postThumb(p)} />
              <span class="score" style=${`color:${ratingColor(p.avg_score)}`}>${Number(p.avg_score).toFixed(1)}</span>
            </a>`)}</div>`}
      </section>
    </div>

    <section class="panel">
      <div class="panel-head">
        <h2>Accounts <span class="muted">${accounts.length}</span></h2>
        <label class="muted small check"><input type="checkbox" checked=${hideSample}
          onChange=${(e) => setHideSample(e.target.checked)} /> Hide starter accounts</label>
      </div>
      <${AccountTable} rows=${accounts} />
      <p class="muted small">Totals and favourite categories only. Which posts someone rated stays private,
        so anonymous ratings stay anonymous.</p>
    </section>
  </div>`;
}

function Stat({ label, value, sub }) {
  return html`<div class="stat-tile">
    <span class="muted small">${label}</span>
    <strong>${typeof value === 'number' ? compact(value) : value}</strong>
    <span class="faint small">${sub}</span>
  </div>`;
}

/** Single-series bar chart with a hover tooltip. Bars are anchored to the baseline; the hit area is the full column. */
function BarChart({ items, labelEvery = 1 }) {
  const [hover, setHover] = useState(null);
  const max = Math.max(1, ...items.map((i) => i.value));
  const active = hover != null ? items[hover] : null;
  return html`<div class="bars" onMouseLeave=${() => setHover(null)}>
    <div class="bars-plot">
      ${items.map((item, i) => html`<button class=${`bar-col ${hover === i ? 'on' : ''}`} key=${item.key}
          onMouseEnter=${() => setHover(i)} onFocus=${() => setHover(i)} onBlur=${() => setHover(null)}
          aria-label=${`${item.label}: ${item.detail}`}>
        <span class="bar" style=${`height:${item.value ? Math.max(2, (item.value / max) * 100) : 0}%;${item.color ? `background:${item.color}` : ''}`}></span>
      </button>`)}
      ${active ? html`<div class=${`bar-tip ${tipSide(hover, items.length)}`} style=${`left:${((hover + 0.5) / items.length) * 100}%`}>
        <strong>${active.label}</strong><span>${active.detail}</span></div>` : null}
    </div>
    <div class="bars-axis">
      ${items.map((item, i) => html`<span key=${item.key}>${i % labelEvery === 0 ? item.label : ''}</span>`)}
    </div>
  </div>`;
}

/** Keeps the tooltip inside the chart: near the edges it hangs inward instead of centring on the bar. */
function tipSide(index, count) {
  const at = (index + 0.5) / count;
  return at < 0.25 ? 'from-left' : at > 0.75 ? 'from-right' : '';
}

function CategoryTable({ rows }) {
  if (!rows.length) return html`<p class="muted small">No posts yet.</p>`;
  const max = Math.max(1, ...rows.map((r) => r.ratings));
  return html`<div class="table-scroll"><table class="data-table">
    <thead><tr><th>Category</th><th>Ratings</th><th class="num">Avg</th><th class="num">Posts</th><th class="num">Likes</th></tr></thead>
    <tbody>${rows.map((r) => html`<tr>
      <td class="cap">${r.category}</td>
      <td><span class="meter"><span style=${`width:${(r.ratings / max) * 100}%`}></span></span> ${compact(r.ratings)}</td>
      <td class="num" style=${r.avg_score ? `color:${ratingColor(r.avg_score)}` : ''}>${r.avg_score ? Number(r.avg_score).toFixed(1) : '—'}</td>
      <td class="num">${compact(r.posts)}</td>
      <td class="num">${compact(r.likes)}</td>
    </tr>`)}</tbody>
  </table></div>`;
}

function AccountTable({ rows }) {
  const [showAll, setShowAll] = useState(false);
  if (!rows.length) return html`<p class="muted small">No accounts.</p>`;
  const shown = showAll ? rows : rows.slice(0, 25);
  return html`<div class="table-scroll"><table class="data-table">
    <thead><tr><th>Account</th><th class="num">Ratings</th><th class="num">Avg given</th><th class="num">Likes</th>
      <th class="num">Posts</th><th>Loves</th><th>Avoids</th><th>Last active</th></tr></thead>
    <tbody>${shown.map((a) => html`<tr>
      <td><a class="who" href=${`#/u/${a.id}`}><${Avatar} url=${api.avatarUrl(a.avatar_path)} name=${a.username} size=${28} />
        @${a.username}${a.is_sample ? html` <small class="tag">starter</small>` : null}</a></td>
      <td class="num">${compact(a.ratings_given)}</td>
      <td class="num">${a.avg_given ? Number(a.avg_given).toFixed(1) : '—'}</td>
      <td class="num">${compact(a.likes_given)}</td>
      <td class="num">${compact(a.posts)}</td>
      <td class="cap">${a.loves || html`<span class="faint">—</span>`}</td>
      <td class="cap">${a.avoids || html`<span class="faint">—</span>`}</td>
      <td class="muted">${a.last_active ? ago(a.last_active) : '—'}</td>
    </tr>`)}</tbody>
  </table></div>
  ${rows.length > shown.length ? html`<button class="btn ghost small show-all" onClick=${() => setShowAll(true)}>
    Show all ${rows.length}</button>` : null}`;
}
