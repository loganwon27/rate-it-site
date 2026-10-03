import { useEffect, useState } from 'preact/hooks';
import * as api from '../lib/api.js';
import { describeError } from '../lib/backend.js';
import { CATEGORIES, compact } from '../lib/format.js';
import { html } from '../lib/html.js';
import { navigate } from '../lib/router.js';
import { bumpVersion, setState, useStore } from '../lib/store.js';
import { GridSkeleton, PostGrid, ReportModal } from '../components/post.js';
import { BanDialog, banLabel } from '../components/ban.js';
import { Avatar, Badge, Chip, Confirm, Empty, ErrorState, Icon, Modal, Spinner, toast, useWide } from '../components/ui.js';

export function DiscoverPage() {
  const { version } = useStore();
  const [mode, setMode] = useState('trending');
  const [category, setCategory] = useState(null);
  const [query, setQuery] = useState('');
  const [posts, setPosts] = useState(null);
  const [people, setPeople] = useState([]);
  const [error, setError] = useState(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(async () => {
      setError(null);
      try {
        const [found, matches] = await Promise.all([
          api.discover({ mode, category, query }),
          query.trim() ? api.searchProfiles(query).catch(() => []) : Promise.resolve([]),
        ]);
        if (!cancelled) { setPosts(found); setPeople(matches); }
      } catch (e) {
        if (!cancelled) setError(describeError(e));
      }
    }, query ? 300 : 0);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [mode, category, query, version, attempt]);

  return html`<div class="page wide-page">
    <h1 class="page-title">Discover</h1>
    <label class="search">
      <${Icon} name="search" size=${18} />
      <input type="search" placeholder="Search outfits, cars, setups…" value=${query}
        onInput=${(e) => setQuery(e.target.value)} aria-label="Search" />
    </label>
    <div class="tabs" role="tablist">
      ${[['trending', 'Trending'], ['new', 'New'], ['popular', 'Popular']].map(([value, label]) => html`
        <button role="tab" aria-selected=${mode === value} class=${mode === value ? 'on' : ''} onClick=${() => setMode(value)}>${label}</button>`)}
    </div>
    <div class="chips">
      <${Chip} label="All" selected=${!category} onClick=${() => setCategory(null)} />
      ${CATEGORIES.map((c) => html`<${Chip} label=${c} selected=${category === c} onClick=${() => setCategory(category === c ? null : c)} />`)}
    </div>
    ${people.length ? html`<div class="people-row">
      ${people.map((p) => html`<a class="person" href=${`#/u/${p.id}`}>
        <${Avatar} url=${api.avatarUrl(p.avatar_path)} name=${p.username} size=${60} /><span>@${p.username}</span>
      </a>`)}
    </div>` : null}
    ${error ? html`<${ErrorState} message=${error} onRetry=${() => { setPosts(null); setAttempt(attempt + 1); }} />`
      : !posts ? html`<${GridSkeleton} />`
      : posts.length === 0 ? html`<${Empty} icon=${query ? 'search' : 'photo'}
          title=${query ? 'No results found.' : 'Nothing here yet.'}
          message=${query ? 'Try a different word or category.' : 'Be the first to post in this category.'} />`
      : html`<${PostGrid} posts=${posts} />`}
  </div>`;
}

export function ProfilePage({ id }) {
  const store = useStore();
  const wide = useWide();
  const userId = id || store.profile?.id;
  const isMe = userId === store.profile?.id;
  const [profile, setProfile] = useState(null);
  const [posts, setPosts] = useState(null);
  const [following, setFollowing] = useState(false);
  const [error, setError] = useState(null);
  const [dialog, setDialog] = useState(null);

  async function load() {
    setError(null);
    try {
      const [p, list, f] = await Promise.all([
        api.profile(userId), api.postsBy(userId), isMe ? false : api.isFollowing(userId),
      ]);
      setProfile(p);
      setPosts(list);
      setFollowing(f);
    } catch (e) {
      setError(describeError(e));
    }
  }
  useEffect(() => { setProfile(null); setPosts(null); if (userId) load(); }, [userId, store.version]);

  async function toggleFollow() {
    const was = following;
    setFollowing(!was);
    setProfile({ ...profile, follower_count: profile.follower_count + (was ? -1 : 1) });
    try {
      if (was) await api.unfollow(userId);
      else await api.follow(userId);
    } catch (e) {
      setFollowing(was);
      setProfile({ ...profile });
      toast(describeError(e));
    }
  }

  async function unban() {
    try {
      await api.ownerUnban(userId);
      setProfile({ ...profile, banned_at: null, banned_until: null, ban_reason: '' });
      toast(`@${profile.username} is unbanned`);
    } catch (e) {
      toast(describeError(e));
    }
  }

  async function block() {
    try {
      await api.block(userId);
      toast(`Blocked @${profile.username}`);
      bumpVersion();
      navigate('/');
    } catch (e) {
      toast(describeError(e));
    }
  }

  if (error) return html`<${ErrorState} message=${error} onRetry=${load} />`;
  if (!profile) return html`<div class="page center"><${Spinner} big /></div>`;
  const avatarSize = wide ? 136 : 96;
  const average = profile.received_rating_count > 0 ? (profile.received_rating_sum / profile.received_rating_count).toFixed(1) : '—';

  return html`<div class="page wide-page">
    <div class=${`profile-head ${wide ? 'wide' : ''}`}>
      <${Avatar} url=${api.avatarUrl(profile.avatar_path)} name=${profile.username} size=${avatarSize} />
      <h1>@${profile.username}<${Badge} kind=${profile.badge} /></h1>
      ${profile.bio ? html`<p class="muted">${profile.bio}</p>` : null}
      ${store.isOwner && !isMe && banLabel(profile) ? html`<p class="ban-status">${banLabel(profile)}${profile.ban_reason ? ` · ${profile.ban_reason}` : ''}</p>` : null}
      <div class="stats">
        <div><strong>${average}</strong><span>average</span></div>
        <div><strong>${compact(profile.post_count)}</strong><span>${profile.post_count === 1 ? 'post' : 'posts'}</span></div>
        <div><strong>${compact(profile.ratings_given_count)}</strong><span>ratings given</span></div>
      </div>
      <div class="follow-counts">
        <button class="link" onClick=${() => setDialog('followers')}><strong>${compact(profile.follower_count)}</strong> ${profile.follower_count === 1 ? 'follower' : 'followers'}</button>
        <button class="link" onClick=${() => setDialog('following')}><strong>${compact(profile.following_count)}</strong> following</button>
      </div>
      ${isMe
        ? html`<div class="row"><button class="btn secondary" onClick=${() => setDialog('edit')}>Edit profile</button>
            <a class="btn ghost" href="#/settings">Settings</a></div>`
        : html`<div class="row">
            <button class=${`btn ${following ? 'secondary' : 'primary'}`} onClick=${toggleFollow}>${following ? 'Following' : 'Follow'}</button>
            <button class="btn ghost" onClick=${() => setDialog('report')}>Report</button>
            <button class="btn ghost danger-text" onClick=${() => setDialog('block')}>Block</button>
            ${store.isOwner ? (banLabel(profile)
              ? html`<button class="btn ghost" onClick=${unban}>Unban</button>`
              : html`<button class="btn ghost danger-text" onClick=${() => setDialog('ban')}>Ban</button>`) : null}
          </div>`}
    </div>
    ${!posts ? html`<${GridSkeleton} count=${6} />`
      : posts.length === 0 ? html`<${Empty} icon="camera" title="Nothing here yet."
          message=${isMe ? 'Post something and see what people think.' : null}
          action=${isMe ? 'Create a post' : null} onAction=${() => navigate('/create')} />`
      : html`<${PostGrid} posts=${posts} />`}
    ${dialog === 'edit' ? html`<${EditProfile} profile=${profile} onClose=${() => setDialog(null)}
        onSaved=${(p) => { setProfile(p); setState({ profile: p }); setDialog(null); }} />` : null}
    ${dialog === 'followers' || dialog === 'following' ? html`<${FollowList} userId=${userId} kind=${dialog}
        isMe=${isMe} onClose=${() => setDialog(null)} />` : null}
    ${dialog === 'report' ? html`<${ReportModal} target="profile" id=${userId} onClose=${() => setDialog(null)} />` : null}
    ${dialog === 'ban' ? html`<${BanDialog} username=${profile.username} userId=${userId} onClose=${() => setDialog(null)}
        onBanned=${(until) => { setDialog(null); setProfile({ ...profile, banned_at: new Date().toISOString(), banned_until: until }); }} />` : null}
    ${dialog === 'block' ? html`<${Confirm} title=${`Block @${profile.username}?`}
        message="You won't see each other's posts, and they won't be able to follow you."
        confirmLabel="Block" onConfirm=${block} onCancel=${() => setDialog(null)} />` : null}
  </div>`;
}

function FollowList({ userId, kind, isMe, onClose }) {
  const [people, setPeople] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => { api.followList(userId, kind).then(setPeople).catch((e) => setError(describeError(e))); }, []);
  const emptyMessage = kind === 'followers'
    ? (isMe ? "You haven't got any followers yet." : 'No followers yet.')
    : 'Not following anyone yet.';
  return html`<${Modal} title=${kind === 'followers' ? 'Followers' : 'Following'} onClose=${onClose}>
    ${error ? html`<p class="error">${error}</p>` : !people ? html`<${Spinner} />`
      : people.length === 0 ? html`<p class="muted center">${emptyMessage}</p>`
      : html`<ul class="people">${people.map((p) => html`<li>
          <a class="row" href=${`#/u/${p.id}`} onClick=${onClose}>
            <${Avatar} url=${api.avatarUrl(p.avatar_path)} name=${p.username} size=${40} />
            <span><strong>@${p.username}</strong>${p.bio ? html`<br /><small class="muted">${p.bio}</small>` : null}</span>
          </a></li>`)}</ul>`}
  </${Modal}>`;
}

function EditProfile({ profile, onClose, onSaved }) {
  const [username, setUsername] = useState(profile.username);
  const [bio, setBio] = useState(profile.bio);
  const [avatarFile, setAvatarFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [taken, setTaken] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const name = api.normalizeUsername(username);
  const valid = api.isValidUsername(name);

  useEffect(() => {
    setTaken(false);
    if (!valid || name === profile.username) return undefined;
    const timer = setTimeout(async () => setTaken(!(await api.usernameAvailable(name).catch(() => true))), 350);
    return () => clearTimeout(timer);
  }, [name]);

  function pick(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setAvatarFile(file);
    setPreview(URL.createObjectURL(file));
  }

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const changes = {};
      if (name !== profile.username) changes.username = name;
      if (bio !== profile.bio) changes.bio = bio.trim();
      if (avatarFile) changes.avatar_path = await api.uploadAvatar(avatarFile);
      const updated = await api.updateProfile(changes);
      if (changes.avatar_path && profile.avatar_path) api.removeAvatar(profile.avatar_path);
      toast('Profile saved');
      onSaved(updated);
    } catch (e) {
      setError(`${e.message}`.includes('duplicate key') ? 'That username is taken.' : describeError(e));
      setBusy(false);
    }
  }

  const changed = name !== profile.username || bio !== profile.bio || avatarFile;
  return html`<${Modal} title="Edit profile" onClose=${onClose}>
    <label class="avatar-pick">
      ${preview ? html`<img class="avatar" style="width:96px;height:96px" src=${preview} alt="" />`
        : html`<${Avatar} url=${api.avatarUrl(profile.avatar_path)} name=${profile.username} size=${96} />`}
      <span class="link gold">Change photo</span>
      <input type="file" accept="image/*" onChange=${pick} hidden />
    </label>
    <label class="label">Username</label>
    <label class="field"><span class="prefix">@</span>
      <input value=${username} maxlength="20" autocapitalize="none" spellcheck="false" onInput=${(e) => setUsername(e.target.value)} />
    </label>
    ${!valid ? html`<p class="error small">${api.USERNAME_HINT}</p>` : taken ? html`<p class="error small">That username is taken.</p>` : null}
    <label class="label">Bio <span class="muted small">${bio.length}/160</span></label>
    <textarea rows="3" maxlength="160" value=${bio} onInput=${(e) => setBio(e.target.value)} placeholder="Say something about yourself"></textarea>
    ${error ? html`<p class="error">${error}</p>` : null}
    <div class="row end">
      <button class="btn ghost" onClick=${onClose}>Cancel</button>
      <button class="btn primary" disabled=${!changed || !valid || taken || busy} onClick=${save}>${busy ? 'Saving…' : 'Save'}</button>
    </div>
  </${Modal}>`;
}

