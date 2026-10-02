import * as api from './api.js';

/** Public half of the Web Push (VAPID) key pair; the private half is a Supabase function secret. */
const VAPID_PUBLIC_KEY = 'BLP4MpAudUHQ12JEzM7bgti-urud7BPzpw6jPHemntrV00U2qTkEVJLlVie0UapKVhjdihJapSPlKly4wPFy0XM';

const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const isStandalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;

/** 'ready' | 'needs-home-screen' (iPhone/iPad Safari: only home-screen web apps get push) | 'unsupported' */
export function pushSupport() {
  if ('serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window) return 'ready';
  if (isIOS && !isStandalone) return 'needs-home-screen';
  return 'unsupported';
}

async function registration() {
  return navigator.serviceWorker.register('sw.js');
}

function keyBytes(base64url) {
  const raw = atob(base64url.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

/** Is push on for this browser (and does the server know about it)? */
export async function pushEnabled() {
  if (pushSupport() !== 'ready' || Notification.permission !== 'granted') return false;
  const reg = await navigator.serviceWorker.getRegistration();
  return Boolean(await reg?.pushManager.getSubscription());
}

/** Asks for permission and subscribes this browser. Throws with a readable message if it can't. */
export async function enablePush() {
  if (pushSupport() === 'needs-home-screen') throw new Error('On iPhone, add Rate It to your Home Screen first (Share → Add to Home Screen), then turn this on from there.');
  if (pushSupport() !== 'ready') throw new Error("This browser doesn't support notifications.");
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('Notifications are blocked for this site. Allow them in your browser settings.');
  const reg = await registration();
  await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription()
    || await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(VAPID_PUBLIC_KEY) });
  await api.registerPush(sub.endpoint, sub.toJSON());
}

export async function disablePush() {
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  if (!sub) return;
  await api.unregisterPush(sub.endpoint).catch(() => {});
  await sub.unsubscribe();
}

/** After signing in: make sure an existing subscription belongs to whoever is signed in now. */
export async function refreshPush() {
  try {
    if (!(await pushEnabled())) return;
    const sub = await (await navigator.serviceWorker.getRegistration()).pushManager.getSubscription();
    await api.registerPush(sub.endpoint, sub.toJSON());
  } catch {}
}

/** Before signing out: stop sending this account's notifications to this browser. */
export async function forgetPushForThisAccount() {
  try {
    const sub = await (await navigator.serviceWorker.getRegistration())?.pushManager.getSubscription();
    if (sub) await api.unregisterPush(sub.endpoint);
  } catch {}
}
