"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import { getAccountSnapshot, getServerAccountSnapshot, levelProgress, subscribeAccount } from "@/lib/account";
import { applyLevelColor } from "@/lib/settings";

/**
 * Renders nothing - it just watches the account's level and recolors one
 * part of the site each time it goes up (Settings > Level-up colors; see
 * levelColorChange for what changes and to what).
 *
 * Only a rise *during this session* counts: the level is derived from stored
 * XP, so on every load the first reading is simply remembered as the
 * starting point rather than treated as a fresh level-up. That also means
 * the color lands the moment the XP does - mid-page, wherever you happened
 * to earn it - since this sits in the root layout alongside ApplySettings
 * and outlives every route.
 */
export default function LevelColors() {
  const account = useSyncExternalStore(subscribeAccount, getAccountSnapshot, getServerAccountSnapshot);
  const { level } = levelProgress(account.xp);
  const lastLevel = useRef<number | null>(null);

  useEffect(() => {
    const previous = lastLevel.current;
    lastLevel.current = level;
    // applyLevelColor is itself a no-op while the setting is off, so the
    // level is tracked either way and turning the toggle back on doesn't
    // retroactively fire for levels gained while it was off.
    if (previous !== null && level > previous) applyLevelColor(level);
  }, [level]);

  return null;
}
