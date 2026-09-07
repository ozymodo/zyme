import { doc, getDoc, onSnapshot, setDoc } from "firebase/firestore";
import { getAuthSnapshot, subscribeAuth } from "@/lib/auth";
import { firebaseEnabled, getFirebaseDb } from "@/lib/firebase";

export type AccountStats = {
  posts: number;
  mediaAdded: number;
  mediaViewed: number;
  pagesVisited: number;
  minutesPlayed: number;
  nodesCreated: number;
  settingsChanged: number;
  particlesCaught: number;
  taps: number;
};

export type Account = {
  username: string;
  bio: string;
  /** Custom text for the animated landing-page title/nav wordmark, in place of the site default. Empty string falls back to lib/wordmark's per-load random word wherever it's rendered. */
  wordmark: string;
  xp: number;
  stats: AccountStats;
  /** Object URL for the stored profile picture blob, or null if none is set. Not persisted directly - derived from IndexedDB at load time. */
  pictureUrl: string | null;
};

// Keeps the animated letters (physics-simulated in HomeButton, cursor-repelled
// in HomeContent) from growing wide enough to look broken or collide with
// other fixed-position UI - comfortably more than the 6-8 letters of the
// default words in lib/wordmark.ts.
export const WORDMARK_MAX_LENGTH = 16;

export function usernameInitials(username: string): string {
  const trimmed = username.trim();
  if (!trimmed) return "?";
  const parts = trimmed.split(/\s+/);
  // Lowercased to match the site's all-lowercase styling, so the returned
  // string reads the same as what the avatar actually renders.
  return parts.length === 1 ? trimmed.slice(0, 2).toLowerCase() : (parts[0][0] + parts[1][0]).toLowerCase();
}

export type LevelProgress = {
  level: number;
  xp: number;
  xpIntoLevel: number;
  xpForNextLevel: number;
  progress: number;
};

const DEFAULT_STATS: AccountStats = {
  posts: 0,
  mediaAdded: 0,
  mediaViewed: 0,
  pagesVisited: 0,
  minutesPlayed: 0,
  nodesCreated: 0,
  settingsChanged: 0,
  particlesCaught: 0,
  taps: 0,
};

const DEFAULT_ACCOUNT: Account = {
  username: "",
  bio: "",
  wordmark: "",
  xp: 0,
  stats: DEFAULT_STATS,
  pictureUrl: null,
};

const STORAGE_KEY = "zyme.account";
// The key this used before the project was renamed to zyme. Read as a
// fallback (never written) so a guest's existing profile and XP carry over.
const LEGACY_STORAGE_KEY = "technature.account";
// Cooldowns for awardXp's rate-limiting, kept separate from the persisted
// profile/xp record - losing these on reload just means a fresh grace period,
// not lost progress.
const cooldowns = new Map<string, number>();

// Same external-store shape as settings.ts/blog.ts.
let cache: Account = DEFAULT_ACCOUNT;
let hydrated = false;
const listeners = new Set<() => void>();
// The signed-in uid this store is currently synced to, or null when reading/
// writing localStorage as a guest - see startFirestoreSync/handleAuthChange
// below. Set as soon as sign-in is known, before the Firestore doc read
// resolves, so a profile edit made in that gap still lands on the right uid.
let activeUid: string | null = null;

// Only the localStorage-persisted fields - pictureUrl is derived from
// IndexedDB separately and merged in by every caller below, so it's never
// clobbered by a profile/XP update or a cross-tab storage event.
type PersistedFields = Omit<Account, "pictureUrl">;

