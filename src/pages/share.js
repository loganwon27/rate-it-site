import { useEffect, useState } from 'preact/hooks';
import * as api from '../lib/api.js';
import { describeError } from '../lib/backend.js';
import { ratingColor } from '../lib/format.js';
import { html } from '../lib/html.js';
import { navigate } from '../lib/router.js';
import { setState, useStore } from '../lib/store.js';
import { RatingBar } from '../components/post.js';
import { Avatar, Badge, Empty, Photo, Spinner, toast } from '../components/ui.js';

const PENDING_KEY = 'pendingShareRating';
const PENDING_MAX_AGE = 7 * 24 * 3600 * 1000;

/** A rating picked on a share link before signing in. Kept in this browser until the visitor has an account. */
export function pendingShareRating() {
  try {
    const pending = JSON.parse(localStorage.getItem(PENDING_KEY) || 'null');
    if (pending && Date.now() - pending.at < PENDING_MAX_AGE) return pending;
    localStorage.removeItem(PENDING_KEY);
  } catch {}
  return null;
}

function savePending(pending) {
  try { localStorage.setItem(PENDING_KEY, JSON.stringify({ ...pending, at: Date.now() })); } catch {}
}

function clearPending() {
  try { localStorage.removeItem(PENDING_KEY); } catch {}
}

/** After signing in: submit the rating picked on a share link, then show the results. */
export async function submitPendingShareRating(anonymously) {
  const pending = pendingShareRating();
  if (!pending) return;
  clearPending();
  try {
    await api.rate(pending.postId, pending.score, anonymously);
    toast(`Your ${pending.score} is in`);
  } catch (e) {
    // Already rated it (or it's your own post): just open it.
    if (!/already_rated|own_post/i.test(`${e.message}`)) toast(describeError(e));
  }
  navigate(`/p/${pending.postId}`);
}

/**
 * https://userateit.com/r/?p=<code> lands here (as #/r/<code>). Signed-in people go straight to the post;
 * everyone else sees the photo, picks a score, and makes an account to lock it in and see the results.
 */
export function SharePage({ code }) {
  const store = useStore();
  const [post, setPost] = useState(undefined);
  const [error, setError] = useState(null);
  const [picked, setPicked] = useState(() => {
    const pending = pendingShareRating();
    return pending?.code === code ? pending.score : null;
  });

  useEffect(() => {
    api.sharedPost(code).then((p) => {
      if (p && store.phase === 'ready') {
        window.location.replace(`#/p/${p.id}`);
        return;
      }
      setPost(p);
    }).catch((e) => setError(describeError(e)));
  }, [code, store.phase]);

  function pick(score) {
    setPicked(score);
    savePending({ code, postId: post.id, score });
  }

  function join(mode) {
    setState({
      authMode: mode,
      notice: `Your ${picked} is saved. ${mode === 'signUp' ? 'Create a free account' : 'Log in'} to lock it in and see how everyone else rated it.`,
    });
    navigate('/');
  }

  if (error) return html`<div class="share-page"><${Empty} icon="photo" title="Couldn't load this" message=${error} /></div>`;
  if (post === undefined) return html`<div class="share-page center"><${Spinner} big /></div>`;
  if (!post) {
    return html`<div class="share-page">
      <${Empty} icon="photo" title="This post isn't available" message="It may have been deleted."
        action="Open Rate It" onAction=${() => navigate('/')} />
    </div>`;
  }

  const who = post.author_username ? `@${post.author_username}` : 'Someone';
  return html`<div class="share-page">
    <a class="brand share-brand" href="#/"><img src="icon.png" alt="" /><span>RATE IT</span></a>
    <article class="share-card">
      <header class="share-head">
        ${post.author_username
          ? html`<${Avatar} url=${api.avatarUrl(post.author_avatar_path)} name=${post.author_username} size=${36} />`
          : html`<span class="avatar avatar-fallback" style="width:36px;height:36px">?</span>`}
        <span><strong>${who}<${Badge} kind=${post.author_badge} /></strong><small>wants your rating</small></span>
        <span class="chip">${post.category}</span>
      </header>
      <div class="share-photo" style=${`aspect-ratio:${post.image_width} / ${post.image_height}`}>
        <${Photo} url=${api.postImage(post)} alt=${post.caption || `${post.category} post`} />
      </div>
      ${post.caption ? html`<p class="share-caption">${post.caption}</p>` : null}
      ${picked == null ? html`<div class="rate-area">
          <div class="rate-head"><strong>What do you think?</strong>
            <span class="muted small">${post.rating_count} ${post.rating_count === 1 ? 'rating' : 'ratings'} so far</span></div>
          <${RatingBar} locked=${null} busy=${false} onRate=${pick} keyboard=${true} />
          <p class="muted small">Tap a number from 1 to 10.</p>
        </div>`
        : html`<div class="share-join">
          <p class="gave">You gave it <strong style=${`color:${ratingColor(picked)}`}>${picked}</strong></p>
          <p>Create a free account to lock it in and see how everyone else rated it.</p>
          <button class="btn primary block" onClick=${() => join('signUp')}>Create free account</button>
          <button class="btn ghost block" onClick=${() => join('logIn')}>I already have an account</button>
          <button class="link muted small" onClick=${() => { clearPending(); setPicked(null); }}>Change my rating</button>
        </div>`}
    </article>
    <p class="muted small center">Rate It: post anything, see what people think.</p>
  </div>`;
}
