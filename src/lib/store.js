import { useEffect, useState } from 'preact/hooks';

/** Tiny app-wide state: who's signed in, their profile and settings. Components re-render on change. */
const state = {
  phase: 'loading', // loading | signedOut | recovery | terms | interests | ready | loadFailed
  session: null,
  profile: null,
  settings: null,
  isAdmin: false,
  unread: 0,
  error: null,
  version: 0, // bumped when lists elsewhere should refresh (new post, block, ...)
};
const listeners = new Set();

export function getState() {
  return state;
}

export function setState(patch) {
  Object.assign(state, patch);
  listeners.forEach((listener) => listener());
}

export function useStore() {
  const [, force] = useState(0);
  useEffect(() => {
    const listener = () => force((n) => n + 1);
    listeners.add(listener);
    return () => listeners.delete(listener);
  }, []);
  return state;
}

export function bumpVersion() {
  setState({ version: state.version + 1 });
}
