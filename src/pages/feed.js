import { useEffect, useState } from 'preact/hooks';
import * as api from '../lib/api.js';
import { describeError } from '../lib/backend.js';
import { compact, plural } from '../lib/format.js';
import { html } from '../lib/html.js';
import { navigate } from '../lib/router.js';
import { useStore } from '../lib/store.js';
import {
  AnonymityToggle, CommentsModal, CommentsPanel, LikeButton, PostHeader, PostMenu, RatingBar, Results, ShareButton, usePost,
} from '../components/post.js';
import { Empty, ErrorState, Icon, Photo, useWide } from '../components/ui.js';

/** Home: one post at a time. Rate it, see the results, go next. */
export function FeedPage() {
  const { version } = useStore();
  const wide = useWide();
  const [posts, setPosts] = useState(null);
  const [index, setIndex] = useState(0);
  const [error, setError] = useState(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [reachedEnd, setReachedEnd] = useState(false);
  const [direction, setDirection] = useState('next');

  async function load() {
    setError(null);
    setPosts(null);
    try {
      const first = await api.feed();
      setPosts(first);
      setIndex(0);
      setReachedEnd(first.length === 0);
    } catch (e) {
      setError(describeError(e));
    }
  }
  useEffect(() => { load(); }, [version]);

  // Fetch more when two posts away from the end, and warm the browser cache for the next images.
  useEffect(() => {
    if (!posts) return;
    posts.slice(index + 1, index + 4).forEach((p) => { new Image().src = api.postImage(p); });
    if (index >= posts.length - 2 && !loadingMore && !reachedEnd) {
      setLoadingMore(true);
      api.feed(posts.map((p) => p.id))
        .then((more) => { setReachedEnd(more.length === 0); setPosts([...posts, ...more]); })
        .catch(() => {})
        .finally(() => setLoadingMore(false));
    }
  }, [index, posts]);

  // Scroll wheel / two-finger trackpad swipe: one post per gesture (down = next, up = back).
  useEffect(() => {
    if (!posts) return undefined;
    return onScrollGesture((dir) => {
      if (dir > 0 && index < posts.length) { setDirection('next'); setIndex(index + 1); }
      if (dir < 0 && index > 0) { setDirection('back'); setIndex(index - 1); }
    });
  }, [index, posts]);

  if (error) return html`<${ErrorState} message=${error} onRetry=${load} />`;
  if (!posts) return html`<div class=${wide ? 'feed-wide' : 'feed'}><div class="feed-card skeleton-card"></div></div>`;
  const current = posts[index];
  if (!current) {
    return html`<${Empty} icon="star" title="You're all caught up"
      message="Nothing new to rate right now. Check back soon — or post something yourself."
      action="Create a post" onAction=${() => navigate('/create')} />`;
  }
  const next = () => { setDirection('next'); setIndex(index + 1); };
  const previous = index > 0 ? () => { setDirection('back'); setIndex(index - 1); } : null;
  const drop = () => setPosts(posts.filter((p) => p.id !== current.id));
  return html`<div class=${`${wide ? 'feed-wide' : 'feed'} enter-${direction}`} key=${current.id}>
    <${FeedCard} key=${current.id} initial=${current} wide=${wide} onNext=${next} onPrevious=${previous} onGone=${drop} />
  </div>`;
}

/**
 * Calls `onStep(+1 | -1)` once per scroll gesture. A trackpad flick keeps sending wheel events (momentum)
 * for a while, so after a step we wait for the wheel to go quiet before the next one counts.
 */
function onScrollGesture(onStep) {
  let total = 0;
  let locked = false;
  let lastEvent = 0;
  let lockedAt = 0;
  const onWheel = (e) => {
    if (e.ctrlKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return; // pinch-zoom or sideways
    if (document.body.classList.contains('modal-open') || e.target.closest('textarea, input, .menu, .comments-panel')) return;
    // Let a part of the page that can still scroll (a long side panel) scroll first.
    for (let el = e.target; el && el !== document.body; el = el.parentElement) {
      const style = getComputedStyle(el);
      if (/(auto|scroll)/.test(style.overflowY) && el.scrollHeight > el.clientHeight + 1) {
        const atEdge = e.deltaY > 0 ? el.scrollTop + el.clientHeight >= el.scrollHeight - 1 : el.scrollTop <= 0;
        if (!atEdge) return;
      }
    }
    // Same for the whole page in a short window: reach the rating buttons before moving on.
    const page = document.scrollingElement;
    if (page.scrollHeight > page.clientHeight + 80) {
      const atEdge = e.deltaY > 0 ? page.scrollTop + page.clientHeight >= page.scrollHeight - 1 : page.scrollTop <= 0;
      if (!atEdge) return;
    }
    e.preventDefault();
    const now = performance.now();
    if (locked) {
      if (now - lastEvent > 180 && now - lockedAt > 450) { locked = false; total = 0; } else { lastEvent = now; return; }
    }
    lastEvent = now;
    total += e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
    if (Math.abs(total) >= 24) {
      onStep(total > 0 ? 1 : -1);
      locked = true;
      lockedAt = now;
      total = 0;
    }
  };
  window.addEventListener('wheel', onWheel, { passive: false });
  return () => window.removeEventListener('wheel', onWheel);
}

function FeedCard({ initial, wide, onNext, onPrevious, onGone }) {
  const state = usePost(initial);
  const { post, stats, chosen, busy, canSeeResults } = state;
  const [showComments, setShowComments] = useState(false);
  const [burst, setBurst] = useState(false);

  useEffect(() => {
    const onKey = (e) => {
      if (e.target.closest('input, textarea') || document.body.classList.contains('modal-open')) return;
      if (e.key === 'ArrowDown' || e.key === 'j' || (canSeeResults && e.key === 'Enter')) { e.preventDefault(); onNext(); }
      if ((e.key === 'ArrowUp' || e.key === 'k') && onPrevious) { e.preventDefault(); onPrevious(); }
      if (e.key === 'l') state.toggleLike();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [canSeeResults, post.liked_by_me, onPrevious]);

  function doubleTap() {
    setBurst(true);
    setTimeout(() => setBurst(false), 700);
    if (!post.liked_by_me) state.toggleLike();
  }

  const comments = showComments ? html`<${CommentsModal} post=${post} onClose=${() => setShowComments(false)}
    onCountChange=${(d) => state.setPost({ ...post, comment_count: post.comment_count + d })} />` : null;
  const commentButton = (withCount) => html`<button class="action" onClick=${() => setShowComments(true)} aria-label="Comments">
    <${Icon} name="comment" />${withCount ? html`<span>${compact(post.comment_count)}</span>` : null}
  </button>`;
  const heart = html`<span class=${`heart-burst ${burst ? 'on' : ''}`} aria-hidden="true"><${Icon} name="heart" size=${96} /></span>`;
  const gave = html`<span class="gave">You gave it <strong style="color:var(--accent)">${chosen}</strong></span>`;
  const rateArea = html`<div class="rate-area">
    <div class="rate-head"><strong>What do you think?</strong><${AnonymityToggle} /></div>
    <${RatingBar} locked=${chosen} busy=${busy} onRate=${state.rate} keyboard=${true} />
    <div class="rate-foot">
      <span class="muted small hint">${wide ? 'Press 1–9, or 0 for 10 · scroll or ↓ for next · ↑ back' : 'Tip: press 1–9 or 0 for 10'}</span>
      <button class="link muted small" onClick=${onNext}>Skip</button>
    </div>
  </div>`;

  if (wide) {
    // Desktop: photo on the left, everything else beside it.
    return html`<article class="feed-split">
      <div class="split-photo" onDblClick=${doubleTap}>
        <${Photo} eager=${true} url=${api.postImage(post)} alt=${post.caption || `${post.category} post`} />
        ${heart}
      </div>
      <div class="split-panel">
        <${PostHeader} post=${post}><${PostMenu} post=${post} onGone=${onGone} /></${PostHeader}>
        ${post.caption ? html`<h2 class="split-caption">${post.caption}</h2>` : null}
        <p class="muted small">${plural(post.rating_count, 'rating')} · ${plural(post.like_count, 'like')} · ${plural(post.comment_count, 'comment')}</p>
        <div class="spacer"></div>
        ${canSeeResults ? html`
          ${gave}
          <${Results} stats=${stats} mine=${chosen} />
          <div class="split-actions">
            <${LikeButton} post=${post} onToggle=${state.toggleLike} />
            ${commentButton(false)}
            <span class="spacer"></span>
            <button class="btn primary next" onClick=${onNext}>Next <${Icon} name="down" size=${18} /></button>
          </div>` : html`
          ${rateArea}
          <div class="split-actions">
            <${LikeButton} post=${post} onToggle=${state.toggleLike} />
            ${commentButton(true)}
          </div>`}
      </div>
      ${comments}
    </article>`;
  }

  return html`<article class="feed-card">
    <${PostHeader} post=${post}><${PostMenu} post=${post} onGone=${onGone} /></${PostHeader}>
    <div class="feed-photo" onDblClick=${doubleTap}>
      <${Photo} eager=${true} url=${api.postImage(post)} alt=${post.caption || `${post.category} post`} />
      <div class="photo-shade"></div>
      ${post.caption && !canSeeResults ? html`<p class="caption">${post.caption}</p>` : null}
      ${canSeeResults ? html`<div class="results-overlay"><${Results} stats=${stats} mine=${chosen} /></div>` : html`
        <div class="photo-actions">
          <${LikeButton} post=${post} onToggle=${state.toggleLike} />
          ${commentButton(true)}
        </div>`}
      ${heart}
    </div>
    ${canSeeResults ? html`<div class="after-rating">
        ${gave}
        <span class="spacer"></span>
        <${LikeButton} post=${post} onToggle=${state.toggleLike} />
        ${commentButton(false)}
        <button class="btn primary next" onClick=${onNext}>Next <${Icon} name="down" size=${18} /></button>
      </div>` : rateArea}
    ${comments}
  </article>`;
}

/** A single post opened from Discover, a profile or a notification. */
export function PostPage({ id }) {
  const wide = useWide();
  const [post, setPost] = useState(null);
  const [error, setError] = useState(null);
  const load = () => { setError(null); api.post(id).then(setPost).catch((e) => setError(describeError(e))); };
  useEffect(() => { setPost(null); load(); }, [id]);
  if (error) return html`<${ErrorState} message=${error} onRetry=${load} />`;
  if (!post) return html`<div class=${wide ? 'post-split' : 'post-page'}><div class="feed-card skeleton-card"></div></div>`;
  return html`<${PostDetail} initial=${post} wide=${wide} />`;
}

function PostDetail({ initial, wide }) {
  const state = usePost(initial);
  const { post, stats, chosen, busy, canSeeResults } = state;
  const [showComments, setShowComments] = useState(false);
  const countChange = (d) => state.setPost({ ...post, comment_count: post.comment_count + d });
  const hidden = post.is_mine && post.is_hidden
    ? html`<p class="notice">Hidden from others while we review reports about it.</p>`
    : post.is_mine ? html`<div class="share-cta">
        <span><strong>Get more ratings</strong><small>Share your link anywhere. Friends can rate it without the app.</small></span>
        <${ShareButton} post=${post} label="Share link" className="btn primary small" />
      </div>` : null;
  const rating = canSeeResults ? html`
      ${chosen != null ? html`<p class="gave">You gave it <strong style="color:var(--accent)">${chosen}</strong></p>` : null}
      <${Results} stats=${stats} mine=${chosen} owner=${post.is_mine} />` : html`
      <div class="rate-area">
        <div class="rate-head"><strong>What do you think?</strong><${AnonymityToggle} /></div>
        <${RatingBar} locked=${chosen} busy=${busy} onRate=${state.rate} keyboard=${true} />
        <p class="muted small">${compact(post.rating_count)} ${post.rating_count === 1 ? 'rating' : 'ratings'} so far</p>
      </div>`;

  if (wide) {
    // Desktop: photo on the left; details, rating and the comments beside it.
    return html`<div class="post-split">
      <div class="split-photo">
        <button class="link back overlay-back" onClick=${() => history.back()}><${Icon} name="back" size=${18} /> Back</button>
        <${Photo} eager=${true} url=${api.postImage(post)} alt=${post.caption || `${post.category} post`} />
      </div>
      <aside class="split-panel detail">
        <div class="detail-top">
          <${PostHeader} post=${post}><${PostMenu} post=${post} onGone=${() => history.back()} /></${PostHeader}>
          ${hidden}
          ${post.caption ? html`<h2 class="split-caption">${post.caption}</h2>` : null}
          <div class="split-actions">
            <${LikeButton} post=${post} onToggle=${state.toggleLike} />
            <${ShareButton} post=${post} />
          </div>
          ${rating}
        </div>
        <h3 class="comments-title">Comments <span class="muted">${compact(post.comment_count)}</span></h3>
        <${CommentsPanel} post=${post} inline=${true} onCountChange=${countChange} />
      </aside>
    </div>`;
  }

  return html`<div class="post-page">
    <button class="link back" onClick=${() => history.back()}><${Icon} name="back" size=${18} /> Back</button>
    <${PostHeader} post=${post}><${PostMenu} post=${post} onGone=${() => history.back()} /></${PostHeader}>
    ${hidden}
    <div class="detail-photo"><${Photo} eager=${true} url=${api.postImage(post)} alt=${post.caption || `${post.category} post`} /></div>
    <div class="detail-row">
      ${post.caption ? html`<p class="detail-caption">${post.caption}</p>` : html`<span></span>`}
      <div class="row">
        <${LikeButton} post=${post} onToggle=${state.toggleLike} />
        <button class="action" onClick=${() => setShowComments(true)} aria-label="Comments">
          <${Icon} name="comment" /><span>${compact(post.comment_count)}</span>
        </button>
        <${ShareButton} post=${post} />
      </div>
    </div>
    ${rating}
    ${showComments ? html`<${CommentsModal} post=${post} onClose=${() => setShowComments(false)} onCountChange=${countChange} />` : null}
  </div>`;
}
