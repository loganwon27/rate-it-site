// Every call to the backend lives here (the web twin of RateIt/Core/Services). Pages never call `db` directly.
import { appUrl, db, publicUrl, unwrap, userError } from './backend.js';
import { TERMS_VERSION } from './format.js';
import { cropToJpeg } from './image.js';

const me = () => db.auth.getSession().then(({ data }) => data.session?.user ?? null);

async function myId() {
  const user = await me();
  if (!user) throw userError('Please log in again.');
  return user.id;
}

// ---------- Accounts ----------

export const USERNAME_HINT = 'Usernames are 3–20 characters: letters, numbers, _ and .';

export function normalizeUsername(raw) {
  return raw.trim().toLowerCase();
}

export function isValidUsername(name) {
  return /^[a-z0-9_.]{3,20}$/.test(name) && !name.startsWith('.') && !name.endsWith('.') && !name.includes('..');
}

export function isValidEmail(email) {
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim());
}

export async function usernameAvailable(name) {
  return unwrap(await db.rpc('username_available', { p_username: name }));
}

/** Returns 'signedIn' or 'confirmEmail'. */
export async function signUp({ username, email, password }) {
  const name = normalizeUsername(username);
  if (!isValidUsername(name)) throw userError(USERNAME_HINT);
  if (!isValidEmail(email)) throw userError('Enter a valid email address.');
  if (password.length < 8) throw userError('Use at least 8 characters for your password.');
  if (!(await usernameAvailable(name))) throw userError('That username is taken.');
  const data = unwrap(await db.auth.signUp({
    email: email.trim(),
    password,
    options: { data: { username: name, terms_version: TERMS_VERSION }, emailRedirectTo: appUrl },
  }));
  return data.session ? 'signedIn' : 'confirmEmail';
}

export async function signIn(email, password) {
  unwrap(await db.auth.signInWithPassword({ email: email.trim(), password }));
}

export async function sendPasswordReset(email) {
  unwrap(await db.auth.resetPasswordForEmail(email.trim(), { redirectTo: appUrl }));
}

export async function updatePassword(password) {
  if (password.length < 8) throw userError('Use at least 8 characters for your password.');
  unwrap(await db.auth.updateUser({ password }));
}

export async function signOut() {
  // Stop this browser getting the account's notifications (imported lazily: push.js imports this file).
  await (await import('./push.js')).forgetPushForThisAccount();
  await db.auth.signOut();
}

/** Push notifications: register or remove this browser (web) for the signed-in account. */
export async function registerPush(endpoint, subscription) {
  unwrap(await db.rpc('register_push_token', { p_token: endpoint, p_platform: 'web', p_subscription: subscription }));
}

export async function unregisterPush(endpoint) {
  unwrap(await db.rpc('unregister_push_token', { p_token: endpoint }));
}

/** Removes the account's photos, then the account and everything tied to it. */
export async function deleteAccount() {
  const id = await myId();
  for (const bucket of ['posts', 'avatars']) {
    const { data: files } = await db.storage.from(bucket).list(id, { limit: 1000 });
    const paths = (files || []).map((f) => `${id}/${f.name}`);
    if (paths.length) await db.storage.from(bucket).remove(paths);
  }
  unwrap(await db.rpc('delete_account'));
  // The account is gone on the server, so only clear this device's session.
  await db.auth.signOut({ scope: 'local' });
}

// ---------- Profiles & settings ----------

export function avatarUrl(path) {
  return publicUrl('avatars', path);
}

export async function profile(id) {
  const rows = unwrap(await db.from('profiles').select('*').eq('id', id).limit(1));
  if (!rows.length) throw userError("This profile isn't available.");
  return rows[0];
}

export async function myProfile() {
  return profile(await myId());
}

export async function updateProfile(changes) {
  const id = await myId();
  return unwrap(await db.from('profiles').update(changes).eq('id', id).select().single());
}

export async function uploadAvatar(file) {
  const id = await myId();
  const blob = await cropToJpeg(file, { maxSize: 400, square: true, quality: 0.85 });
  const path = `${id}/avatar-${crypto.randomUUID().slice(0, 8)}.jpg`;
  unwrap(await db.storage.from('avatars').upload(path, blob, { contentType: 'image/jpeg', cacheControl: '31536000' }));
  return path;
}

