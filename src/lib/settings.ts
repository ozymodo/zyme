import { awardSettingsChangeXp } from "@/lib/account";

export type ColorPreset = {
  label: string;
  color: string;
};

export type ParticleDensity = "off" | "low" | "standard" | "high";
export type FontChoice = "sans" | "serif" | "mono";

export type Settings = {
  /** "r, g, b" - the site's base background color, behind the particle scene. */
  backgroundColor: string;
  /** "r, g, b" (0-255 each) - matches the `data-accent`/`rgba(${accent}, a)` format already used across the scene.
   *  Colors only the wordmark/logo and the home nav button. */
  accent: string;
  /** The ambient particle field's own color (its base tone and the brighter "lit up" version near the cursor). */
  nodeColor: string;
  /** The cursor's own color - its "digital molecule", the lines it draws to nearby particles, and its dust trail. */
  cursorColor: string;
  trailEffect: boolean;
  particleDensity: ParticleDensity;
  reducedMotion: boolean;
  /** Site-wide body font. */
  font: FontChoice;
  /** The following four control only the wordmark on the landing page. */
  wordmarkFont: FontChoice;
  /** "r, g, b" - the letters shade from white down into this color, replacing the fixed white-to-emerald gradient. */
  wordmarkColor: string;
  /** Levelling up recolors one part of the site (never the background) - see levelColorChange.
   *  Switches itself off the moment a color is picked by hand, so a deliberate choice is never
   *  overwritten by the next level-up. */
  levelColors: boolean;
  /** Re-rolls the random wordmark word on every navigation away from the homepage,
   *  instead of once per page load. No effect while Account > Homepage text is set,
   *  since a custom word always wins over the random one. */
  shuffleWordmark: boolean;
  /** Scale multiplier on the wordmark's (responsive) base font size - 1 is the default size. */
  wordmarkSize: number;
  /** CSS font-weight, 100-900. */
  wordmarkWeight: number;
};

// Shared by the accent/node/cursor color settings below - each just needs a
// swatch label and an "r, g, b" value.
export const COLOR_PRESETS: ColorPreset[] = [
  { label: "Forest", color: "48, 210, 120" },
  { label: "Ocean", color: "48, 150, 255" },
  { label: "Amber", color: "245, 176, 40" },
  { label: "Violet", color: "154, 96, 255" },
  { label: "Rose", color: "250, 78, 122" },
];

// Background color needs its own, much darker set - the same hues as
// COLOR_PRESETS above (so the two pickers still read as "the same five
// choices"), but a background has to stay near-black to work as one, not a
// bright accent swatch. Each is that preset's color scaled down to a low,
// grey-leaning luminance.
export const BACKGROUND_COLOR_PRESETS: ColorPreset[] = [
  { label: "Forest", color: "4, 9, 5" },
  { label: "Ocean", color: "3, 6, 12" },
  { label: "Amber", color: "10, 7, 2" },
  { label: "Violet", color: "7, 4, 12" },
  { label: "Rose", color: "10, 3, 5" },
];

export const DEFAULT_SETTINGS: Settings = {
  backgroundColor: "4, 6, 5",
  accent: "48, 210, 120",
  nodeColor: "154, 96, 255",
  cursorColor: "48, 210, 120",
  trailEffect: true,
  particleDensity: "high",
  reducedMotion: false,
  font: "mono",
  wordmarkFont: "mono",
  // The end of the wordmark's white-to-green gradient - a light, saturated
  // tint of the same green the accent/cursor default to, so the hero reads
  // as the same color family rather than a paler, greyer one.
  wordmarkColor: "134, 245, 186",
  // On by default - see levelColorChange. Picking any color by hand turns
  // it off (updateSettings does that), so it only ever drives colors nobody
  // has claimed.
  levelColors: true,
  // On by default: the site introduces itself with a different word every
  // time you come back to the homepage, not just once per page load.
  shuffleWordmark: true,
  wordmarkSize: 1,
  wordmarkWeight: 200,
};

export const WORDMARK_SIZE_MIN = 0.6;
export const WORDMARK_SIZE_MAX = 1.6;
export const WORDMARK_WEIGHTS = [100, 200, 300, 400, 500, 600, 700, 800, 900];

// Shared by ApplySettings (site-wide body font) and HomeContent (wordmark
// font) - both just need the CSS var for a given FontChoice.
export const FONT_FAMILY_VAR: Record<FontChoice, string> = {
  sans: "var(--font-geist-sans)",
  serif: "var(--font-source-serif)",
  mono: "var(--font-geist-mono)",
};