function sanitize(raw: unknown): PersistedFields {
  if (!raw || typeof raw !== "object") return DEFAULT_ACCOUNT;
  const r = raw as Partial<Account>;
  const stats = (r.stats && typeof r.stats === "object" ? r.stats : {}) as Partial<AccountStats>;
  return {
    username: typeof r.username === "string" ? r.username.slice(0, 40) : DEFAULT_ACCOUNT.username,
    bio: typeof r.bio === "string" ? r.bio.slice(0, 280) : DEFAULT_ACCOUNT.bio,
    // Sliced by code point (not UTF-16 length), so a multi-byte character
    // near the cap doesn't get split in half.
    wordmark: typeof r.wordmark === "string" ? Array.from(r.wordmark).slice(0, WORDMARK_MAX_LENGTH).join("") : DEFAULT_ACCOUNT.wordmark,
    xp: typeof r.xp === "number" && r.xp >= 0 ? r.xp : DEFAULT_ACCOUNT.xp,
    stats: {
      posts: typeof stats.posts === "number" ? stats.posts : DEFAULT_STATS.posts,
      mediaAdded: typeof stats.mediaAdded === "number" ? stats.mediaAdded : DEFAULT_STATS.mediaAdded,
      mediaViewed: typeof stats.mediaViewed === "number" ? stats.mediaViewed : DEFAULT_STATS.mediaViewed,
      pagesVisited: typeof stats.pagesVisited === "number" ? stats.pagesVisited : DEFAULT_STATS.pagesVisited,
      minutesPlayed: typeof stats.minutesPlayed === "number" ? stats.minutesPlayed : DEFAULT_STATS.minutesPlayed,
      nodesCreated: typeof stats.nodesCreated === "number" ? stats.nodesCreated : DEFAULT_STATS.nodesCreated,
      settingsChanged: typeof stats.settingsChanged === "number" ? stats.settingsChanged : DEFAULT_STATS.settingsChanged,
      particlesCaught: typeof stats.particlesCaught === "number" ? stats.particlesCaught : DEFAULT_STATS.particlesCaught,
      taps: typeof stats.taps === "number" ? stats.taps : DEFAULT_STATS.taps,
    },
  };
}

function readFromStorage(): PersistedFields {
  if (typeof window === "undefined") return DEFAULT_ACCOUNT;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY) ?? window.localStorage.getItem(LEGACY_STORAGE_KEY);
    if (!raw) return DEFAULT_ACCOUNT;
    return sanitize(JSON.parse(raw));
  } catch {
    return DEFAULT_ACCOUNT;
  }
}

function persist() {
  // Whatever this write is for, it writes the whole cache - so any click XP
  // waiting on its debounce is covered by it and its timer can be dropped.
  flushPendingClicks();
  if (activeUid) {
    const db = getFirebaseDb();
    if (!db) return;
    const { username, bio, wordmark, xp, stats } = cache;
    setDoc(doc(db, "users", activeUid), { username, bio, wordmark, xp, stats }, { merge: true }).catch(() => {});
    return;
  }
  if (typeof window !== "undefined") {
    const { username, bio, wordmark, xp, stats } = cache;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ username, bio, wordmark, xp, stats }));
  }
}

function emit() {
  for (const listener of listeners) listener();
}

function ensureHydrated() {
  if (hydrated || typeof window === "undefined") return;
  hydrated = true;
  cache = { ...readFromStorage(), pictureUrl: cache.pictureUrl };
}

if (typeof window !== "undefined") {
  ensureHydrated();
  // A tab closed (or backgrounded on mobile, where it may never come back)
  // mid-debounce would otherwise drop the last second or so of click XP.
  window.addEventListener("pagehide", () => {
    if (clickPersistTimer !== null) persist();
  });
  window.addEventListener("storage", (e) => {
    if (e.key === STORAGE_KEY && !activeUid) {
      cache = { ...readFromStorage(), pictureUrl: cache.pictureUrl };
      emit();
    }
  });
}

let firestoreUnsub: (() => void) | null = null;

function stopFirestoreSync() {
  if (firestoreUnsub) {
    firestoreUnsub();
    firestoreUnsub = null;
  }
}

async function startFirestoreSync(uid: string) {
  const db = getFirebaseDb();
  if (!db) return;
  const ref = doc(db, "users", uid);
  // First sign-in for this uid: seed the cloud profile from whatever guest
  // progress this device already has, so it isn't silently discarded. A
  // returning uid (already has a doc) keeps its cloud values untouched -
  // this device's stale local copy loses out, which is the right call for
  // syncing the same account across devices.
  try {
    const existing = await getDoc(ref);
    if (uid !== activeUid) return; // signed out again before this resolved
    if (!existing.exists()) {
      const { username, bio, wordmark, xp, stats } = cache;
      await setDoc(ref, { username, bio, wordmark, xp, stats });
    }
  } catch {
    return;
  }
  if (uid !== activeUid) return;
  firestoreUnsub = onSnapshot(ref, (snap) => {
    if (!snap.exists()) return;
    cache = { ...sanitize(snap.data()), pictureUrl: cache.pictureUrl };
    emit();
  });
}

function handleAuthChange(auth: { uid: string | null }) {
  if (auth.uid === activeUid) return;
  stopFirestoreSync();
  activeUid = auth.uid;
  if (activeUid) {
    startFirestoreSync(activeUid);
  } else {
    cache = { ...readFromStorage(), pictureUrl: cache.pictureUrl };
    emit();
  }
}