export async function removeAvatar(path) {
  await db.storage.from('avatars').remove([path]);
}

export async function searchProfiles(query) {
  const term = query.trim().toLowerCase().replace(/[%_]/g, '');
  if (!term) return [];
  return unwrap(await db.from('profiles').select('id, username, avatar_path, bio')
    .ilike('username', `%${term}%`).order('follower_count', { ascending: false }).limit(10));
}

export async function settings() {
  const id = await myId();
  return unwrap(await db.from('user_settings').select('*').eq('user_id', id).single());
}

export async function saveSettings(changes) {
  const id = await myId();
  unwrap(await db.from('user_settings').update(changes).eq('user_id', id));
}

export async function acceptTerms() {
  await saveSettings({ terms_version: TERMS_VERSION, terms_accepted_at: new Date().toISOString() });
}

export async function isAdmin() {
  const { data } = await db.rpc('is_admin');
  return Boolean(data);
}

/** The app owner (@logan): the only account that can ban. */
export async function isOwner() {
  const { data } = await db.rpc('is_owner');
  return Boolean(data);
}

/** Owner only. `until` is an ISO date, or null to ban forever. */
export async function ownerBan(userId, until, reason = '') {
  unwrap(await db.rpc('owner_ban', { p_user: userId, p_until: until, p_reason: reason }));
}

export async function ownerUnban(userId) {
  unwrap(await db.rpc('owner_unban', { p_user: userId }));
}

/** Founders only: 'founder' | 'admin' | 'friend' | 'none'. Sets the powers and the tag together. */
export async function ownerSetRole(userId, role) {
  unwrap(await db.rpc('owner_set_role', { p_user: userId, p_role: role }));
}

export async function bannedAccounts() {
  return unwrap(await db.rpc('owner_banned_accounts'));
}

// ---------- Posts ----------

export function postImage(post) {
  return publicUrl('posts', post.image_path);
}

export function postThumb(post) {
  return publicUrl('posts', post.thumb_path);
}

export async function feed(exclude = []) {
  return unwrap(await db.rpc('get_feed', { p_limit: 8, p_exclude: exclude }));
}

export async function discover({ mode, category, query, offset = 0 }) {
  return unwrap(await db.rpc('discover_posts', {
    p_mode: mode, p_category: category || null, p_query: query?.trim() || null, p_limit: 30, p_offset: offset,
  }));
}

export async function postsBy(authorId) {
  return unwrap(await db.from('post_cards').select('*').eq('author_id', authorId)
    .order('created_at', { ascending: false }).limit(60));
}

export async function post(id) {
  const rows = unwrap(await db.from('post_cards').select('*').eq('id', id).limit(1));
  if (!rows.length) throw userError("This post isn't available anymore.");
  return rows[0];
}

/** Uploads a full-size image and a grid thumbnail, then creates the post. `image` is a 4:5 cropped canvas. */
export async function createPost({ canvas, category, caption, prompt = '', showUsername }) {
  const id = await myId();
  const postId = crypto.randomUUID();
  const full = await canvasToJpeg(canvas, 1440, 0.82);
  const thumb = await canvasToJpeg(canvas, 480, 0.75);
  const fullPath = `${id}/${postId}-full.jpg`;
  const thumbPath = `${id}/${postId}-thumb.jpg`;
  const bucket = db.storage.from('posts');
  unwrap(await bucket.upload(fullPath, full.blob, { contentType: 'image/jpeg', cacheControl: '31536000' }));
  try {
    unwrap(await bucket.upload(thumbPath, thumb.blob, { contentType: 'image/jpeg', cacheControl: '31536000' }));
    unwrap(await db.from('posts').insert({
      id: postId, image_path: fullPath, thumb_path: thumbPath,
      image_width: full.width, image_height: full.height,
      category: category.trim(), caption: caption.trim(), prompt: prompt.trim(), show_username: showUsername,
    }));
  } catch (error) {
    await bucket.remove([fullPath, thumbPath]);
    throw error;
  }
  return post(postId);
}

async function canvasToJpeg(canvas, maxWidth, quality) {
  const scale = Math.min(1, maxWidth / canvas.width);
  const out = document.createElement('canvas');
  out.width = Math.round(canvas.width * scale);
  out.height = Math.round(canvas.height * scale);
  const ctx = out.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(canvas, 0, 0, out.width, out.height);
  const blob = await new Promise((resolve) => out.toBlob(resolve, 'image/jpeg', quality));
  return { blob, width: out.width, height: out.height };
}

