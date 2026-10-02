import { useEffect, useRef, useState } from 'preact/hooks';
import * as api from '../lib/api.js';
import { describeError } from '../lib/backend.js';
import { ago, compact, plural, ratingColor, REPORT_REASONS } from '../lib/format.js';
import { html } from '../lib/html.js';
import { navigate } from '../lib/router.js';
import { bumpVersion, getState, setState } from '../lib/store.js';
import { Avatar, Confirm, Empty, Icon, Modal, Photo, Spinner, toast, Badge } from './ui.js';

/** One post plus everything you can do to it — the web twin of the iOS PostState. */
export function usePost(initial) {
  const [post, setPost] = useState(initial);
  const [stats, setStats] = useState(null);
  const [chosen, setChosen] = useState(initial.my_score ?? null);
  const [busy, setBusy] = useState(false);
  const canSeeResults = post.my_score != null || post.is_mine;

  useEffect(() => {
    setPost(initial);
    setChosen(initial.my_score ?? null);
    setStats(null);
  }, [initial.id]);

  useEffect(() => {
    if (canSeeResults && !stats) {
      api.ratingStats(post.id).then(setStats).catch(() => {});
    }
  }, [post.id, canSeeResults]);

  async function rate(score) {
    if (post.my_score != null || post.is_mine || busy) return;
    setBusy(true);
    setChosen(score);
    try {
      const result = await api.rate(post.id, score, getState().settings?.rate_anonymously ?? true);
      setStats(result);
      setPost({ ...post, my_score: score, rating_count: result.count });
    } catch (error) {
      const message = describeError(error);
      if (message === 'You already rated this.') {
        const result = await api.ratingStats(post.id).catch(() => null);
        if (result) {
          setStats(result);
          setChosen(result.my_score);
          setPost({ ...post, my_score: result.my_score });
        }
      } else {
        setChosen(null);
      }
      toast(message);
    } finally {
      setBusy(false);
    }
  }

  async function toggleLike() {
    const liked = post.liked_by_me;
    setPost({ ...post, liked_by_me: !liked, like_count: post.like_count + (liked ? -1 : 1) });
    try {
      if (liked) await api.unlike(post.id);
      else await api.like(post.id);
    } catch (error) {
      setPost({ ...post });
      toast(describeError(error));
    }
  }

  return { post, setPost, stats, chosen, busy, canSeeResults, rate, toggleLike };
}