// Profile/XP/stats sync to Firestore under the signed-in uid instead of
// staying local to this device - see lib/auth.ts. Signed out (or Firebase
// unset) falls back to the localStorage behavior above unchanged.
if (typeof window !== "undefined" && firebaseEnabled) {
  handleAuthChange(getAuthSnapshot());
  subscribeAuth(() => handleAuthChange(getAuthSnapshot()));
}

export function subscribeAccount(listener: () => void) {
  return (listeners.add(listener), () => void listeners.delete(listener));
}

export function getAccountSnapshot(): Account {
  ensureHydrated();
  return cache;
}

export function getServerAccountSnapshot(): Account {
  return DEFAULT_ACCOUNT;
}

export function updateProfile(partial: { username?: string; bio?: string; wordmark?: string }) {
  ensureHydrated();
  cache = { ...sanitize({ ...cache, ...partial }), pictureUrl: cache.pictureUrl };
  persist();
  emit();
}

// A triangular curve - level L is first reached at 50*L*(L-1) total XP, so
// each level costs a little more than the last (100, 200, 300, ... more XP).
function xpToReachLevel(level: number) {
  return 50 * level * (level - 1);
}

export function levelProgress(xp: number): LevelProgress {
  const level = Math.max(1, Math.floor((1 + Math.sqrt(1 + (4 * xp) / 50)) / 2));
  const floorXp = xpToReachLevel(level);
  const xpForNextLevel = xpToReachLevel(level + 1) - floorXp;
  return { level, xp, xpIntoLevel: xp - floorXp, xpForNextLevel, progress: xpForNextLevel > 0 ? (xp - floorXp) / xpForNextLevel : 0 };
}

/**
 * Adds XP, rate-limited per `key` so the same action can't be spammed for
 * infinite XP (e.g. bouncing between two pages, or reopening one photo).
 * Returns whether it actually awarded anything, so callers can gate a stat
 * bump on real progress rather than every attempt.
 */
function awardXp(amount: number, key: string, cooldownMs: number, applyStats: (stats: AccountStats) => AccountStats) {
  ensureHydrated();
  const now = Date.now();
  const last = cooldowns.get(key);
  if (last !== undefined && now - last < cooldownMs) return false;
  cooldowns.set(key, now);
  cache = { ...cache, xp: cache.xp + amount, stats: applyStats(cache.stats) };
  persist();
  emit();
  return true;
}

export function awardNavigationXp() {
  awardXp(2, "nav", 20_000, (s) => ({ ...s, pagesVisited: s.pagesVisited + 1 }));
}

export function awardBlogPostXp() {
  awardXp(25, "post", 3_000, (s) => ({ ...s, posts: s.posts + 1 }));
}

export function awardMediaUploadXp() {
  awardXp(20, "media-upload", 3_000, (s) => ({ ...s, mediaAdded: s.mediaAdded + 1 }));
}

export function awardMediaViewXp(id: string) {
  awardXp(5, `media-view:${id}`, 60_000, (s) => ({ ...s, mediaViewed: s.mediaViewed + 1 }));
}

export function awardMicrobyteMinute() {
  awardXp(5, "microbyte-minute", 50_000, (s) => ({ ...s, minutesPlayed: s.minutesPlayed + 1 }));
}

// Short cooldown (vs. e.g. a blog post's 3s) so clicking through several
// color presets or toggles in one sitting - "trying out configurations" -
// earns a few small hits of XP rather than just the first change, while
// still shutting out spamming one control back and forth.
export function awardSettingsChangeXp() {
  awardXp(5, "settings-change", 4_000, (s) => ({ ...s, settingsChanged: s.settingsChanged + 1 }));
}

// The homepage's fleeing-particle mini-game: the hardest thing on the site
// to actually land (it's actively evading the cursor, and only one is out at
// a time), so it's by far the biggest single payout - several levels' worth
// early on. Its own cooldown here is just a backstop - SceneProvider already
// paces catches via the respawn timer.
export function awardParticleCatchXp() {
  awardXp(150, "particle-catch", 3_000, (s) => ({ ...s, particlesCaught: s.particlesCaught + 1 }));
}

// Clicking to create a node is cheap enough to spam, so unlike the other
// stats above, the "total nodes created" count always goes up - the
// cooldown only gates whether *this particular click* also earns XP.
const NODE_CREATION_XP = 3;
const NODE_CREATION_XP_COOLDOWN_MS = 2_000;

