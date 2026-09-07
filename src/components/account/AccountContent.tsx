"use client";

import { useRef, useState, useSyncExternalStore } from "react";
import {
  clearProfilePicture,
  getAccountSnapshot,
  getServerAccountSnapshot,
  levelProgress,
  setProfilePicture,
  subscribeAccount,
  updateProfile,
  usernameInitials,
  WORDMARK_MAX_LENGTH,
} from "@/lib/account";
import { DEFAULT_WORDMARK } from "@/lib/wordmark";
import AnimatedTitle from "@/components/common/AnimatedTitle";
import { Row, Section } from "@/components/common/Panel";
import AuthPanel from "@/components/account/AuthPanel";
import { getAuthSnapshot, getServerAuthSnapshot, subscribeAuth } from "@/lib/auth";

const ACCENT = "205, 150, 235";
// Local state persists on a short debounce rather than every keystroke, so
// typing a bio doesn't hammer localStorage - and again immediately on blur,
// so nothing's lost if the field never sits idle long enough to fire.
const SAVE_DEBOUNCE_MS = 500;

const STAT_LABELS: {
  key:
    | "posts"
    | "mediaAdded"
    | "mediaViewed"
    | "pagesVisited"
    | "minutesPlayed"
    | "nodesCreated"
    | "settingsChanged"
    | "particlesCaught"
    | "taps";
  label: string;
}[] = [
  { key: "posts", label: "Posts" },
  { key: "mediaAdded", label: "Media added" },
  { key: "mediaViewed", label: "Media viewed" },
  { key: "pagesVisited", label: "Pages visited" },
  { key: "minutesPlayed", label: "Minutes in Microbyte" },
  { key: "nodesCreated", label: "Nodes created" },
  { key: "settingsChanged", label: "Settings tweaked" },
  { key: "particlesCaught", label: "Particles caught" },
  { key: "taps", label: "Taps" },
];

