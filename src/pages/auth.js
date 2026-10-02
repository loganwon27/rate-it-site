import { useEffect, useState } from 'preact/hooks';
import * as api from '../lib/api.js';
import { describeError } from '../lib/backend.js';
import { INTERESTS, SITE_URL } from '../lib/format.js';
import { html } from '../lib/html.js';
import { getState, setState } from '../lib/store.js';
import { Icon } from '../components/ui.js';

function Brand() {
  return html`<div class="brand"><img src="icon.png" alt="" /><span>RATE IT</span></div>`;
}

export function AuthPage({ notice: initialNotice }) {
  const [mode, setMode] = useState('signUp');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [agreed, setAgreed] = useState(false);
  const [nameStatus, setNameStatus] = useState('empty'); // empty | invalid | checking | available | taken
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(initialNotice || null);

  useEffect(() => {
    if (mode !== 'signUp') return undefined;
    const name = api.normalizeUsername(username);
    if (!name) { setNameStatus('empty'); return undefined; }
    if (!api.isValidUsername(name)) { setNameStatus(name.length < 3 ? 'empty' : 'invalid'); return undefined; }
    setNameStatus('checking');
    const timer = setTimeout(async () => {
      try {
        setNameStatus((await api.usernameAvailable(name)) ? 'available' : 'taken');
      } catch (e) {
        setNameStatus('empty');
        setError(describeError(e));
      }
    }, 350);
    return () => clearTimeout(timer);
  }, [username, mode]);

  const canSubmit = mode === 'signUp'
    ? nameStatus === 'available' && api.isValidEmail(email) && password.length >= 8 && agreed
    : email && password;

  async function submit(e) {
    e.preventDefault();
    if (!canSubmit || busy) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      if (mode === 'signUp') {
        const result = await api.signUp({ username, email, password });
        if (result === 'confirmEmail') {
          setNotice('Check your email and tap the link to confirm your account, then log in.');
          setMode('logIn');
        }
      } else {
        await api.signIn(email, password);
      }
    } catch (err) {
      setError(describeError(err));
    }
    setBusy(false);
  }

  async function forgot() {
    if (!api.isValidEmail(email)) { setError('Enter your email above first.'); return; }
    try {
      await api.sendPasswordReset(email);
      setError(null);
      setNotice('Password reset email sent. Open the link on this device.');
    } catch (err) {
      setError(describeError(err));
    }
  }

  function switchMode() {
    setMode(mode === 'signUp' ? 'logIn' : 'signUp');
    setError(null);
    setNotice(null);
  }

  return html`<div class="auth">
    <div class="auth-hero">
      <${Brand} />
      <h1>Post anything.<br />See what people think.</h1>
      <p class="muted">Rate photos 1–10 and see how everyone voted.</p>
      <p class="legal-links">
        <a href=${`${SITE_URL}support/`}>Help</a>${' · '}<a href=${`${SITE_URL}privacy/`}>Privacy</a>${' · '}<a href=${`${SITE_URL}terms/`}>Terms</a>
      </p>
    </div>
    <form class="auth-card" onSubmit=${submit}>
      <h2>${mode === 'signUp' ? 'Create your account' : 'Welcome back'}</h2>
      ${mode === 'signUp' ? html`<label class="field">
        <span class="prefix">@</span>
        <input placeholder="username" autocomplete="username" autocapitalize="none" spellcheck="false" maxlength="20"
          value=${username} onInput=${(e) => setUsername(api.normalizeUsername(e.target.value))} aria-label="Username" />
        <span class=${`status is-${nameStatus}`} aria-live="polite">${{ checking: '…', available: '✓', taken: '✕', invalid: '✕' }[nameStatus] || ''}</span>
      </label>
      ${nameStatus === 'invalid' ? html`<p class="error small">${api.USERNAME_HINT}</p>` : null}
      ${nameStatus === 'taken' ? html`<p class="error small">That username is taken.</p>` : null}` : null}
      <input class="field" type="email" placeholder="Email" autocomplete="email" value=${email}
        onInput=${(e) => setEmail(e.target.value)} aria-label="Email" />
      <input class="field" type="password" placeholder=${mode === 'signUp' ? 'Password (8+ characters)' : 'Password'}
        autocomplete=${mode === 'signUp' ? 'new-password' : 'current-password'} value=${password}
        onInput=${(e) => setPassword(e.target.value)} aria-label="Password" />
      ${mode === 'signUp' ? html`<label class="agree">
        <input type="checkbox" checked=${agreed} onChange=${(e) => setAgreed(e.target.checked)} />
        <span>I agree to the community rules: no bullying, harassment, nudity or hate.