/** Ten cells. Click a number, or press and slide across them and let go. Keys 1–9 and 0 (=10) work too. */
export function RatingBar({ locked, busy, onRate, keyboard = false }) {
  const [hover, setHover] = useState(null);
  const barRef = useRef(null);
  const shown = locked ?? hover;

  useEffect(() => {
    if (!keyboard) return undefined;
    const onKey = (e) => {
      if (locked != null || busy || e.target.closest('input, textarea') || e.metaKey || e.ctrlKey) return;
      const score = e.key === '0' ? 10 : Number(e.key);
      if (score >= 1 && score <= 10) onRate(score);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [keyboard, locked, busy, onRate]);

  function scoreAt(clientX) {
    const rect = barRef.current.getBoundingClientRect();
    return Math.min(10, Math.max(1, Math.floor(((clientX - rect.left) / rect.width) * 10) + 1));
  }

  const interactive = locked == null && !busy;
  return html`<div class=${`rating-bar ${interactive ? '' : 'locked'}`} ref=${barRef}
      onPointerDown=${(e) => { if (!interactive) return; e.currentTarget.setPointerCapture(e.pointerId); setHover(scoreAt(e.clientX)); }}
      onPointerMove=${(e) => { if (interactive && (e.buttons || e.pointerType === 'mouse')) setHover(scoreAt(e.clientX)); }}
      onPointerUp=${(e) => { if (interactive && hover) { onRate(scoreAt(e.clientX)); setHover(null); } }}
      onPointerLeave=${(e) => { if (e.pointerType === 'mouse') setHover(null); }}
      role="group" aria-label=${locked != null ? `You rated ${locked}` : 'Rate from 1 to 10'}>
    ${hover && locked == null ? html`<span class="rating-bubble" style=${`left:${(hover - 0.5) * 10}%;background:${ratingColor(hover)}`}>${hover}</span>` : null}
    ${Array.from({ length: 10 }, (_, i) => i + 1).map((score) => {
      const lit = shown != null && score <= shown;
      const peak = shown === score;
      return html`<button class=${`cell ${lit ? 'lit' : ''} ${peak ? 'peak' : ''}`} style=${lit ? `background:${ratingColor(score)}` : ''}
        tabindex=${interactive ? 0 : -1} aria-label=${`${score}`} aria-pressed=${peak}
        onKeyDown=${(e) => { if (interactive && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onRate(score); } }}>${score}</button>`;
    })}
  </div>`;
}

/** The payoff after rating: the average counts up, plus rank, spread and how you compare. */
export function Results({ stats, mine, owner = false }) {
  const [shown, setShown] = useState(0);
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    if (!stats || stats.average == null) return undefined;
    let frame;
    const start = performance.now();
    const tick = (now) => {
      const t = Math.min(1, (now - start) / 700);
      setShown(stats.average * (1 - (1 - t) ** 3));
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    const timer = setTimeout(() => setRevealed(true), 50);
    return () => { cancelAnimationFrame(frame); clearTimeout(timer); };
  }, [stats]);

  if (!stats) return html`<div class="results loading"><${Spinner} /></div>`;
  const peak = Math.max(...stats.distribution, 1);
  let line = null;
  if (mine != null && stats.average != null) {
    const diff = mine - stats.average;
    if (stats.count <= 1) line = "You're the first to rate this.";
    else if (Math.abs(diff) < 0.5) line = "You're right in line with everyone.";
    else if (diff > 0 && stats.higher_than_percent != null) line = `You rated it higher than ${stats.higher_than_percent}% of people.`;
    else line = diff > 0 ? 'You liked it more than most.' : 'You were tougher than most.';
  }
  return html`<div class="results">
    <div class="results-top">
      <div>
        <div class="label">${owner ? 'Average rating' : 'Average'}</div>
        <div class="average">${stats.average == null ? '—' : shown.toFixed(1)}</div>
      </div>
      <div class="results-meta">
        ${stats.top_percent != null ? html`<span class="pill gold">Top ${stats.top_percent}%</span>` : null}
        <span class="muted small">${plural(stats.count, 'rating')}</span>
      </div>
    </div>
    <div class="distribution" aria-label="How everyone rated">
      ${stats.distribution.map((n, i) => html`<div class=${`dist-col ${mine === i + 1 ? 'mine' : ''}`}>
        <div class="dist-track"><div class="dist-bar" style=${`height:${revealed ? Math.max(4, (n / peak) * 100) : 4}%`}></div></div>
        <span>${i + 1}</span>
      </div>`)}
    </div>
    ${line ? html`<p class="muted small">${line}</p>` : null}
  </div>`;
}

export function PostHeader({ post, children }) {
  const author = post.author_id
    ? html`<a class="author" href=${`#/u/${post.author_id}`}>
        <${Avatar} url=${api.avatarUrl(post.author_avatar_path)} name=${post.author_username} size=${34} />
        <span><strong>@${post.author_username}<${Badge} kind=${post.author_badge} /></strong><small>${ago(post.created_at)}</small></span>
      </a>`
    : html`<span class="author">
        <span class="avatar avatar-fallback" style="width:34px;height:34px"><${Icon} name="eyeOff" size=${16} /></span>
        <span><strong>Anonymous</strong><small>${ago(post.created_at)}</small></span>
      </span>`;
  return html`<div class="post-head">${author}<span class="pill">${post.category}</span>${children}</div>`;
}

export function LikeButton({ post, onToggle }) {
  return html`<button class=${`action ${post.liked_by_me ? 'liked' : ''}`} onClick=${onToggle}
      aria-label=${post.liked_by_me ? 'Unlike' : 'Like'} aria-pressed=${post.liked_by_me}>
    <${Icon} name="heart" /><span>${compact(post.like_count)}</span>
  </button>`;
}

/** "Anonymous" / "Public" pill. Remembers the choice for every rating. */
export function AnonymityToggle() {
  const anonymous = getState().settings?.rate_anonymously ?? true;
  const flip = async () => {
    const next = !anonymous;
    setState({ settings: { ...getState().settings, rate_anonymously: next } });
    api.saveSettings({ rate_anonymously: next }).catch(() => {});
  };
  return html`<button class="pill toggle" onClick=${flip}
      title=${anonymous ? 'Your ratings are anonymous. Click to show your username.' : 'Your username is shown. Click to rate anonymously.'}>
    <${Icon} name=${anonymous ? 'eyeOff' : 'eye'} size=${15} /> ${anonymous ? 'Anonymous' : 'Public'}
  </button>`;
}

/** The ••• menu: report or block for other people's posts; delete or see ratings for your own. */
export function PostMenu({ post, onGone }) {
  const [open, setOpen] = useState(false);
  const [dialog, setDialog] = useState(null);
  useEffect(() => {
    if (!open) return undefined;
    const close = () => setOpen(false);
    setTimeout(() => window.addEventListener('click', close), 0);
    return () => window.removeEventListener('click', close);
  }, [open]);

  async function block() {
    try {
      await api.block(post.author_id);
      toast(`Blocked @${post.author_username}`);
      bumpVersion();
      onGone?.();
    } catch (error) {
      toast(describeError(error));
    }
    setDialog(null);
  }

  async function remove() {
    try {
      await api.deletePost(post);
      toast('Post deleted');
      bumpVersion();
      onGone?.();
    } catch (error) {
      toast(describeError(error));
    }
    setDialog(null);
  }

  return html`<div class="menu-wrap">
    <button class="icon-btn" aria-label="More" aria-expanded=${open} onClick=${() => setOpen(!open)}><${Icon} name="more" /></button>
    ${open ? html`<div class="menu" role="menu">
      ${post.is_mine
        ? html`<button role="menuitem" onClick=${() => setDialog('raters')}>See ratings</button>
               <button role="menuitem" class="danger" onClick=${() => setDialog('delete')}>Delete post</button>`
        : html`<button role="menuitem" onClick=${() => setDialog('report')}>Report post</button>
               ${post.author_id ? html`<button role="menuitem" class="danger" onClick=${() => setDialog('block')}>Block @${post.author_username}</button>` : null}`}
    </div>` : null}
    ${dialog === 'report' ? html`<${ReportModal} target="post" id=${post.id} onClose=${() => setDialog(null)} onDone=${onGone} />` : null}
    ${dialog === 'raters' ? html`<${RatersModal} post=${post} onClose=${() => setDialog(null)} />` : null}
    ${dialog === 'block' ? html`<${Confirm} title=${`Block @${post.author_username}?`}
        message="You won't see each other's posts, and they won't be able to follow you."
        confirmLabel="Block" onConfirm=${block} onCancel=${() => setDialog(null)} />` : null}
    ${dialog === 'delete' ? html`<${Confirm} title="Delete this post?" message="Its ratings, likes and comments will be deleted too."
        confirmLabel="Delete" onConfirm=${remove} onCancel=${() => setDialog(null)} />` : null}
  </div>`;
}

export function ReportModal({ target, id, onClose, onDone }) {
  const [reason, setReason] = useState(null);
  const [details, setDetails] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);

  async function send() {
    setSending(true);
    try {
      await api.report(target, id, reason, details);
      toast("Thanks — we'll take a look.");
      onClose();
      onDone?.();
    } catch (e) {
      setError(describeError(e));
      setSending(false);
    }
  }

  return html`<${Modal} title="Report" onClose=${onClose}>
    <p class="muted">Why are you reporting this ${target}?</p>
    <div class="choice-list">
      ${REPORT_REASONS.map(([value, label]) => html`<label class=${`choice ${reason === value ? 'on' : ''}`}>
        <input type="radio" name="reason" checked=${reason === value} onChange=${() => setReason(value)} /> ${label}
      </label>`)}
    </div>
    <textarea placeholder="Anything else we should know? (optional)" maxlength="500" rows="3"
      value=${details} onInput=${(e) => setDetails(e.target.value)}></textarea>
    <p class=${error ? 'error' : 'muted small'}>${error || 'Reports are anonymous to the person you report.'}</p>
    <div class="row end">
      <button class="btn ghost" onClick=${onClose}>Cancel</button>
      <button class="btn primary" disabled=${!reason || sending} onClick=${send}>${sending ? 'Sending…' : 'Send report'}</button>
    </div>
  </${Modal}>`;
}

function RatersModal({ post, onClose }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => {
    Promise.all([api.raters(post.id), api.ratingStats(post.id)])
      .then(([list, stats]) => setData({ list, stats }))
      .catch((e) => setError(describeError(e)));
  }, []);
  return html`<${Modal} title="Ratings" onClose=${onClose}>
    ${error ? html`<p class="error">${error}</p>` : !data ? html`<${Spinner} />` : data.list.length === 0
      ? html`<${Empty} icon="star" title="No ratings yet" message="Ratings show up here as people rate your post." />`
      : html`<${Results} stats=${data.stats} owner=${true} />
        <ul class="people">${data.list.map((r) => html`<li>
          ${r.is_anonymous
            ? html`<span class="avatar avatar-fallback" style="width:34px;height:34px"><${Icon} name="eyeOff" size=${16} /></span><span class="muted">Anonymous</span>`
            : html`<${Avatar} url=${api.avatarUrl(r.avatar_path)} name=${r.username} size=${34} /><strong>@${r.username}</strong>`}
          <span class="score" style=${`color:${ratingColor(r.score)}`}>${r.score}</span>
        </li>`)}</ul>`}
  </${Modal}>`;
}

export function CommentsModal({ post, onClose, onCountChange }) {
  return html`<${Modal} title="Comments" onClose=${onClose}>
    <${CommentsPanel} post=${post} onCountChange=${onCountChange} onNavigate=${onClose} />
  </${Modal}>`;
}

/** The comment list and "Add a comment" box. In a modal on phones, beside the post on wide screens. */
export function CommentsPanel({ post, onCountChange, onNavigate, inline = false }) {
  const [items, setItems] = useState(null);
  const [error, setError] = useState(null);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [reporting, setReporting] = useState(null);
  const listRef = useRef(null);
  const myId = getState().profile?.id;

  const load = () => api.comments(post.id).then(setItems).catch((e) => setError(describeError(e)));
  useEffect(() => { setItems(null); load(); }, [post.id]);

  async function send(e) {
    e.preventDefault();
    const body = draft.trim();
    if (!body || body.length > 500) return;
    setSending(true);
    try {
      const comment = await api.addComment(post.id, body);
      setItems([...(items || []), comment]);
      setDraft('');
      onCountChange?.(1);
      // Show your new comment, even at the bottom of a long thread.
      requestAnimationFrame(() => listRef.current?.lastElementChild?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }));
    } catch (err) {
      toast(describeError(err));
    }
    setSending(false);
  }

  async function remove(comment) {
    try {
      await api.deleteComment(comment.id);
      setItems(items.filter((c) => c.id !== comment.id));
      onCountChange?.(-1);
    } catch (err) {
      toast(describeError(err));
    }
  }

  return html`<div class=${`comments-panel ${inline ? 'inline' : ''}`}>
    <div class="comments" ref=${listRef}>
      ${error ? html`<p class="error">${error}</p>` : !items ? html`<${Spinner} />` : items.length === 0
        ? html`<p class="muted center">No comments yet. Start the conversation.</p>`
        : items.map((c) => html`<div class="comment">
            <${Avatar} url=${api.avatarUrl(c.author?.avatar_path)} name=${c.author?.username} size=${32} />
            <div class="comment-body">
              <div><a href=${`#/u/${c.user_id}`} onClick=${onNavigate}><strong>@${c.author?.username ?? 'someone'}</strong></a><${Badge} kind=${c.author?.badge} />
                <small class="muted"> ${ago(c.created_at)}</small></div>
              <p>${c.body}</p>
            </div>
            ${c.user_id === myId
              ? html`<button class="link small danger" onClick=${() => remove(c)}>Delete</button>`
              : html`<button class="link small" onClick=${() => setReporting(c)}>Report</button>`}
          </div>`)}
    </div>
    <form class="comment-form" onSubmit=${send}>
      <input placeholder="Add a comment…" maxlength="500" value=${draft} onInput=${(e) => setDraft(e.target.value)} aria-label="Add a comment" />
      <button class="btn primary" disabled=${!draft.trim() || sending}>Post</button>
    </form>
    ${reporting ? html`<${ReportModal} target="comment" id=${reporting.id} onClose=${() => setReporting(null)} />` : null}
  </div>`;
}

/** Share a post: the system share sheet where available, otherwise copy the link. */
export function ShareButton({ post, label = 'Share', className = 'action' }) {
  const url = api.shareUrl(post);
  async function share() {
    try {
      if (navigator.share) {
        await navigator.share({ title: 'Rate It', text: post.is_mine ? 'Rate my photo 1–10' : 'Rate this 1–10 on Rate It', url });
      } else {
        await navigator.clipboard.writeText(url);
        toast('Link copied');
      }
    } catch {
      // Closing the share sheet isn't an error.
    }
  }
  return html`<button class=${className} onClick=${share} aria-label=${label}><${Icon} name="share" /><span>${label}</span></button>`;
}

export function PostGrid({ posts }) {
  return html`<div class="grid">
    ${posts.map((p) => html`<a class="grid-cell" href=${`#/p/${p.id}`} aria-label=${`${p.category} post${p.caption ? `: ${p.caption}` : ''}`}>
      <${Photo} url=${api.postThumb(p)} />
      ${p.rating_count > 0 ? html`<span class="grid-badge"><${Icon} name="star" size=${12} /> ${compact(p.rating_count)}</span>` : null}
    </a>`)}
  </div>`;
}

export function GridSkeleton({ count = 9 }) {
  return html`<div class="grid">${Array.from({ length: count }, () => html`<div class="grid-cell skeleton"></div>`)}</div>`;
}

export function openProfile(id) {
  navigate(`/u/${id}`);
}
