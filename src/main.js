import { render } from 'preact';
import { useEffect } from 'preact/hooks';
import * as api from './lib/api.js';
import { db, describeError, isConfigured } from './lib/backend.js';
import { TERMS_VERSION } from './lib/format.js';
import { html } from './lib/html.js';
import { useRoute } from './lib/router.js';
import { getState, setState, useStore } from './lib/store.js';
import { Avatar, Empty, ErrorState, Icon, Spinner, Toasts } from './components/ui.js';
import { AuthPage, InterestsPage, NewPasswordPage, TermsGate } from './pages/auth.js';
import { FeedPage, PostPage } from './pages/feed.js';
import { DiscoverPage, ProfilePage } from './pages/people.js';
import { CreatePage } from './pages/create.js';
import { ModerationPage, NotificationsPage, SettingsPage } from './pages/account.js';

// ---------- Email links ----------
// Confirmation and password-reset emails land here with ?code=… (or an error). Supabase exchanges the code
// automatically; if that's not possible (e.g. you signed up in the iOS app), the email is still confirmed.
const params = new URLSearchParams(window.location.search);
const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
const landedFromEmail = params.has('code') || params.has('error_description') || hashParams.has('error_description');
const emailError = params.get('error_description') || hashParams.get('error_description');
if (landedFromEmail) {
  window.history.replaceState(null, '', window.location.pathname + '#/');
}

// ---------- Session ----------
async function loadSignedInUser(session) {
  setState({ session, phase: getState().phase === 'ready' ? 'ready' : 'loading' });
  try {
    const [profile, settings, isAdmin, unread] = await Promise.all([
      api.myProfile(), api.settings(), api.isAdmin(), api.unreadCount().catch(() => 0),
    ]);
    let skipped = false;
    try { skipped = localStorage.getItem(`interestsDone-${profile.id}`) === '1'; } catch {}
    const phase = settings.terms_version !== TERMS_VERSION ? 'terms'
      : !profile.interests.length && !skipped ? 'interests' : 'ready';
    setState({ profile, settings, isAdmin, unread, phase, error: null });
  } catch (error) {
    setState({ phase: 'loadFailed', error: describeError(error) });
  }
}

function start() {
  if (!isConfigured) {
    setState({ phase: 'setup' });
    return;
  }
  // Safety net: if the auth library hasn't reported in after a few seconds, ask it directly.
  setTimeout(async () => {
    if (getState().phase !== 'loading' || getState().session) return;
    const { data } = await db.auth.getSession();
    if (getState().phase !== 'loading') return;
    if (data.session) loadSignedInUser(data.session);
    else setState({ phase: 'signedOut', notice: null });
  }, 6000);

  db.auth.onAuthStateChange((event, session) => {
    if (event === 'PASSWORD_RECOVERY') {
      setState({ session, phase: 'recovery' });
    } else if (event === 'SIGNED_OUT' || !session) {
      const notice = emailError
        ? `That link didn't work (${emailError}). Try again.`
        : landedFromEmail ? 'Your email is confirmed. Log in below.' : null;
      setState({ session: null, profile: null, settings: null, isAdmin: false, phase: 'signedOut', notice });
    } else if (event === 'INITIAL_SESSION' || event === 'SIGNED_IN') {
      if (getState().phase === 'recovery') return;
      if (getState().profile?.id !== session.user.id || getState().phase !== 'ready') {
        setTimeout(() => loadSignedInUser(session), 0);
      }
    }
  });
}

