"use client";

import { AnimatePresence, LayoutGroup, motion } from "framer-motion";
import { type MouseEvent, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { awardMediaUploadXp, awardMediaViewXp } from "@/lib/account";
import { getAuthSnapshot, getServerAuthSnapshot, isOwnerUid, subscribeAuth } from "@/lib/auth";
import {
  addGlobalMedia,
  deleteGlobalMedia,
  type GlobalMediaItem,
  getGlobalMediaSnapshot,
  getServerGlobalMediaSnapshot,
  subscribeGlobalMedia,
  updateGlobalCaption,
} from "@/lib/globalMedia";
import {
  addMedia,
  deleteMedia,
  getMediaSnapshot,
  getServerMediaSnapshot,
  type MediaItem,
  subscribeMedia,
  updateCaption,
} from "@/lib/media";
import AnimatedTitle from "@/components/common/AnimatedTitle";
import MediaEditor from "@/components/media/MediaEditor";
import MediaOrb from "@/components/media/MediaOrb";
import MediaViewer from "@/components/media/MediaViewer";
import SocialLinks from "@/components/media/SocialLinks";
import { useSceneTransition } from "@/components/scene/scene-context";

const ACCENT = "240, 176, 42";
const NEW_MEDIA_LAYOUT_ID = "new-media-button";

// Local items are private to this browser (unchanged); global items come
// from the creator's live Firestore feed and are visible to everyone.
export type FeedMediaItem = (MediaItem | GlobalMediaItem) & { source: "local" | "global" };

type Overlay = { type: "new" } | { type: "edit"; item: FeedMediaItem } | { type: "view"; item: FeedMediaItem };

export default function MediaContent() {
  const localItems = useSyncExternalStore(subscribeMedia, getMediaSnapshot, getServerMediaSnapshot);
  const globalItems = useSyncExternalStore(subscribeGlobalMedia, getGlobalMediaSnapshot, getServerGlobalMediaSnapshot);
  const auth = useSyncExternalStore(subscribeAuth, getAuthSnapshot, getServerAuthSnapshot);
  const isOwner = isOwnerUid(auth.uid);
  const [overlay, setOverlay] = useState<Overlay | null>(null);
  const { burstAt, setUtilityVisible } = useSceneTransition();

  // The Utility button floats above everything, so it overlaps a full-screen
  // media viewer/editor unless it's hidden while one's open - restored on
  // close, and on unmount in case this page goes away mid-overlay (e.g. a
  // dive triggered some other way).
  useEffect(() => {
    setUtilityVisible(overlay === null);
    return () => setUtilityVisible(true);
  }, [overlay, setUtilityVisible]);

  const items = useMemo<FeedMediaItem[]>(() => {
    const merged: FeedMediaItem[] = [
      ...localItems.map((i): FeedMediaItem => ({ ...i, source: "local" })),
      ...globalItems.map((i): FeedMediaItem => ({ ...i, source: "global" })),
    ];
    return merged.sort((a, b) => b.createdAt - a.createdAt);
  }, [localItems, globalItems]);

  const handleNew = (e: MouseEvent<HTMLButtonElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    burstAt(rect.left + rect.width / 2, rect.top + rect.height / 2);
    setOverlay({ type: "new" });
  };

  // Signed in as the creator -> this browser's uploads ARE the live feed.
  // Otherwise, unchanged local-only behavior.
  const handleCreate = async (file: File, caption: string) => {
    if (isOwner) await addGlobalMedia(file, caption);
    else await addMedia(file, caption);
    awardMediaUploadXp();
    setOverlay(null);
  };

  const handleSave = (item: FeedMediaItem) => async (caption: string) => {
    if (item.source === "global") await updateGlobalCaption(item.id, caption);
    else await updateCaption(item.id, caption);
    setOverlay(null);
  };

  const handleDelete = (item: FeedMediaItem) => async () => {
    if (item.source === "global") await deleteGlobalMedia(item.id);
    else await deleteMedia(item.id);
    setOverlay(null);
  };

  // A local item is always yours to edit. A global item is only yours to
  // edit if you're signed in as the creator who owns the whole feed -
  // everyone else just gets to view it.
  const canEdit = (item: FeedMediaItem) => item.source === "local" || isOwner;

  return (
    <LayoutGroup>
      <div className="spatial-page flex flex-col px-6 py-16 short-landscape:py-10">
        <div className="flex flex-col items-center gap-2 text-center">
          <AnimatedTitle
            text="MEDIA"
            intensity={0.4}
            accent={ACCENT}
            className="text-3xl font-semibold tracking-[0.15em] text-white/90 sm:text-4xl"
          />
          <p className="text-sm text-white/40">Snapshots drift here — click one to open it.</p>
        </div>

        <div className="relative mt-4 min-h-[65vh] flex-1 short-landscape:min-h-[420px]">
          {items.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center">
              <p className="max-w-xs text-center text-sm text-white/30">
                Nothing here yet. Click the <span className="text-white/50">+</span> to add a photo or video.
              </p>
            </div>
          )}

          {items.map((item, index) => {
            const hidden = (overlay?.type === "edit" || overlay?.type === "view") && overlay.item.id === item.id;
            if (hidden) return null;
            return (
              <MediaOrb
                key={item.id}
                item={item}
                index={index}
                total={items.length}
                onOpen={() => {
                  awardMediaViewXp(item.id);
                  setOverlay({ type: "view", item });
                }}
              />
            );
          })}
        </div>
      </div>

      <SocialLinks />

      {(!overlay || overlay.type !== "new") && (
        <motion.button
          layoutId={NEW_MEDIA_LAYOUT_ID}
          onClick={handleNew}
          data-particle-target
          data-accent={ACCENT}
          aria-label="Add a photo or video"
          initial={{ opacity: 0, scale: 0.6 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ type: "spring", stiffness: 260, damping: 20 }}
          className="animate-breathe fixed bottom-8 right-8 z-20 flex h-16 w-16 items-center justify-center rounded-full border border-white/15 bg-white/5 text-3xl font-light text-white/80 backdrop-blur-md transition-transform duration-300 hover:scale-110 hover:text-white"
          style={{ "--orb-glow": `rgba(${ACCENT}, 0.4)` } as React.CSSProperties}
        >
          <span
            className="pointer-events-none absolute inset-0 rounded-full opacity-60 blur-xl"
            style={{ background: `radial-gradient(circle, rgba(${ACCENT}, 0.4), transparent 70%)` }}
          />
          <span className="relative -mt-0.5">+</span>
        </motion.button>
      )}

      <AnimatePresence>
        {overlay?.type === "new" && (
          <MediaEditor
            key="new"
            mode="new"
            layoutId={NEW_MEDIA_LAYOUT_ID}
            onCancel={() => setOverlay(null)}
            onSubmit={handleCreate}
          />
        )}
        {overlay?.type === "edit" && (
          <MediaEditor
            key={overlay.item.id}
            mode="edit"
            item={overlay.item}
            layoutId={`media-${overlay.item.id}`}
            onCancel={() => setOverlay({ type: "view", item: overlay.item })}
            onSubmit={handleSave(overlay.item)}
          />
        )}
        {overlay?.type === "view" && (
          <MediaViewer
            key={overlay.item.id}
            item={overlay.item}
            layoutId={`media-${overlay.item.id}`}
            canEdit={canEdit(overlay.item)}
            onClose={() => setOverlay(null)}
            onEdit={() => setOverlay({ type: "edit", item: overlay.item })}
            onDelete={handleDelete(overlay.item)}
          />
        )}
      </AnimatePresence>
    </LayoutGroup>
  );
}
