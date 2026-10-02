export function compact(n) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace('.0', '')}M`;
  if (n >= 10_000) return `${(n / 1_000).toFixed(1).replace('.0', '')}K`;
  return n.toLocaleString();
}

export function ago(iso) {
  const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return 'now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d`;
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function plural(n, word) {
  return `${compact(n)} ${n === 1 ? word : `${word}s`}`;
}

/** Low scores read cool and quiet; high scores warm up to gold (same as the iOS app). */
export function ratingColor(score) {
  const t = (Math.min(Math.max(score, 1), 10) - 1) / 9;
  const c = (a, b) => Math.round((a + (b - a) * t) * 255);
  return `rgb(${c(0.62, 1)}, ${c(0.66, 0.78)}, ${c(0.72, 0.24)})`;
}

export const CATEGORIES = ['Outfit', 'Sneakers', 'Setup', 'Room', 'Car', 'Food', 'Hair', 'Art', 'Music', 'Collection', 'Travel', 'Other'];
export const INTERESTS = ['Sneakers', 'Fashion', 'Cars', 'Gaming', 'Music', 'Food', 'Art', 'Technology', 'Sports', 'Rooms', 'Travel'];
export const REPORT_REASONS = [
  ['spam', 'Spam'], ['harassment', 'Harassment'], ['inappropriate', 'Inappropriate content'], ['hate', 'Hate'],
  ['sexual', 'Sexual content'], ['violence', 'Violence'], ['other', 'Other'],
];
export const TERMS_VERSION = '2026-10-01';
export const SITE_URL = 'https://userateit.com/';
