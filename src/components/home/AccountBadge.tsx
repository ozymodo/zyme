"use client";

import Link from "next/link";
import type { MouseEvent } from "react";
import { useSyncExternalStore } from "react";
import {
  getAccountSnapshot,
  getServerAccountSnapshot,
  levelProgress,
  subscribeAccount,
  usernameInitials,
} from "@/lib/account";
import { useSceneTransition } from "@/components/scene/scene-context";

// Same purple used for "Account" everywhere else it shows up (the Utility
// menu's sub-link, the Account page itself), so this reads as the same
// destination.
const ACCENT = "205, 150, 235";

function isPlainLeftClick(e: MouseEvent) {
  return e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey;
}

export default function AccountBadge() {
  const { diveTo } = useSceneTransition();
  const account = useSyncExternalStore(subscribeAccount, getAccountSnapshot, getServerAccountSnapshot);
  const { level, progress } = levelProgress(account.xp);

  return (
    <Link
      href="/account"
      data-particle-target
      data-accent={ACCENT}
      onClick={(e) => {
        if (!isPlainLeftClick(e)) return;
        e.preventDefault();
        diveTo("/account", e.currentTarget);
      }}
      aria-label="Your account"
      className="fixed left-6 top-6 z-20 flex items-center gap-3 rounded-full border border-white/15 bg-white/5 py-2 pl-2 pr-4 backdrop-blur-md transition-transform duration-300 hover:scale-105"
    >
      <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full border border-white/10 bg-white/10 text-xs font-medium text-white/70">
        {account.pictureUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={account.pictureUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          usernameInitials(account.username)
        )}
      </div>
      <div className="flex flex-col items-start gap-1">
        <div className="flex items-baseline gap-2">
          <span className="text-sm font-medium text-white/85">{account.username || "Anonymous"}</span>
          <span className="text-[10px] font-medium tracking-wide text-white/40">Lv {level}</span>
        </div>
        <div className="h-1.5 w-24 overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full rounded-full transition-[width] duration-500"
            style={{ width: `${Math.round(progress * 100)}%`, backgroundColor: `rgb(${ACCENT})` }}
          />
        </div>
      </div>
    </Link>
  );
}
