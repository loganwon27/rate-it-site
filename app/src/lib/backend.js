// The single shared connection to Supabase, plus helpers used everywhere.
const config = window.RATE_IT_CONFIG || {};

export const isConfigured = Boolean(
  config.supabaseUrl && config.supabaseKey && !config.supabaseUrl.includes('YOUR-PROJECT'),
);

/** Gives up on a stalled request after 30s so screens can show "Try again" instead of spinning forever. */
function fetchWithTimeout(url, options = {}) {
  return fetch(url, { ...options, signal: options.signal ?? AbortSignal.timeout(30000) });
}

export const db = isConfigured
  ? window.supabase.createClient(config.supabaseUrl, config.supabaseKey, {
      auth: { flowType: 'pkce', persistSession: true, detectSessionInUrl: true },
      global: { fetch: fetchWithTimeout },
    })
  : null;

/** Public URL for a file in a public bucket, built locally (no network call). */
export function publicUrl(bucket, path) {
  if (!path) return null;
  return `${config.supabaseUrl}/storage/v1/object/public/${bucket}/${path}`;
}

/** The address of this web app, used for email links (confirmations, password resets). */
export const appUrl = window.location.origin + window.location.pathname;

const FALLBACK = 'Something went wrong. Try again.';

const KNOWN = [
  ['already_rated', 'You already rated this.'],
  ['rate_limited', "You're doing that too fast. Try again in a bit."],
  ['own_post', "You can't rate your own post."],
  ['post_not_found', "This post isn't available anymore."],
  ['rate_first', 'Rate it to see the results.'],
  ['account_restricted', 'Your account has been restricted for breaking the community rules.'],
  ['not_allowed', "You don't have permission to do that."],
  ['invalid login credentials', 'Wrong email or password.'],
  ['email not confirmed', 'Confirm your email first — check your inbox.'],
  ['user already registered', 'An account with this email already exists.'],
  ['database error saving new user', "That username can't be used. Try another."],
  ['duplicate key', "That's already done."],
  ['password should be', 'Use at least 8 characters for your password.'],
  ['email_address_invalid', "That email address doesn't look right."],
  ['is invalid', "That email address doesn't look right."],
  ['payload too large', 'That photo is too large. Try another one.'],
  ['jwt expired', 'Your session expired. Please log in again.'],
  ['failed to fetch', "You're offline. Check your connection and try again."],
  ['networkerror', "You're offline. Check your connection and try again."],
  ['timeouterror', 'That took too long. Try again.'],
  ['signal timed out', 'That took too long. Try again.'],
];

/** Turns any error into a short message a person can act on. */
export function describeError(error) {
  if (!error) return FALLBACK;
  if (error.userMessage) return error.userMessage;
  const raw = `${error.message || ''} ${error.code || ''} ${error.details || ''}`.toLowerCase();
  for (const [needle, message] of KNOWN) {
    if (raw.includes(needle)) return message;
  }
  return FALLBACK;
}

/** An error whose message is already written for people. */
export function userError(message) {
  const error = new Error(message);
  error.userMessage = message;
  return error;
}

/** Throws Supabase's { error } results so callers can use try/catch. */
export function unwrap({ data, error }) {
  if (error) throw error;
  return data;
}