${' '}<a href=${`${SITE_URL}terms/`} target="_blank" rel="noopener">Terms of Service</a>${' · '}<a
            href=${`${SITE_URL}privacy/`} target="_blank" rel="noopener">Privacy Policy</a></span>
      </label>` : null}
      ${error ? html`<p class="error" role="alert">${error}</p>` : null}
      ${notice ? html`<p class="notice">${notice}</p>` : null}
      <button class="btn primary block" disabled=${!canSubmit || busy}>
        ${busy ? 'One moment…' : mode === 'signUp' ? 'Create account' : 'Log in'}
      </button>
      <button type="button" class="link" onClick=${switchMode}>
        ${mode === 'signUp' ? html`Already have an account? <strong>Log in</strong>` : html`New here? <strong>Create an account</strong>`}
      </button>
      ${mode === 'logIn' ? html`<button type="button" class="link muted" onClick=${forgot}>Forgot password?</button>` : null}
    </form>
  </div>`;
}

/** After tapping a password-reset link. */
export function NewPasswordPage() {
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function save(e) {
    e.preventDefault();
    setBusy(true);
    try {
      await api.updatePassword(password);
      setState({ phase: 'loading' });
      window.location.hash = '/';
      window.location.reload();
    } catch (err) {
      setError(describeError(err));
      setBusy(false);
    }
  }

  return html`<div class="auth single">
    <form class="auth-card" onSubmit=${save}>
      <${Brand} />
      <h2>Choose a new password</h2>
      <input class="field" type="password" placeholder="New password (8+ characters)" autocomplete="new-password"
        value=${password} onInput=${(e) => setPassword(e.target.value)} aria-label="New password" />
      ${error ? html`<p class="error">${error}</p>` : null}
      <button class="btn primary block" disabled=${password.length < 8 || busy}>${busy ? 'Saving…' : 'Save password'}</button>
    </form>
  </div>`;
}

/** Shown once to accounts that haven't agreed to the current terms. */
export function TermsGate({ onAccepted }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const rules = [
    'Rate honestly, not cruelly. No bullying or harassment.',
    'Only post photos you have the right to share.',
    'No nudity, violence, hate or anything illegal.',
    'Report anything that breaks these rules. We review reports within 24 hours.',
  ];
  async function accept() {
    setBusy(true);
    try {
      await api.acceptTerms();
      onAccepted();
    } catch (err) {
      setError(describeError(err));
      setBusy(false);
    }
  }
  return html`<div class="auth single">
    <div class="auth-card">
      <span class="gold"><${Icon} name="shield" size=${44} /></span>
      <h2>Community rules</h2>
      <ul class="rules">${rules.map((rule) => html`<li>${rule}</li>`)}</ul>
      <p class="muted small">Breaking these rules gets content removed and accounts banned.${' '}<a
        href=${`${SITE_URL}terms/`} target="_blank" rel="noopener">Terms</a>${' · '}<a
        href=${`${SITE_URL}privacy/`} target="_blank" rel="noopener">Privacy</a></p>
      ${error ? html`<p class="error">${error}</p>` : null}
      <button class="btn primary block" disabled=${busy} onClick=${accept}>${busy ? 'Saving…' : 'I agree'}</button>
      <button class="link muted" onClick=${() => api.signOut()}>Log out</button>
    </div>
  </div>`;
}

export function InterestsPage({ onDone }) {
  const [selected, setSelected] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const toggle = (i) => setSelected(selected.includes(i) ? selected.filter((x) => x !== i) : [...selected, i]);

  async function save() {
    setBusy(true);
    try {
      const profile = await api.updateProfile({ interests: INTERESTS.filter((i) => selected.includes(i)) });
      setState({ profile });
      onDone();
    } catch (err) {
      setError(describeError(err));
      setBusy(false);
    }
  }

  function skip() {
    try { localStorage.setItem(`interestsDone-${getState().profile?.id}`, '1'); } catch {}
    onDone();
  }

  return html`<div class="auth single">
    <div class="auth-card">
      <h2>What are you into?</h2>
      <p class="muted">Pick a few. We'll use them to fill your feed.</p>
      <div class="interest-grid">
        ${INTERESTS.map((i) => html`<button class=${`interest ${selected.includes(i) ? 'on' : ''}`} aria-pressed=${selected.includes(i)}
          onClick=${() => toggle(i)}>${i}</button>`)}
      </div>
      ${error ? html`<p class="error">${error}</p>` : null}
      <button class="btn primary block" disabled=${!selected.length || busy} onClick=${save}>
        ${selected.length ? 'Continue' : 'Pick at least one'}
      </button>
      <button class="link muted" onClick=${skip}>Skip for now</button>
    </div>
  </div>`;
}
