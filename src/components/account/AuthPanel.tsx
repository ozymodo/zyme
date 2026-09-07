"use client";

import { useState, useSyncExternalStore } from "react";
import {
  getAuthSnapshot,
  getServerAuthSnapshot,
  isOwnerUid,
  signInWithEmail,
  signInWithGoogle,
  signOutUser,
  signUpWithEmail,
  subscribeAuth,
} from "@/lib/auth";
import { firebaseEnabled } from "@/lib/firebase";
import { Row, Section } from "@/components/common/Panel";

const ACCENT = "205, 150, 235";

// General sign-in/sign-up for any visitor - email/password or Google. Once
// signed in, the Account page's profile/progress sync to Firestore under
// that uid (see account.ts) instead of staying local to this device. The
// one account whose uid matches NEXT_PUBLIC_OWNER_UID additionally gets to
// post to the shared Blog/Media feed - firestore.rules/storage.rules (not
// this component) are what actually enforce that.
export default function AuthPanel() {
  const auth = useSyncExternalStore(subscribeAuth, getAuthSnapshot, getServerAuthSnapshot);
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (!firebaseEnabled) return null;

  const handleSubmit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      if (mode === "signup") {
        await signUpWithEmail(email, password);
      } else {
        await signInWithEmail(email, password);
      }
      setPassword("");
    } catch {
      setError(
        mode === "signup"
          ? "Couldn't create that account - check the email and password."
          : "That didn't work - check the email and password.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleGoogle = async () => {
    setSubmitting(true);
    setError(null);
    try {
      await signInWithGoogle();
    } catch {
      setError("Google sign-in didn't go through.");
    } finally {
      setSubmitting(false);
    }
  };

  const isOwner = isOwnerUid(auth.uid);

  return (
    <Section title="Account">
      {auth.uid ? (
        <div className="flex flex-col gap-3 py-4 text-left">
          <Row title="Signed in" description={auth.email ?? undefined}>
            <button
              type="button"
              onClick={() => signOutUser()}
              className="rounded-full border border-white/10 px-4 py-1.5 text-sm text-white/70 transition-colors hover:border-white/25 hover:text-white"
            >
              Sign out
            </button>
          </Row>
          {isOwner && (
            <p className="text-xs text-white/35">You&apos;re the creator account - posts and media you add on Blog and Media now go live to everyone.</p>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-3 py-4 text-left">
          <button
            type="button"
            onClick={handleGoogle}
            disabled={submitting}
            className="rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-center text-sm text-white/85 transition-colors hover:border-white/25 hover:text-white disabled:cursor-not-allowed disabled:opacity-30"
          >
            Continue with Google
          </button>

          <div className="flex items-center gap-3 py-1 text-[10px] tracking-widest text-white/25">
            <div className="h-px flex-1 bg-white/10" />
            or
            <div className="h-px flex-1 bg-white/10" />
          </div>

          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email"
            type="email"
            autoComplete="username"
            className="w-full rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-sm text-white/85 outline-none placeholder:text-white/25 focus:border-white/25"
          />
          <input
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSubmit();
            }}
            placeholder="Password"
            type="password"
            autoComplete={mode === "signup" ? "new-password" : "current-password"}
            className="w-full rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-sm text-white/85 outline-none placeholder:text-white/25 focus:border-white/25"
          />
          {error && <p className="text-xs text-red-300/80">{error}</p>}

          <div className="flex items-center justify-between gap-4">
            <button
              type="button"
              onClick={handleSubmit}
              disabled={submitting || !email || !password}
              className="self-start rounded-full border px-5 py-1.5 text-sm font-medium tracking-wide transition hover:brightness-125 disabled:cursor-not-allowed disabled:opacity-30"
              style={{
                borderColor: `rgba(${ACCENT}, 0.35)`,
                backgroundColor: `rgba(${ACCENT}, 0.12)`,
                color: `rgb(${ACCENT})`,
              }}
            >
              {submitting ? (mode === "signup" ? "Creating…" : "Signing in…") : mode === "signup" ? "Create account" : "Sign in"}
            </button>
            <button
              type="button"
              onClick={() => {
                setMode(mode === "signup" ? "signin" : "signup");
                setError(null);
              }}
              className="text-xs text-white/40 transition-colors hover:text-white/70"
            >
              {mode === "signup" ? "Have an account? Sign in" : "New here? Create one"}
            </button>
          </div>
        </div>
      )}
    </Section>
  );
}
