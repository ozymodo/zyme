"use client";

import { AnimatePresence, LayoutGroup, motion } from "framer-motion";
import { type MouseEvent, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { awardBlogPostXp } from "@/lib/account";
import {
  type BlogPost,
  deletePost,
  getPostsSnapshot,
  getServerPostsSnapshot,
  savePost,
  subscribePosts,
} from "@/lib/blog";
import { getAuthSnapshot, getServerAuthSnapshot, isOwnerUid, subscribeAuth } from "@/lib/auth";
import {
  deleteGlobalPost,
  type GlobalBlogPost,
  getGlobalPostsSnapshot,
  getServerGlobalPostsSnapshot,
  saveGlobalPost,
  subscribeGlobalPosts,
} from "@/lib/globalBlog";
import AnimatedTitle from "@/components/common/AnimatedTitle";
import PostEditor from "@/components/blog/PostEditor";
import PostOrb from "@/components/blog/PostOrb";
import PostViewer from "@/components/blog/PostViewer";
import XLink from "@/components/blog/XLink";
import { useSceneTransition } from "@/components/scene/scene-context";

const ACCENT = "40, 128, 255";
const NEW_POST_LAYOUT_ID = "new-post-button";

// Local posts are private to this browser (unchanged); global posts come
// from the creator's live Firestore feed and are visible to everyone. They
// share the same shape apart from `source`, so the rest of the tree (orbs,
// viewer, editor) doesn't need to know which kind it's holding.
export type FeedPost = (BlogPost | GlobalBlogPost) & { source: "local" | "global" };

type Overlay = { type: "new" } | { type: "edit"; post: FeedPost } | { type: "view"; post: FeedPost };

export default function BlogContent() {
  const localPosts = useSyncExternalStore(subscribePosts, getPostsSnapshot, getServerPostsSnapshot);
  const globalPosts = useSyncExternalStore(subscribeGlobalPosts, getGlobalPostsSnapshot, getServerGlobalPostsSnapshot);
  const auth = useSyncExternalStore(subscribeAuth, getAuthSnapshot, getServerAuthSnapshot);
  const isOwner = isOwnerUid(auth.uid);
  const [overlay, setOverlay] = useState<Overlay | null>(null);
  const { burstAt, setUtilityVisible } = useSceneTransition();

  // The Utility button floats above everything, so it overlaps a full-screen
  // post viewer/editor unless it's hidden while one's open - restored on
  // close, and on unmount in case this page goes away mid-overlay (e.g. a
  // dive triggered some other way).
  useEffect(() => {
    setUtilityVisible(overlay === null);
    return () => setUtilityVisible(true);
  }, [overlay, setUtilityVisible]);

  const posts = useMemo<FeedPost[]>(() => {
    const merged: FeedPost[] = [
      ...localPosts.map((p): FeedPost => ({ ...p, source: "local" })),
      ...globalPosts.map((p): FeedPost => ({ ...p, source: "global" })),
    ];
    return merged.sort((a, b) => b.createdAt - a.createdAt);
  }, [localPosts, globalPosts]);

  const handleNew = (e: MouseEvent<HTMLButtonElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    burstAt(rect.left + rect.width / 2, rect.top + rect.height / 2);
    setOverlay({ type: "new" });
  };

  // Signed in as the creator -> this browser's posts ARE the live feed.
  // Otherwise, unchanged local-only behavior.
  const handleCreate = async (title: string, body: string) => {
    if (isOwner) await saveGlobalPost({ title, body });
    else savePost({ title, body });
    awardBlogPostXp();
    setOverlay(null);
  };

  const handleUpdate = (post: FeedPost) => async (title: string, body: string) => {
    if (post.source === "global") await saveGlobalPost({ id: post.id, title, body });
    else savePost({ id: post.id, title, body });
    setOverlay(null);
  };

  const handleDelete = (post: FeedPost) => async () => {
    if (post.source === "global") await deleteGlobalPost(post.id);
    else deletePost(post.id);
    setOverlay(null);
  };

  // A local post is always yours to edit. A global post is only yours to
  // edit if you're signed in as the creator who owns the whole feed -
  // everyone else just gets to read it.
  const canEdit = (post: FeedPost) => post.source === "local" || isOwner;

  return (
    <LayoutGroup>
      <div className="spatial-page flex flex-col px-6 py-16 short-landscape:py-10">
        <div className="flex flex-col items-center gap-2 text-center">
          <AnimatedTitle
            text="BLOG"
            intensity={0.4}
            accent={ACCENT}
            className="text-3xl font-semibold tracking-[0.15em] text-white/90 sm:text-4xl"
          />
          <p className="text-sm text-white/40">Posts drift here — click one to open it.</p>
        </div>

        <div
          className={`relative mt-4 min-h-[65vh] flex-1 transition-opacity duration-300 short-landscape:min-h-[420px] ${
            overlay ? "pointer-events-none opacity-0" : "opacity-100"
          }`}
        >
          {posts.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center">
              <p className="max-w-xs text-center text-sm text-white/30">
                No posts yet. Click the <span className="text-white/50">+</span> to plant one.
              </p>
            </div>
          )}

          {posts.map((post, index) => {
            const hidden = (overlay?.type === "edit" || overlay?.type === "view") && overlay.post.id === post.id;
            if (hidden) return null;
            return (
              <PostOrb
                key={post.id}
                post={post}
                index={index}
                total={posts.length}
                onOpen={() => setOverlay({ type: "view", post })}
              />
            );
          })}
        </div>
      </div>

      <XLink />

      {(!overlay || overlay.type !== "new") && (
        <motion.button
          layoutId={NEW_POST_LAYOUT_ID}
          onClick={handleNew}
          data-particle-target
          data-accent={ACCENT}
          aria-label="Write a new post"
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
          <PostEditor key="new" mode="new" layoutId={NEW_POST_LAYOUT_ID} onCancel={() => setOverlay(null)} onSubmit={handleCreate} />
        )}
        {overlay?.type === "edit" && (
          <PostEditor
            key={overlay.post.id}
            mode="edit"
            post={overlay.post}
            layoutId={`post-${overlay.post.id}`}
            onCancel={() => setOverlay({ type: "view", post: overlay.post })}
            onSubmit={handleUpdate(overlay.post)}
          />
        )}
        {overlay?.type === "view" && (
          <PostViewer
            key={overlay.post.id}
            post={overlay.post}
            layoutId={`post-${overlay.post.id}`}
            canEdit={canEdit(overlay.post)}
            onClose={() => setOverlay(null)}
            onEdit={() => setOverlay({ type: "edit", post: overlay.post })}
            onDelete={handleDelete(overlay.post)}
          />
        )}
      </AnimatePresence>
    </LayoutGroup>
  );
}
