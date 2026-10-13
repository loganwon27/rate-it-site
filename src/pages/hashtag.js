import { useEffect, useState } from 'preact/hooks';
import * as api from '../lib/api.js';
import { describeError } from '../lib/backend.js';
import { compact } from '../lib/format.js';
import { html } from '../lib/html.js';
import { useStore } from '../lib/store.js';
import { GridSkeleton, PostGrid } from '../components/post.js';
import { Empty, ErrorState, Spinner } from '../components/ui.js';

/** #/tag/<tag>: every post using a hashtag, top or newest first. */
export function HashtagPage({ tag }) {
  const { version } = useStore();
  const name = decodeURIComponent(tag || '').replace(/^#+/, '').toLowerCase();
  const [mode, setMode] = useState('top');
  const [posts, setPosts] = useState(null);
  const [count, setCount] = useState(null);
  const [error, setError] = useState(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setPosts(null);
    setError(null);
    Promise.all([api.hashtagPosts(name, mode), api.hashtagPostCount(name)])
      .then(([found, total]) => { if (!cancelled) { setPosts(found); setCount(total); } })
      .catch((e) => { if (!cancelled) setError(describeError(e)); });
    return () => { cancelled = true; };
  }, [name, mode, version, attempt]);

  return html`<div class="page wide-page">
    <div class="hashtag-head">
      <span class="hashtag-icon" aria-hidden="true">#</span>
      <div><h1>#${name}</h1>
        <p class="muted">${count == null ? ' ' : `${compact(count)} ${count === 1 ? 'post' : 'posts'}`}</p></div>
    </div>
    <div class="tabs" role="tablist">
      ${[['top', 'Top'], ['new', 'New']].map(([value, label]) => html`
        <button role="tab" aria-selected=${mode === value} class=${mode === value ? 'on' : ''} onClick=${() => setMode(value)}>${label}</button>`)}
    </div>
    ${error ? html`<${ErrorState} message=${error} onRetry=${() => setAttempt(attempt + 1)} />`
      : !posts ? html`<${GridSkeleton} />`
      : posts.length === 0 ? html`<${Empty} icon="search" title=${`No posts with #${name} yet`}
          message="Add it to a caption when you post and it'll show up here." />`
      : html`<${PostGrid} posts=${posts} />`}
  </div>`;
}

/** #/user/<username> (from an @mention): opens their profile. */
export function UsernamePage({ username }) {
  const name = decodeURIComponent(username || '').replace(/^@+/, '').toLowerCase();
  const [missing, setMissing] = useState(false);
  const [error, setError] = useState(null);
  useEffect(() => {
    api.profileByUsername(name)
      .then((p) => (p ? window.location.replace(`#/u/${p.id}`) : setMissing(true)))
      .catch((e) => setError(describeError(e)));
  }, [name]);
  if (error) return html`<${ErrorState} message=${error} />`;
  if (missing) return html`<div class="page"><${Empty} icon="search" title=${`@${name} isn't on Rate It`}
    message="The account may have changed its username or been deleted." /></div>`;
  return html`<div class="page center"><${Spinner} big /></div>`;
}