const RGB_PATTERN = /^\d{1,3}, ?\d{1,3}, ?\d{1,3}$/;
function sanitizeColor(v: unknown, fallback: string): string {
  return typeof v === "string" && RGB_PATTERN.test(v) ? v : fallback;
}

const STORAGE_KEY = "zyme.settings";
// The key this used before the project was renamed to zyme. Read as a
// fallback (never written) so a returning visitor keeps their tuned settings
// instead of silently reverting to the defaults.
const LEGACY_STORAGE_KEY = "technature.settings";

// Same tiny external-store shape as blog.ts/media.ts: a module-level cache so
// every reader (React components via useSyncExternalStore, and imperative
// rAF loops via getSettingsSnapshot) shares one instance, kept in sync
// through localStorage rather than component state.
let cache: Settings = DEFAULT_SETTINGS;
let hydrated = false;
const listeners = new Set<() => void>();

function isParticleDensity(v: unknown): v is ParticleDensity {
  return v === "off" || v === "low" || v === "standard" || v === "high";
}

function isFontChoice(v: unknown): v is FontChoice {
  return v === "sans" || v === "serif" || v === "mono";
}

function sanitize(raw: unknown): Settings {
  if (!raw || typeof raw !== "object") return DEFAULT_SETTINGS;
  const r = raw as Partial<Settings>;
  return {
    backgroundColor: sanitizeColor(r.backgroundColor, DEFAULT_SETTINGS.backgroundColor),
    accent: sanitizeColor(r.accent, DEFAULT_SETTINGS.accent),
    nodeColor: sanitizeColor(r.nodeColor, DEFAULT_SETTINGS.nodeColor),
    cursorColor: sanitizeColor(r.cursorColor, DEFAULT_SETTINGS.cursorColor),
    trailEffect: typeof r.trailEffect === "boolean" ? r.trailEffect : DEFAULT_SETTINGS.trailEffect,
    particleDensity: isParticleDensity(r.particleDensity) ? r.particleDensity : DEFAULT_SETTINGS.particleDensity,
    reducedMotion: typeof r.reducedMotion === "boolean" ? r.reducedMotion : DEFAULT_SETTINGS.reducedMotion,
    font: isFontChoice(r.font) ? r.font : DEFAULT_SETTINGS.font,
    wordmarkFont: isFontChoice(r.wordmarkFont) ? r.wordmarkFont : DEFAULT_SETTINGS.wordmarkFont,
    wordmarkColor: sanitizeColor(r.wordmarkColor, DEFAULT_SETTINGS.wordmarkColor),
    shuffleWordmark: typeof r.shuffleWordmark === "boolean" ? r.shuffleWordmark : DEFAULT_SETTINGS.shuffleWordmark,
    levelColors: typeof r.levelColors === "boolean" ? r.levelColors : DEFAULT_SETTINGS.levelColors,
    wordmarkSize:
      typeof r.wordmarkSize === "number" && r.wordmarkSize >= WORDMARK_SIZE_MIN && r.wordmarkSize <= WORDMARK_SIZE_MAX
        ? r.wordmarkSize
        : DEFAULT_SETTINGS.wordmarkSize,
    wordmarkWeight: WORDMARK_WEIGHTS.includes(r.wordmarkWeight as number)
      ? (r.wordmarkWeight as number)
      : DEFAULT_SETTINGS.wordmarkWeight,
  };
}