export async function deletePost(p) {
  unwrap(await db.from('posts').delete().eq('id', p.id));
  await db.storage.from('posts').remove([p.image_path, p.thumb_path]);
}

// ---------- Ratings ----------

export async function rate(postId, score, anonymously) {
  return unwrap(await db.rpc('rate_post', { p_post: postId, p_score: score, p_anonymous: anonymously }));
}

/** What a share link shows; works signed out. Null if the post is gone or hidden. */
export async function sharedPost(code) {
  return unwrap(await db.rpc('shared_post', { p_code: code }));
}

/** The link people share: opens the photo for anyone, signed in or not. */
export function shareUrl(post) {
  return post.share_code ? `https://userateit.com/r/?p=${post.share_code}` : `https://userateit.com/#/p/${post.id}`;
}

export async function ratingStats(postId) {
  return unwrap(await db.rpc('rating_stats', { p_post: postId }));
}

export async function raters(postId) {
  return unwrap(await db.rpc('post_raters', { p_post: postId }));
}

// ---------- Likes, comments, follows ----------

export async function like(postId) {
  unwrap(await db.from('likes').insert({ post_id: postId }));
}

export async function unlike(postId) {
  const id = await myId();
  unwrap(await db.from('likes').delete().eq('post_id', postId).eq('user_id', id));
}

const COMMENT_COLUMNS = 'id, post_id, user_id, body, created_at, author:profiles(username, avatar_path, badge)';

export async function comments(postId) {
  return unwrap(await db.from('comments').select(COMMENT_COLUMNS).eq('post_id', postId)
    .order('created_at', { ascending: true }).limit(200));
}

export async function addComment(postId, body) {
  return unwrap(await db.from('comments').insert({ post_id: postId, body: body.trim() }).select(COMMENT_COLUMNS).single());
}

export async function deleteComment(id) {
  unwrap(await db.from('comments').delete().eq('id', id));
}

export async function follow(userId) {
  unwrap(await db.from('follows').insert({ following_id: userId }));
}

export async function unfollow(userId) {
  const id = await myId();
  unwrap(await db.from('follows').delete().eq('follower_id', id).eq('following_id', userId));
}

export async function isFollowing(userId) {
  const id = await myId();
  const { count, error } = await db.from('follows').select('*', { count: 'exact', head: true })
    .eq('follower_id', id).eq('following_id', userId);
  if (error) throw error;
  return (count || 0) > 0;
}

export async function followList(userId, kind) {
  return unwrap(await db.rpc('follow_list', { p_user: userId, p_kind: kind }));
}

// ---------- Moderation ----------

export async function report(targetType, targetId, reason, details = '') {
  const { error } = await db.from('reports').insert({
    target_type: targetType, target_id: targetId, reason, details: details.slice(0, 500),
  });
  if (error && !`${error.message}`.includes('duplicate key')) throw error;
}

export async function block(userId) {
  unwrap(await db.from('blocks').insert({ blocked_id: userId }));
}

export async function unblock(userId) {
  const id = await myId();
  unwrap(await db.from('blocks').delete().eq('blocker_id', id).eq('blocked_id', userId));
}

export async function blockedUsers() {
  return unwrap(await db.rpc('my_blocked_users'));
}

export async function openReports() {
  return unwrap(await db.rpc('admin_open_reports'));
}

export async function insights(days = 14) {
  return unwrap(await db.rpc('admin_insights', { p_days: days }));
}

export async function resolveReport(item, action) {
  unwrap(await db.rpc('admin_resolve', { p_target_type: item.target_type, p_target_id: item.target_id, p_action: action }));
}

// ---------- Notifications ----------

export async function notifications() {
  return unwrap(await db.from('notifications')
    .select('id, type, post_id, data, read_at, created_at, actor:profiles!notifications_actor_id_fkey(id, username, avatar_path)')
    .order('created_at', { ascending: false }).limit(50));
}

export async function unreadCount() {
  const { count } = await db.from('notifications').select('*', { count: 'exact', head: true }).is('read_at', null);
  return count || 0;
}

export async function markAllRead() {
  const id = await myId();
  await db.from('notifications').update({ read_at: new Date().toISOString() }).eq('user_id', id).is('read_at', null);
}
