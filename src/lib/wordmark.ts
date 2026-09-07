/**
 * The word the animated landing-page title (and the nav home button it hands
 * its letters off to) spells when an account has no custom wordmark set.
 *
 * One word is drawn at random per page load rather than being fixed, so the
 * site introduces itself a little differently each visit. All of them are
 * microbial-biology terms, kept to 6-8 letters so the letter physics and the
 * hero's spacing behave the same whichever one comes up.
 */
export const WORDMARK_WORDS = [
  "enzyme",
  "catalyst",
  "plasmid",
  "ribosome",
  "flagella",
  "symbiont",
  "culture",
  "mitosis",
  "protist",
  "biofilm",
  "evolution",
  "technology",
  "optimize",
  "limitless",
  "power",
  "revolution",
  "innovation",
  "unlimited",
  "renegade",
  "resolution",
  "strategy",
  "cognition",
  "create",
  "sapien",
  "ludens",
  "tactical",
  "ultralight",
  "energy",
  "gusto",
  "knowledge",
  "freedom",
  "imagination",
  "organism",
  "human",
  "genius",
  "compute",
  "primate",
] as const;

/**
 * The word rendered during server rendering and React's hydration pass.
 * Fixed (not random) so the server's HTML and the client's first render
 * agree; the random pick swaps in right after hydration - see
 * getDefaultWordmark. Also the placeholder in Account > Homepage text.
 */
export const DEFAULT_WORDMARK = WORDMARK_WORDS[0];

// The word in play right now. Chosen once at module evaluation so the hero
// title and the home button always read the same word - they share
// framer-motion layoutIds per letter, and two different words at once would
// tear that handoff. With Settings > Shuffle each visit on, it's re-rolled
// (see shuffleDefaultWordmark) at exactly one moment: a navigation away
// from the homepage, when the hero has already handed its letters over.
let sessionWordmark = typeof window === "undefined" ? DEFAULT_WORDMARK : randomWord(DEFAULT_WORDMARK);

// useSyncExternalStore shape, matching lib/account.ts and lib/settings.ts.
// Subscribers exist so a re-roll reaches the home button/hero; without the
// shuffle setting on, the value never changes and nothing is ever emitted.
const listeners = new Set<() => void>();

/** A random word that isn't `avoid` - so a re-roll always visibly changes the word. */
function randomWord(avoid: string): string {
  const options = WORDMARK_WORDS.filter((w) => w !== avoid);
  const pool = options.length > 0 ? options : WORDMARK_WORDS;
  return pool[Math.floor(Math.random() * pool.length)];
}

export function subscribeDefaultWordmark(listener: () => void): () => void {
  return (listeners.add(listener), () => void listeners.delete(listener));
}

export function getDefaultWordmark(): string {
  return sessionWordmark;
}

export function getServerDefaultWordmark(): string {
  return DEFAULT_WORDMARK;
}

/**
 * Draws a new word (always a different one) and notifies every reader, so
 * the home button and the hero title stay on the same word as each other
 * while together moving on to the next one.
 */
export function shuffleDefaultWordmark() {
  if (typeof window === "undefined") return;
  sessionWordmark = randomWord(sessionWordmark);
  for (const listener of listeners) listener();
}