export function recordNodeCreated() {
  ensureHydrated();
  const now = Date.now();
  const last = cooldowns.get("node-created");
  const grantXp = last === undefined || now - last >= NODE_CREATION_XP_COOLDOWN_MS;
  if (grantXp) cooldowns.set("node-created", now);
  cache = {
    ...cache,
    xp: cache.xp + (grantXp ? NODE_CREATION_XP : 0),
    stats: { ...cache.stats, nodesCreated: cache.stats.nodesCreated + 1 },
  };
  persist();
  emit();
}

// Every tap or click anywhere on the site earns a little XP - poking at the
// place is the point of it. Deliberately not rate-limited the way the awards
// above are: a tap is a tap, and the payout is small enough that spamming it
// is worth far less than actually playing (one gate is 250 taps' worth).
const CLICK_XP = 1;
// What *is* batched is the write. Every other award persists immediately,
// which is fine at one-per-several-seconds, but a click can land many times
// a second - and for a signed-in account each persist is a Firestore write.
// So the XP lands in the cache (and on screen) instantly and the write
// follows on a short trailing debounce.
const CLICK_PERSIST_DEBOUNCE_MS = 1_500;
let clickPersistTimer: ReturnType<typeof setTimeout> | null = null;

function persistClicksSoon() {
  if (typeof window === "undefined") {
    persist();
    return;
  }
  if (clickPersistTimer !== null) return;
  clickPersistTimer = setTimeout(() => {
    clickPersistTimer = null;
    persist();
  }, CLICK_PERSIST_DEBOUNCE_MS);
}

/** Flushes a debounced click write early - on tab-hide/unload, and whenever another award persists anyway. */
function flushPendingClicks() {
  if (clickPersistTimer === null) return;
  clearTimeout(clickPersistTimer);
  clickPersistTimer = null;
}

export function awardClickXp() {
  ensureHydrated();
  cache = { ...cache, xp: cache.xp + CLICK_XP, stats: { ...cache.stats, taps: cache.stats.taps + 1 } };
  persistClicksSoon();
  emit();
}

// Gates track their own per-gate cooldown/edge-trigger in SceneProvider (it
// already needs that state for the cooldown-dimming visual), so by the time
// this is called the caller has already decided the pass-through counts -
// no extra rate-limiting needed here.
const GATE_XP = 250;

export function awardGateXp() {
  ensureHydrated();
  cache = { ...cache, xp: cache.xp + GATE_XP };
  persist();
  emit();
}

// The profile picture is the one binary blob this module deals with, so it
// lives in IndexedDB (same reasoning as media.ts) instead of localStorage -
// everything else above is small enough to just be JSON.
const PICTURE_DB_NAME = "technature-account";
const PICTURE_STORE = "picture";
const PICTURE_DB_VERSION = 1;
const PICTURE_RECORD_ID = "me";

function openPictureDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(PICTURE_DB_NAME, PICTURE_DB_VERSION);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(PICTURE_STORE, { keyPath: "id" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function withPictureStore<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openPictureDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(PICTURE_STORE, mode);
    const request = run(tx.objectStore(PICTURE_STORE));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

let currentPictureUrl: string | null = null;

function setPictureUrl(url: string | null) {
  if (currentPictureUrl) URL.revokeObjectURL(currentPictureUrl);
  currentPictureUrl = url;
  cache = { ...cache, pictureUrl: url };
  emit();
}

async function loadPicture() {
  try {
    const record = await withPictureStore<{ id: string; blob: Blob } | undefined>("readonly", (store) =>
      store.get(PICTURE_RECORD_ID),
    );
    if (record) setPictureUrl(URL.createObjectURL(record.blob));
  } catch {
    // No stored picture yet, or IndexedDB unavailable - leave it null.
  }
}

if (typeof window !== "undefined" && "indexedDB" in window) {
  loadPicture();
}

export async function setProfilePicture(file: File): Promise<void> {
  if (!file.type.startsWith("image/")) {
    throw new Error("Choose an image file.");
  }
  await withPictureStore("readwrite", (store) => store.put({ id: PICTURE_RECORD_ID, blob: file }));
  setPictureUrl(URL.createObjectURL(file));
}

export async function clearProfilePicture(): Promise<void> {
  await withPictureStore("readwrite", (store) => store.delete(PICTURE_RECORD_ID));
  setPictureUrl(null);
}