function readFromStorage(): Settings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY) ?? window.localStorage.getItem(LEGACY_STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    return sanitize(JSON.parse(raw));
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function emit() {
  for (const listener of listeners) listener();
}

function ensureHydrated() {
  if (hydrated || typeof window === "undefined") return;
  hydrated = true;
  cache = readFromStorage();
}

if (typeof window !== "undefined") {
  ensureHydrated();
  window.addEventListener("storage", (e) => {
    if (e.key === STORAGE_KEY) {
      cache = readFromStorage();
      emit();
    }
  });
}

export function subscribeSettings(listener: () => void) {
  return (listeners.add(listener), () => void listeners.delete(listener));
}

export function getSettingsSnapshot(): Settings {
  ensureHydrated();
  return cache;
}

export function getServerSettingsSnapshot(): Settings {
  return DEFAULT_SETTINGS;
}

// The color settings the level-up feature is allowed to drive - deliberately
// every color except the background, which has to stay a near-black to work
// at all and so is never handed to an automatic palette.
const LEVEL_COLOR_KEYS = ["accent", "nodeColor", "cursorColor", "wordmarkColor"] as const;
type LevelColorKey = (typeof LEVEL_COLOR_KEYS)[number];

// The colors levelling up cycles through - the five Settings presets plus
// three more, so the sequence doesn't repeat as quickly as the swatch row
// would. Its length (8) is deliberately coprime with LEVEL_COLOR_KEYS' (4),
// so which color lands on which aspect keeps shifting for 32 levels before
// any pairing comes back around.
const LEVEL_COLOR_CYCLE = [
  "48, 210, 120", // forest
  "48, 150, 255", // ocean
  "245, 176, 40", // amber
  "154, 96, 255", // violet
  "250, 78, 122", // rose
  "60, 225, 220", // teal
  "255, 120, 60", // ember
  "120, 255, 90", // lime
];

/**
 * Which aspect changes, and to what, on reaching `level`. Level 2 is the
 * first level-up there is, so it's step 0. Deterministic rather than random:
 * a given level always produces the same look, and the aspect being recolored
 * rotates so no single one keeps being overwritten.
 */
export function levelColorChange(level: number): { key: LevelColorKey; color: string } {
  const step = Math.max(0, level - 2);
  return {
    key: LEVEL_COLOR_KEYS[step % LEVEL_COLOR_KEYS.length],
    // Offset by one so the very first level-up doesn't hand the accent the
    // forest green it already defaults to - a "reward" that changes nothing
    // on screen is worse than no reward at all.
    color: LEVEL_COLOR_CYCLE[(step + 1) % LEVEL_COLOR_CYCLE.length],
  };
}

/**
 * Applies a level-up's color. Deliberately not routed through
 * updateSettings: that would both switch the feature off (its manual-choice
 * guard) and award settings-change XP, and XP awarded by a level-up is a
 * loop waiting to happen.
 */
export function applyLevelColor(level: number) {
  ensureHydrated();
  if (!cache.levelColors) return;
  const { key, color } = levelColorChange(level);
  cache = sanitize({ ...cache, [key]: color });
  if (typeof window !== "undefined") window.localStorage.setItem(STORAGE_KEY, JSON.stringify(cache));
  emit();
}

function changesAColorByHand(partial: Partial<Settings>) {
  return LEVEL_COLOR_KEYS.some((key) => partial[key] !== undefined);
}

export function updateSettings(partial: Partial<Settings>) {
  ensureHydrated();
  // Picking a color by hand beats the automatic one: the feature switches
  // itself off rather than overwriting that choice at the next level-up.
  // Toggling `levelColors` itself in the same call wins, so turning it back
  // on from the Settings row isn't immediately undone.
  const autoOff: Partial<Settings> =
    partial.levelColors === undefined && changesAColorByHand(partial) ? { levelColors: false } : {};
  cache = sanitize({ ...cache, ...partial, ...autoOff });
  if (typeof window !== "undefined") {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(cache));
    // Trying out a color/font/toggle/etc. earns a little XP - rate-limited
    // in awardSettingsChangeXp itself, so clicking through several presets
    // earns a few hits rather than none after the first.
    awardSettingsChangeXp();
  }
  emit();
}

export function resetSettings() {
  cache = DEFAULT_SETTINGS;
  if (typeof window !== "undefined") {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(cache));
  }
  emit();
}

export function hexToColor(hex: string): string {
  const clean = hex.replace("#", "");
  const r = parseInt(clean.slice(0, 2), 16) || 0;
  const g = parseInt(clean.slice(2, 4), 16) || 0;
  const b = parseInt(clean.slice(4, 6), 16) || 0;
  return `${r}, ${g}, ${b}`;
}

export function colorToHex(color: string): string {
  const [r, g, b] = color.split(",").map((n) => Math.max(0, Math.min(255, parseInt(n.trim(), 10) || 0)));
  const toHex = (n: number) => n.toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/** Parses "r, g, b" into 0-1 floats, for feeding a three.js Color. */
export function colorToUnitRgb(color: string): [number, number, number] {
  const [r, g, b] = color.split(",").map((n) => Math.max(0, Math.min(255, parseInt(n.trim(), 10) || 0)));
  return [r / 255, g / 255, b / 255];
}