// ---------- Shell ----------
function App() {
  const store = useStore();
  const route = useRoute();
  useEffect(start, []);

  switch (store.phase) {
    case 'setup':
      return html`<${Empty} icon="gear" title="Almost ready"
        message="Copy web/config.example.js to web/config.js and add your Supabase URL and key." />`;
    case 'loading':
      return html`<div class="splash"><img src="icon.png" alt="" /><${Spinner} /></div>`;
    case 'signedOut':
      return html`<${AuthPage} notice=${store.notice} />`;
    case 'recovery':
      return html`<${NewPasswordPage} />`;
    case 'loadFailed':
      return html`<${ErrorState} message=${store.error} onRetry=${() => loadSignedInUser(store.session)} />`;
    case 'terms':
      return html`<${TermsGate} onAccepted=${() => loadSignedInUser(store.session)} />`;
    case 'interests':
      return html`<${InterestsPage} onDone=${() => setState({ phase: 'ready' })} />`;
    default:
      return html`<${Shell} route=${route} />`;
  }
}

function page(route) {
  const [id] = route.params;
  switch (route.name) {
    case '': return html`<${FeedPage} />`;
    case 'discover': return html`<${DiscoverPage} />`;
    case 'create': return html`<${CreatePage} />`;
    case 'me': return html`<${ProfilePage} />`;
    case 'u': return html`<${ProfilePage} id=${id} key=${id} />`;
    case 'p': return html`<${PostPage} id=${id} key=${id} />`;
    case 'settings': return html`<${SettingsPage} />`;
    case 'notifications': return html`<${NotificationsPage} />`;
    case 'moderation': return html`<${ModerationPage} />`;
    default: return html`<${Empty} icon="search" title="Page not found" action="Go home" onAction=${() => { window.location.hash = '/'; }} />`;
  }
}

function Shell({ route }) {
  const store = useStore();
  const myId = store.profile?.id;
  const active = (name) => {
    if (name === 'me') return route.name === 'me' || (route.name === 'u' && route.params[0] === myId);
    return route.name === name;
  };
  const tabs = [
    ['', 'Home', 'flame'], ['discover', 'Discover', 'grid'], ['create', 'Create', 'plus'], ['me', 'Profile', 'user'],
  ];
  const badge = store.unread > 0 ? html`<span class="badge">${store.unread > 99 ? '99+' : store.unread}</span>` : null;
  const side = (href, name, label, icon, extra = null) => html`<a href=${href} class=${active(name) ? 'on' : ''}
    aria-current=${active(name) ? 'page' : null}><${Icon} name=${icon} /><span>${label}</span>${extra}</a>`;
  return html`<div class="shell">
    <aside class="sidebar">
      <a class="brand" href="#/"><img src="icon.png" alt="" /><span>RATE IT</span></a>
      <nav>
        ${side('#/', '', 'Home', 'flame')}
        ${side('#/discover', 'discover', 'Discover', 'grid')}
        ${side('#/create', 'create', 'New Post', 'plus')}
        <p class="nav-section">You</p>
        ${side('#/me', 'me', 'Profile', 'user')}
        ${side('#/notifications', 'notifications', 'Notifications', 'bell', badge)}
        ${side('#/settings', 'settings', 'Settings', 'gear')}
        ${store.isAdmin ? side('#/moderation', 'moderation', 'Moderation', 'shield2') : null}
      </nav>
      <a class="account-card" href="#/me">
        <${Avatar} url=${api.avatarUrl(store.profile?.avatar_path)} name=${store.profile?.username} size=${34} />
        <span><strong>@${store.profile?.username}</strong><small>View profile</small></span>
      </a>
    </aside>
    <header class="topbar">
      <a class="brand" href="#/"><img src="icon.png" alt="" /><span>RATE IT</span></a>
      <a class="icon-btn" href="#/notifications" aria-label="Notifications"><${Icon} name="bell" />${badge}</a>
    </header>
    <main class="content">${page(route)}</main>
    <nav class="tabbar">
      ${tabs.map(([name, label, icon]) => html`<a href=${`#/${name}`} class=${active(name) ? 'on' : ''}
        aria-current=${active(name) ? 'page' : null}><${Icon} name=${icon} /><span>${label}</span></a>`)}
    </nav>
  </div>`;
}

render(html`<${App} /><${Toasts} />`, document.getElementById('app'));
