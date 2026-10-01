import { useEffect, useState } from 'preact/hooks';
import * as api from '../lib/api.js';
import { describeError } from '../lib/backend.js';
import { compact } from '../lib/format.js';
import { html } from '../lib/html.js';
import { navigate } from '../lib/router.js';
import { useStore } from '../lib/store.js';
import {
  AnonymityToggle, CommentsModal, LikeButton, PostHeader, PostMenu, RatingBar, Results, usePost,
} from '../components/post.js';
import { Empty, ErrorState, Icon, Photo } from '../components/ui.js';

/** Home: one post at a time. Rate it, see the results, go next. */
export function FeedPage() {
  const { version } = useStore();
  const [posts, setPosts] = useState(null);
  const [index, setIndex] = useState(0);
  const [error, setError] = useState(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [reachedEnd, setReachedEnd] = useState(false);

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

  if (error) return html`<${ErrorState} message=${error} onRetry=${load} />`;
  if (!posts) return html`<div class="feed"><div class="feed-card skeleton-card"></div></div>`;
  const current = posts[index];
  if (!current) {
    return html`<${Empty} icon="star" title="You're all caught up"
      message="Nothing new to rate right now. Check back soon — or post something yourself."
      action="Create a post" onAction=${() => navigate('/create')} />`;
  }
  const next = () => setIndex(index + 1);
  const drop = () => setPosts(posts.filter((p) => p.id !== current.id));
  return html`<div class="feed">
    <${FeedCard} key=${current.id} initial=${current} onNext=${next} onGone=${drop} />
  </div>`;
}

function FeedCard({ initial, onNext, onGone }) {
  const state = usePost(initial);
  const { post, stats, chosen, busy, canSeeResults } = state;
  const [showComments, setShowComments] = useState(false);
  const [burst, setBurst] = useState(false);

  useEffect(() => {
    const onKey = (e) => {
      if (e.target.closest('input, textarea') || document.body.classList.contains('modal-open')) return;
      if (e.key === 'ArrowDown' || e.key === 'j' || (canSeeResults && e.key === 'Enter')) { e.preventDefault(); onNext(); }
      if (e.key === 'l') state.toggleLike();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [canSeeResults, post.liked_by_me]);

  function doubleTap() {
    setBurst(true);
    setTimeout(() => setBurst(false), 700);
    if (!post.liked_by_me) state.toggleLike();
  }

  return html`<article class="feed-card">
    <${PostHeader} post=${post}><${PostMenu} post=${post} onGone=${onGone} /></${PostHeader}>
    <div class="feed-photo" onDblClick=${doubleTap}>
      <${Photo} url=${api.postImage(post)} alt=${post.caption || `${post.category} post`} />
      <div class="photo-shade"></div>
      ${post.caption && !canSeeResults ? html`<p class="caption">${post.caption}</p>` : null}
      ${canSeeResults ? html`<div class="results-overlay"><${Results} stats=${stats} mine=${chosen} /></div>` : html`
        <div class="photo-actions">
          <${LikeButton} post=${post} onToggle=${state.toggleLike} />
          <button class="action" onClick=${() => setShowComments(true)} aria-label="Comments">
            <${Icon} name="comment" /><span>${compact(post.comment_count)}</span>
          </button>
        </div>`}
      <span class=${`heart-burst ${burst ? 'on' : ''}`} aria-hidden="true"><${Icon} name="heart" size=${96} /></span>
    </div>
    ${canSeeResults ? html`<div class="after-rating">
        <span class="gave">You gave it <strong style=${`color:var(--accent)`}>${chosen}</strong></span>
        <span class="spacer"></span>
        <${LikeButton} post=${post} onToggle=${state.toggleLike} />
        <button class="action" onClick=${() => setShowComments(true)} aria-label="Comments"><${Icon} name="comment" /></button>
        <button class="btn primary next" onClick=${onNext}>Next <${Icon} name="down" size=${18} /></button>
      </div>` : html`<div class="rate-area">
        <div class="rate-head"><strong>What do you think?</strong><${AnonymityToggle} /></div>
        <${RatingBar} locked=${chosen} busy=${busy} onRate=${state.rate} keyboard=${true} />
        <div class="rate-foot">
          <span class="muted small hint">Tip: press 1–9 or 0 for 10</span>
          <button class="link muted small" onClick=${onNext}>Skip</button>
        </div>
      </div>`}
    ${showComments ? html`<${CommentsModal} post=${post} onClose=${() => setShowComments(false)}
      onCountChange=${(d) => state.setPost({ ...post, comment_count: post.comment_count + d })} />` : null}
  </article>`;
}

/** A single post opened from Discover, a profile or a notification. */
export function PostPage({ id }) {
  const [post, setPost] = useState(null);
  const [error, setError] = useState(null);
  const load = () => { setError(null); api.post(id).then(setPost).catch((e) => setError(describeError(e))); };
  useEffect(() => { setPost(null); load(); }, [id]);
  if (error) return html`<${ErrorState} message=${error} onRetry=${load} />`;
  if (!post) return html`<div class="post-page"><div class="feed-card skeleton-card"></div></div>`;
  return html`<${PostDetail} initial=${post} />`;
}

function PostDetail({ initial }) {
  const state = usePost(initial);
  const { post, stats, chosen, busy, canSeeResults } = state;
  const [showComments, setShowComments] = useState(false);
  return html`<div class="post-page">
    <button class="link back" onClick=${() => history.back()}><${Icon} name="back" size=${18} /> Back</button>
    <${PostHeader} post=${post}><${PostMenu} post=${post} onGone=${() => history.back()} /></${PostHeader}>
    ${post.is_mine && post.is_hidden ? html`<p class="notice">Hidden from others while we review reports about it.</p>` : null}
    <div class="detail-photo"><${Photo} url=${api.postImage(post)} alt=${post.caption || `${post.category} post`} /></div>
    <div class="detail-row">
      ${post.caption ? html`<p class="detail-caption">${post.caption}</p>` : html`<span></span>`}
      <div class="row">
        <${LikeButton} post=${post} onToggle=${state.toggleLike} />
        <button class="action" onClick=${() => setShowComments(true)} aria-label="Comments">
          <${Icon} name="comment" /><span>${compact(post.comment_count)}</span>
        </button>
      </div>
    </div>
    ${canSeeResults ? html`
      ${chosen != null ? html`<p class="gave">You gave it <strong style="color:var(--accent)">${chosen}</strong></p>` : null}
      <${Results} stats=${stats} mine=${chosen} owner=${post.is_mine} />` : html`
      <div class="rate-area">
        <div class="rate-head"><strong>What do you think?</strong><${AnonymityToggle} /></div>
        <${RatingBar} locked=${chosen} busy=${busy} onRate=${state.rate} keyboard=${true} />
        <p class="muted small">${compact(post.rating_count)} ${post.rating_count === 1 ? 'rating' : 'ratings'} so far</p>
      </div>`}
    ${showComments ? html`<${CommentsModal} post=${post} onClose=${() => setShowComments(false)}
      onCountChange=${(d) => state.setPost({ ...post, comment_count: post.comment_count + d })} />` : null}
  </div>`;
}