export default function AccountContent() {
  const account = useSyncExternalStore(subscribeAccount, getAccountSnapshot, getServerAccountSnapshot);
  const auth = useSyncExternalStore(subscribeAuth, getAuthSnapshot, getServerAuthSnapshot);
  // Only holds a value while the field is being actively edited (including
  // its debounce window) - otherwise falls through to the store's value.
  // Deriving the displayed value this way, instead of seeding useState from
  // `account` once and syncing it via an effect, means a stale first paint
  // (the SSR-safe default, before the store finishes hydrating from
  // localStorage) can never stick: the store's real value is always what's
  // shown once there's no in-progress edit.
  const [draftUsername, setDraftUsername] = useState<string | null>(null);
  const [draftBio, setDraftBio] = useState<string | null>(null);
  const [draftWordmark, setDraftWordmark] = useState<string | null>(null);
  const [pictureError, setPictureError] = useState<string | null>(null);
  const username = draftUsername ?? account.username;
  const bio = draftBio ?? account.bio;
  const wordmark = draftWordmark ?? account.wordmark;
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Accumulates edits across all three fields, so debouncing one doesn't drop
  // a change to another made just before it (e.g. tabbing between fields
  // within the debounce window).
  const pending = useRef<{ username?: string; bio?: string; wordmark?: string }>({});
  const fileInputRef = useRef<HTMLInputElement>(null);

  const flush = () => {
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    if (Object.keys(pending.current).length > 0) {
      updateProfile(pending.current);
      pending.current = {};
    }
    setDraftUsername(null);
    setDraftBio(null);
    setDraftWordmark(null);
  };

  const scheduleSave = (next: { username?: string; bio?: string; wordmark?: string }) => {
    pending.current = { ...pending.current, ...next };
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(flush, SAVE_DEBOUNCE_MS);
  };

  const saveNow = (next: { username?: string; bio?: string; wordmark?: string }) => {
    pending.current = { ...pending.current, ...next };
    flush();
  };

  const handlePictureChange = async (file: File | undefined) => {
    if (!file) return;
    try {
      setPictureError(null);
      await setProfilePicture(file);
    } catch (err) {
      setPictureError(err instanceof Error ? err.message : "Couldn't set that picture.");
    }
  };

  const { level, xp, xpIntoLevel, xpForNextLevel, progress } = levelProgress(account.xp);

  return (
    <div className="scroll-page relative flex h-dvh touch-pan-y flex-col items-center gap-10 overflow-y-auto px-6 py-24 text-center short-landscape:gap-8 short-landscape:py-14">
      <div
        className="pointer-events-none absolute left-1/2 top-24 h-72 w-72 -translate-x-1/2 rounded-full opacity-25 blur-3xl"
        style={{ background: `radial-gradient(circle, rgba(${ACCENT}, 0.5), transparent 70%)` }}
      />

      <div className="relative flex flex-col items-center gap-2">
        <AnimatedTitle
          text="ACCOUNT"
          intensity={0.4}
          accent={ACCENT}
          className="text-3xl font-semibold tracking-[0.15em] text-white/90 sm:text-4xl"
        />
        <p className="max-w-md text-sm text-white/40">
          Your profile and progress on zyme. {auth.uid ? "Synced to your account." : "Saved on this device."}
        </p>
      </div>

      <div className="relative flex w-full flex-col items-center gap-8">
        <Section title="Profile">
          <div className="flex items-center gap-5 py-4 text-left">
            <div className="relative shrink-0">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                aria-label="Change profile picture"
                className="h-20 w-20 overflow-hidden rounded-full border border-white/15 bg-white/5 text-lg font-medium text-white/60 transition-colors hover:border-white/30"
              >
                {account.pictureUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={account.pictureUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  <span className="flex h-full w-full items-center justify-center">{usernameInitials(username)}</span>
                )}
              </button>
              {account.pictureUrl && (
                <button
                  type="button"
                  onClick={() => clearProfilePicture()}
                  aria-label="Remove profile picture"
                  className="absolute -right-1 -top-1 flex h-6 w-6 items-center justify-center rounded-full border border-white/15 bg-[#0a120e] text-xs text-white/50 hover:text-white/90"
                >
                  ✕
                </button>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => handlePictureChange(e.target.files?.[0])}
              />
            </div>
            <div className="flex flex-col gap-1">
              <p className="text-sm font-medium text-white/85">Profile picture</p>
              <p className="text-xs text-white/40">Click the circle to upload one.</p>
              {pictureError && <p className="text-xs text-red-300/80">{pictureError}</p>}
            </div>
          </div>

          <Row title="Username">
            <input
              value={username}
              onChange={(e) => {
                setDraftUsername(e.target.value);
                scheduleSave({ username: e.target.value });
              }}
              onBlur={() => saveNow({ username })}
              placeholder="Anonymous"
              maxLength={40}
              className="w-full rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-left text-sm text-white/85 outline-none placeholder:text-white/25 focus:border-white/25 sm:w-48 sm:text-right"
            />
          </Row>

          <div className="flex flex-col gap-3 py-4 text-left sm:flex-row sm:items-start sm:justify-between sm:gap-6">
            <div>
              <p className="text-sm font-medium text-white/85">Bio</p>
              <p className="mt-0.5 max-w-xs text-xs text-white/40">A short line about you.</p>
            </div>
            <textarea
              value={bio}
              onChange={(e) => {
                setDraftBio(e.target.value);
                scheduleSave({ bio: e.target.value });
              }}
              onBlur={() => saveNow({ bio })}
              placeholder="Say something…"
              maxLength={280}
              rows={2}
              className="w-full resize-none rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-left text-sm text-white/85 outline-none placeholder:text-white/25 focus:border-white/25 sm:w-56 sm:text-right"
            />
          </div>

          <Row title="Homepage text" description="Replaces the animated title on your landing page and its nav button.">
            <input
              value={wordmark}
              onChange={(e) => {
                setDraftWordmark(e.target.value);
                scheduleSave({ wordmark: e.target.value });
              }}
              onBlur={() => saveNow({ wordmark })}
              placeholder={DEFAULT_WORDMARK}
              maxLength={WORDMARK_MAX_LENGTH}
              className="w-full rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-left text-sm text-white/85 outline-none placeholder:text-white/25 focus:border-white/25 sm:w-48 sm:text-right"
            />
          </Row>
        </Section>

        <Section title="Progress">
          <div className="flex flex-col gap-3 py-4 text-left">
            <div className="flex items-baseline justify-between">
              <p className="text-sm font-medium text-white/85">Level {level}</p>
              <p className="text-xs text-white/40">
                {xpIntoLevel} / {xpForNextLevel} XP · {xp} total
              </p>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full transition-[width] duration-500"
                style={{ width: `${Math.round(progress * 100)}%`, backgroundColor: `rgb(${ACCENT})` }}
              />
            </div>
            <p className="text-xs text-white/35">
              Earn XP by exploring the site, posting, viewing media, playing Microbyte, tuning your settings, and
              catching the fleeing particle on the homepage.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-x-4 gap-y-3 py-4 sm:grid-cols-3">
            {STAT_LABELS.map(({ key, label }) => (
              <div key={key} className="flex flex-col">
                <span className="text-lg font-semibold text-white/85">{account.stats[key]}</span>
                <span className="text-xs text-white/40">{label}</span>
              </div>
            ))}
          </div>
        </Section>

        <AuthPanel />
      </div>
    </div>
  );
}
