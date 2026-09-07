"use client";

import { LayoutGroup } from "framer-motion";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import * as THREE from "three";
import FreeroamJoystick from "@/components/scene/FreeroamJoystick";
import HomeButton from "@/components/scene/HomeButton";
import { shuffleDefaultWordmark } from "@/lib/wordmark";
import UtilityButton from "@/components/scene/UtilityButton";
import { SceneContext, type SceneContextValue } from "@/components/scene/scene-context";
import {
  awardGateXp,
  awardNavigationXp,
  awardClickXp,
  awardParticleCatchXp,
  getAccountSnapshot,
  getServerAccountSnapshot,
  levelProgress,
  recordNodeCreated,
  subscribeAccount,
} from "@/lib/account";
import {
  colorToUnitRgb,
  getServerSettingsSnapshot,
  getSettingsSnapshot,
  subscribeSettings,
  type ParticleDensity,
} from "@/lib/settings";

const CURSOR_REACH = 170;
const TARGET_REACH = 230;
const TARGET_LINK_REACH = 140;

const SPREAD_X = 700;
const SPREAD_Y = 420;
const SPREAD_Z = 320;

// Generous pool: a page dive bursts a few hundred at once (the "dissolve"),
// so a small pool would just mean the burst eats its own tail.
const SPAWN_POOL = 700;
const DIVE_BURST_COUNT = 170;
const ENTITY_BURST_COUNT = 28;

// Burst particles ease in, hold, then ease back out over their lifetime
// instead of snapping on/off — and peak below full brightness, so a burst
// reads as subtle and translucent like the rest of the field rather than a
// flash. Ambient and click-spawned particles (expiresAt left at Infinity)
// are untouched by this and stay at full, permanent brightness.
const BURST_FADE_IN = 0.5;
const BURST_FADE_OUT = 2.2;
const BURST_PEAK_ACTIVE = 0.42;

// The site's one green: the fallback accent for anything without its own
// `data-accent`, and the same value Games/Microbyte/Discord/Freeroam and
// the Settings "Forest" preset use - one green everywhere rather than a
// vivid one for Games and a paler one for everything else.
const DEFAULT_ACCENT = "48, 210, 120";

// Resting camera depth per top-level route. Clicking a nav element flies the
// camera from its current depth to the target route's depth "through" the
// clicked element; direct loads / back-forward just settle there.
const ROUTE_DEPTH: Record<string, number> = {
  "/": 420,
  "/games": 70,
  "/blog": 70,
  "/media": 70,
};
const DEFAULT_DEPTH = 200;

function depthForPath(pathname: string) {
  if (ROUTE_DEPTH[pathname] !== undefined) return ROUTE_DEPTH[pathname];
  const base = "/" + (pathname.split("/")[1] ?? "");
  return ROUTE_DEPTH[base] ?? DEFAULT_DEPTH;
}

// Each section's interior carries its button's own hue blended into the
// particle field's node color, so the field picks up a little of "the
// button that was pressed" the deeper you go. Branded routes keep this fixed
// regardless of the user's Settings > Node color choice; neutral routes
// (home, settings, account, ...) get no blend at all (mix 0), so Node color
// shows through unmixed there.
const ROUTE_ACCENT: Record<string, { color: [number, number, number]; mix: number }> = {
  "/games": { color: [52 / 255, 199 / 255, 110 / 255], mix: 0.4 },
  "/blog": { color: [56 / 255, 145 / 255, 255 / 255], mix: 0.4 },
  "/media": { color: [214 / 255, 168 / 255, 68 / 255], mix: 0.4 },
};
const HOME_ACCENT = { color: [0, 0, 0] as [number, number, number], mix: 0 };

function accentForPath(pathname: string) {
  const base = "/" + (pathname.split("/")[1] ?? "");
  return ROUTE_ACCENT[base] ?? HOME_ACCENT;
}

const DENSITY_MULTIPLIER: Record<ParticleDensity, number> = { off: 0, low: 0.45, standard: 1, high: 1.85 };

// Freeroam: WASD/mouse-look flight through the same particle field, entered
// from the Games page's Freeroam button and exited with Escape.
const FREEROAM_BASE_SPEED = 90; // units/sec
const FREEROAM_SPRINT_MULT = 2.6;
const FREEROAM_DASH_SPEED = 480; // units/sec, at full strength
const FREEROAM_DASH_DURATION = 0.35; // seconds the dash impulse decays over
const FREEROAM_DASH_COOLDOWN = 0.7; // seconds before another dash can trigger
const FREEROAM_ACCEL_RATE = 6; // 1/sec - how quickly velocity chases the input direction
const FREEROAM_LOOK_SENSITIVITY = 0.0022; // radians per pixel of mouse movement
const FREEROAM_TOUCH_LOOK_SENSITIVITY = 0.0032; // radians per pixel of finger drag - a bit hotter than the mouse, since a drag covers less screen than a mouse's unbounded movementX
const FREEROAM_TAP_MOVE_THRESHOLD = 12; // px - a look-drag shorter than this on release counts as a tap (drop a node) instead
const FREEROAM_PITCH_LIMIT = Math.PI / 2 - 0.05;
const FREEROAM_FADE_S = 0.4; // page dissolve/reassemble duration
const FREEROAM_RETURN_DURATION = 1.1; // camera flight back to the resting view on exit
const FREEROAM_SPAWN_DISTANCE = 70; // world units in front of the camera a click spawns a node
const FREEROAM_AIM_THRESHOLD = 50; // screen px - how precisely you must aim to lock onto something

// Enter locks onto whatever's aimed at and rockets the camera toward it
// instead of teleporting there instantly - speed ramps up fast for a "zoom"
// feel, and the camera itself turns to face the target as it closes in.
const FREEROAM_ZOOM_MIN_SPEED = 150; // units/sec at the moment of lock-on
const FREEROAM_ZOOM_MAX_SPEED = 1500; // units/sec once fully ramped up
const FREEROAM_ZOOM_RAMP_S = 0.5; // seconds to reach max speed
const FREEROAM_ZOOM_ARRIVAL = 20; // world units - close enough to call it "arrived"
const FREEROAM_ZOOM_TIMEOUT = 3; // seconds - safety net if the target can't be reached
const FREEROAM_ZOOM_FOV_KICK = 16; // extra fov while zooming, same "warp" language as a dive

// One gate at a time: fly through it to earn XP, and it relocates somewhere
// new in the field, so finding the next one takes actually looking around.
const GATE_COLOR = "255, 198, 55";
const GATE_RADIUS = 28;
const GATE_TUBE = 4;
const GATE_TRIGGER_RADIUS = 34; // world units - how close the camera must get to count as "through"
const GATE_REACH = 320; // screen px - how far out its crosshair line reaches
const GATE_COOLDOWN = 2; // seconds - just a debounce against double-counting one pass
const GATE_MIN_RESPAWN_DISTANCE = 260; // world units - respawns at least this far from wherever it was scored

// Homepage mini-game: a small bright "prey" particle that flees the cursor -
// catching it bursts like the site's other particle events and awards XP.
// Screen-space (2D, drawn on the line canvas), not part of the 3D ambient
// field, so it only ever needs simple px-distance math. Only active on "/",
// where there's open space for it and it won't compete with a page's actual
// content.
const PREY_CORE_RADIUS = 7; // px - visual core size
const PREY_CATCH_RADIUS = 28; // px - generous hit test, so landing it reads as rewarding, not fiddly
const PREY_FLEE_REACH = 170; // px - cursor proximity that triggers fleeing
const PREY_FLEE_ACCEL = 1100; // px/sec^2 while fleeing
const PREY_MAX_SPEED = 460; // px/sec
const PREY_DRAG = 2.2; // 1/sec - velocity decay so it settles instead of coasting forever
const PREY_EDGE_MARGIN = 28; // px - the sides/bottom of the "home" zone it spawns into and returns to
const PREY_TOP_MARGIN = 130; // px - taller top margin so it doesn't spawn under the hero wordmark
// It is free to be chased clear out of the frame; it just isn't allowed to
// wander off forever. Off-screen it keeps flying under the exact same
// physics (no teleporting, no snapping to an edge), bounces off a hard
// bound not far past the viewport, and after a short beat turns around and
// comes back in.
const PREY_OFFSCREEN_LIMIT = 300; // px past the viewport edge - the hard wall it can never cross
const PREY_RETURN_DELAY_MIN = 1; // seconds fully out of frame before it heads back
const PREY_RETURN_DELAY_MAX = 2; // seconds
const PREY_RETURN_ACCEL = 1400; // px/sec^2 - a decisive turnaround, not a lazy drift back
const PREY_RETURN_MAX_SPEED = 700; // px/sec - allowed to outrun its normal top speed on the way in
const PREY_SPAWN_MIN_DELAY = 4; // seconds after a catch (or mount) before the next one appears
const PREY_SPAWN_MAX_DELAY = 9; // seconds
const PREY_BURST_COUNT = 90; // bigger than a normal entity burst (28) - a proper little explosion
const PREY_ENTRY_SPEED = 260; // px/sec - the dash it flies in from off-screen with
const PREY_ENTRY_OFFSCREEN_MARGIN = 140; // px beyond whichever edge it starts from, well clear of the visible canvas

// A colorful, varied-brightness sparkle layer drawn on top of the shared 3D
// burst specifically for a catch, so landing one reads as the biggest,
// most rewarding burst on the site rather than just another dive/entity
// dissolve. Plain 2D canvas particles (not the shared GPU buffer), so each
// one can freely get its own color/size/alpha instead of the one shared
// node-color tint.
const CATCH_SPARK_COUNT = 40;
const CATCH_SPARK_PALETTE = [
  "255, 205, 50", // gold
  "255, 80, 170", // pink
  "80, 215, 255", // cyan
  "160, 105, 255", // violet
  "100, 255, 150", // mint
  "255, 135, 60", // orange
];

// A background-relative contrast color for the prey's core, so it reads
// clearly no matter what the user picked for Settings > Background color -
// the one thing it's guaranteed to be sitting on top of.
function contrastToBackground(backgroundColor: string): string {
  const [r, g, b] = backgroundColor.split(",").map((n) => parseInt(n.trim(), 10) || 0);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.5 ? "10, 10, 10" : "255, 255, 255";
}

// Settings > Node color is one flat color; the particles need a dim ambient
// tone and a brighter "lit up near the cursor" tone, so the highlight is the
// color as-is and the base is a dimmed version of it - same ~0.55 ratio the
// original hardcoded base/highlight pair used.
function nodeColors(nodeColor: string) {
  const highlight = new THREE.Color(...colorToUnitRgb(nodeColor));
  const base = highlight.clone().multiplyScalar(0.55);
  return { base, highlight };
}

function easeInOutCubic(x: number) {
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
}

function smoothstep(edge0: number, edge1: number, x: number) {
  const t = Math.min(Math.max((x - edge0) / (edge1 - edge0), 0), 1);
  return t * t * (3 - 2 * t);
}

// Decides whether freeroam's on-screen touch controls (joystick + exit
// button) render - a coarse (touch) primary pointer, rather than checking
// screen size, so a touch laptop or tablet with a mouse attached still gets
// the mouse/keyboard scheme it actually has.
const COARSE_POINTER_QUERY = "(pointer: coarse)";
function subscribeCoarsePointer(callback: () => void) {
  const mql = window.matchMedia(COARSE_POINTER_QUERY);
  mql.addEventListener("change", callback);
  return () => mql.removeEventListener("change", callback);
}
function getCoarsePointerSnapshot() {
  return window.matchMedia(COARSE_POINTER_QUERY).matches;
}
function getServerCoarsePointerSnapshot() {
  return false;
}

const VERTEX_SHADER = /* glsl */ `
  attribute float aPhase;
  attribute float aSpeed;
  attribute float aSize;
  attribute float aActive;
  attribute float aBirth;
  attribute float aHighlight;
  uniform float uTime;
  varying float vAlpha;
  varying float vHighlight;
  void main() {
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    float breathe = 0.55 + 0.45 * sin(uTime * aSpeed + aPhase);
    float age = max(uTime - aBirth, 0.0);
    float pop = 1.0 + 0.9 * exp(-age * 3.0);
    float flash = 0.7 * exp(-age * 2.0);
    gl_PointSize = aSize * breathe * pop * aActive * (220.0 / -mvPosition.z);
    vAlpha = (0.22 + 0.38 * breathe + flash) * aActive;
    vHighlight = aHighlight;
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const FRAGMENT_SHADER = /* glsl */ `
  uniform vec3 uBaseColor;
  uniform vec3 uHighlightColor;
  uniform vec3 uAccent;
  uniform float uAccentMix;
  varying float vAlpha;
  varying float vHighlight;
  void main() {
    vec2 uv = gl_PointCoord - vec2(0.5);
    float d = length(uv);
    if (d > 0.5) discard;
    float edge = smoothstep(0.5, 0.0, d);
    vec3 base = mix(uBaseColor, uHighlightColor, clamp(vHighlight, 0.0, 1.0));
    vec3 color = mix(base, uAccent, uAccentMix * (0.7 + 0.3 * vHighlight));
    float alpha = edge * vAlpha * (1.0 + 0.6 * vHighlight);
    gl_FragColor = vec4(color, alpha);
  }
`;

export default function SceneProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();

  const mountRef = useRef<HTMLDivElement>(null);
  const lineCanvasRef = useRef<HTMLCanvasElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const mouse = useRef<{ x: number; y: number } | null>(null);
  const pathnameRef = useRef(pathname);

  const diveToImplRef = useRef<(href: string, el?: HTMLElement | null) => void>(() => {});
  const diveTo = useCallback((href: string, originEl?: HTMLElement | null) => {
    diveToImplRef.current(href, originEl);
  }, []);
  const burstAtImplRef = useRef<(x: number, y: number, count?: number) => void>(() => {});
  const burstAt = useCallback((x: number, y: number, count?: number) => {
    burstAtImplRef.current(x, y, count);
  }, []);
  const emitDustImplRef = useRef<(x: number, y: number, count?: number) => void>(() => {});
  const emitDust = useCallback((x: number, y: number, count?: number) => {
    emitDustImplRef.current(x, y, count);
  }, []);
  const enterFreeroamImplRef = useRef<() => void>(() => {});
  const enterFreeroam = useCallback(() => {
    enterFreeroamImplRef.current();
  }, []);
  const exitFreeroamImplRef = useRef<() => void>(() => {});
  // Read imperatively from the tick loop, same reasoning as `mouse` above -
  // the joystick writes to it on every touchmove without needing a re-render.
  const freeroamMove = useRef({ x: 0, z: 0 });
  const getPointer = useCallback(() => mouse.current, []);
  const [utilityVisible, setUtilityVisible] = useState(true);
  const contextValue = useMemo<SceneContextValue>(
    () => ({ diveTo, burstAt, getPointer, emitDust, enterFreeroam, setUtilityVisible }),
    [diveTo, burstAt, getPointer, emitDust, enterFreeroam, setUtilityVisible],
  );

  // Drives the freeroam HUD (crosshair + hint text), which lives outside the
  // page-content wrapper that the imperative dissolve/reassemble fade below
  // controls, so it needs its own bit of reactive state.
  const [freeroamActive, setFreeroamActive] = useState(false);
  const isCoarsePointer = useSyncExternalStore(
    subscribeCoarsePointer,
    getCoarsePointerSnapshot,
    getServerCoarsePointerSnapshot,
  );

  // The freeroam XP readout reads the same account store every other XP
  // source (posting, media, Microbyte, ...) writes to, so it's always the
  // real total behind the player's account level, not a separate counter.
  const account = useSyncExternalStore(subscribeAccount, getAccountSnapshot, getServerAccountSnapshot);
  const { level, xp } = levelProgress(account.xp);

  // Reactive (unlike the other settings, read imperatively per-frame below)
  // because changing the ambient particle count means rebuilding the
  // geometry buffers, which only happens by re-running the mount effect.
  const particleDensity = useSyncExternalStore(
    subscribeSettings,
    () => getSettingsSnapshot().particleDensity,
    () => getServerSettingsSnapshot().particleDensity,
  );

  useEffect(() => {
    pathnameRef.current = pathname;
    awardNavigationXp();
  }, [pathname]);

  // Settings > Shuffle each visit: opening any page other than the homepage
  // draws a new random word, so the home button you land next to already
  // spells it and tapping it carries that word back to the hero title -
  // then the next page you open rolls the next one. Skipped on the first
  // render (the load's own random pick is the first word) and on arriving
  // at "/", so the word you were just handed is the one you actually see.
  const shuffledForPath = useRef(pathname);
  useEffect(() => {
    if (shuffledForPath.current === pathname) return;
    shuffledForPath.current = pathname;
    if (pathname === "/") return;
    if (getSettingsSnapshot().shuffleWordmark) shuffleDefaultWordmark();
  }, [pathname]);

  useEffect(() => {
    const mount = mountRef.current;
    const lineCanvas = lineCanvasRef.current;
    if (!mount || !lineCanvas) return;
    const lineCtx = lineCanvas.getContext("2d");
    if (!lineCtx) return;

    let width = window.innerWidth;
    let height = window.innerHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(60, width / height, 1, 2000);
    camera.position.set(0, 0, depthForPath(pathnameRef.current));

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch (err) {
      console.error(
        "[SceneProvider] WebGL is unavailable in this browser/context, so the particle field can't render.",
        err,
      );
      return;
    }
    renderer.setPixelRatio(dpr);
    renderer.setSize(width, height);
    mount.appendChild(renderer.domElement);

    const BASE_COUNT = Math.round(
      Math.min(220, Math.max(90, Math.floor((width * height) / 9000))) * DENSITY_MULTIPLIER[particleDensity],
    );
    const TOTAL = BASE_COUNT + SPAWN_POOL;

    const positions = new Float32Array(TOTAL * 3);
    const velocities = new Float32Array(TOTAL * 3);
    const phases = new Float32Array(TOTAL);
    const speeds = new Float32Array(TOTAL);
    const sizes = new Float32Array(TOTAL);
    const actives = new Float32Array(TOTAL);
    const births = new Float32Array(TOTAL);
    const highlights = new Float32Array(TOTAL);
    // Burst particles (dive dissolves, entity bursts) fade back out after a
    // few seconds so a session's worth of transitions doesn't permanently
    // densify the field; click-spawned ones keep the prior "lasts forever"
    // behavior (Infinity).
    const expiresAt = new Float32Array(TOTAL).fill(Infinity);

    for (let i = 0; i < BASE_COUNT; i++) {
      positions[i * 3] = (Math.random() * 2 - 1) * SPREAD_X;
      positions[i * 3 + 1] = (Math.random() * 2 - 1) * SPREAD_Y;
      positions[i * 3 + 2] = (Math.random() * 2 - 1) * SPREAD_Z;
      velocities[i * 3] = (Math.random() - 0.5) * 0.15;
      velocities[i * 3 + 1] = (Math.random() - 0.5) * 0.15;
      velocities[i * 3 + 2] = (Math.random() - 0.5) * 0.15;
      phases[i] = Math.random() * Math.PI * 2;
      speeds[i] = 0.5 + Math.random() * 1;
      sizes[i] = 40 + Math.random() * 60;
      actives[i] = 1;
      births[i] = -1000;
    }
    for (let i = BASE_COUNT; i < TOTAL; i++) {
      actives[i] = 0;
      births[i] = -1000;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("aPhase", new THREE.BufferAttribute(phases, 1));
    geometry.setAttribute("aSpeed", new THREE.BufferAttribute(speeds, 1));
    geometry.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1));
    geometry.setAttribute("aActive", new THREE.BufferAttribute(actives, 1));
    geometry.setAttribute("aBirth", new THREE.BufferAttribute(births, 1));
    geometry.setAttribute("aHighlight", new THREE.BufferAttribute(highlights, 1));

    const initialNodeColors = nodeColors(getSettingsSnapshot().nodeColor);
    const material = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uBaseColor: { value: initialNodeColors.base },
        uHighlightColor: { value: initialNodeColors.highlight },
        uAccent: { value: new THREE.Color(...accentForPath(pathnameRef.current).color) },
        uAccentMix: { value: accentForPath(pathnameRef.current).mix },
      },
      vertexShader: VERTEX_SHADER,
      fragmentShader: FRAGMENT_SHADER,
      transparent: true,
      depthWrite: false,
    });

    const points = new THREE.Points(geometry, material);
    scene.add(points);

    // The gate: one at a time, only visible/active during freeroam (toggled
    // in enter/exit below) - a MeshBasicMaterial reads as an unlit glowing
    // ring, matching the rest of this scene's no-lighting-setup look.
    type Gate = { mesh: THREE.Mesh; wasInside: boolean; lastActivatedAt: number; phase: number };
    const gateGeometry = new THREE.TorusGeometry(GATE_RADIUS, GATE_TUBE, 12, 32);
    const gateMaterial = new THREE.MeshBasicMaterial({
      color: new THREE.Color(...colorToUnitRgb(GATE_COLOR)),
      transparent: true,
      opacity: 0.85,
      side: THREE.DoubleSide,
    });
    const gateMesh = new THREE.Mesh(gateGeometry, gateMaterial);
    gateMesh.visible = false;
    scene.add(gateMesh);
    const gate: Gate = { mesh: gateMesh, wasInside: false, lastActivatedAt: -Infinity, phase: 0 };

    // Random, but kept a healthy distance from wherever the camera currently
    // is - otherwise an unlucky roll could respawn it right on top of you.
    const randomGatePosition = (avoid: THREE.Vector3) => {
      const candidate = new THREE.Vector3();
      let attempts = 0;
      do {
        candidate.set(
          (Math.random() * 2 - 1) * SPREAD_X * 0.75,
          (Math.random() * 2 - 1) * SPREAD_Y * 0.75,
          (Math.random() * 2 - 1) * SPREAD_Z * 0.75,
        );
        attempts++;
      } while (candidate.distanceTo(avoid) < GATE_MIN_RESPAWN_DISTANCE && attempts < 8);
      return candidate;
    };
    gate.mesh.position.copy(randomGatePosition(camera.position));

    let currentAccentMix = accentForPath(pathnameRef.current).mix;
    // The cursor's own color (its molecule, the lines it draws, its dust
    // trail) - a flat user preference (Settings > Cursor color), independent
    // of route.
    let currentCursorColor = getSettingsSnapshot().cursorColor;

    const timer = new THREE.Timer();
    const targetCam = { x: 0, y: 0 };
    const raycaster = new THREE.Raycaster();
    let nextSpawnSlot = 0;

    // Projects a screen point onto the particle field's z=0 plane, in the
    // points object's local space — shared by single clicks and bursts.
    const screenToLocal = (clientX: number, clientY: number) => {
      const ndcX = (clientX / width) * 2 - 1;
      const ndcY = -(clientY / height) * 2 + 1;
      raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), camera);
      const { origin, direction } = raycaster.ray;
      if (Math.abs(direction.z) < 1e-6) return null;
      const t = -origin.z / direction.z;
      const world = origin.clone().addScaledVector(direction, t);
      return points.worldToLocal(world);
    };

    const markDirty = () => {
      geometry.attributes.position.needsUpdate = true;
      (geometry.attributes.aPhase as THREE.BufferAttribute).needsUpdate = true;
      (geometry.attributes.aSpeed as THREE.BufferAttribute).needsUpdate = true;
      (geometry.attributes.aSize as THREE.BufferAttribute).needsUpdate = true;
      (geometry.attributes.aBirth as THREE.BufferAttribute).needsUpdate = true;
      (geometry.attributes.aActive as THREE.BufferAttribute).needsUpdate = true;
    };

    // Shared by a normal click (screen point raycast to the field's z=0
    // plane) and a freeroam click (a fixed distance along wherever the
    // camera is currently looking) - both just need a local-space point to
    // drop a new node at.
    const spawnParticleAtLocal = (local: THREE.Vector3) => {
      const idx = BASE_COUNT + nextSpawnSlot;
      nextSpawnSlot = (nextSpawnSlot + 1) % SPAWN_POOL;

      positions[idx * 3] = local.x;
      positions[idx * 3 + 1] = local.y;
      positions[idx * 3 + 2] = local.z;
      velocities[idx * 3] = (Math.random() - 0.5) * 0.3;
      velocities[idx * 3 + 1] = (Math.random() - 0.5) * 0.3;
      velocities[idx * 3 + 2] = (Math.random() - 0.5) * 0.3;
      phases[idx] = Math.random() * Math.PI * 2;
      speeds[idx] = 0.5 + Math.random();
      sizes[idx] = 55 + Math.random() * 55;
      births[idx] = timer.getElapsed();
      actives[idx] = 1;
      expiresAt[idx] = Infinity;

      markDirty();
    };

    const spawnParticle = (clientX: number, clientY: number) => {
      const local = screenToLocal(clientX, clientY);
      if (!local) return;
      spawnParticleAtLocal(local);
    };

    // A scatter of many particles at once from one screen point — the
    // "dissolve" beat for page dives, and shared with other entities (an
    // opened post, an uploaded photo) via burstAt so the whole site reads
    // as built from the same drifting field.
    const burstParticles = (clientX: number, clientY: number, count: number) => {
      const local = screenToLocal(clientX, clientY);
      if (!local) return;

      for (let n = 0; n < count; n++) {
        const idx = BASE_COUNT + nextSpawnSlot;
        nextSpawnSlot = (nextSpawnSlot + 1) % SPAWN_POOL;

        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos(Math.random() * 2 - 1);
        const speed = 0.5 + Math.random() * 1.8;

        positions[idx * 3] = local.x + (Math.random() - 0.5) * 4;
        positions[idx * 3 + 1] = local.y + (Math.random() - 0.5) * 4;
        positions[idx * 3 + 2] = local.z + (Math.random() - 0.5) * 4;
        velocities[idx * 3] = Math.sin(phi) * Math.cos(theta) * speed;
        velocities[idx * 3 + 1] = Math.sin(phi) * Math.sin(theta) * speed;
        velocities[idx * 3 + 2] = Math.cos(phi) * speed * 0.6;
        phases[idx] = Math.random() * Math.PI * 2;
        speeds[idx] = 1 + Math.random() * 1.5;
        sizes[idx] = 14 + Math.random() * 28;
        births[idx] = timer.getElapsed();
        actives[idx] = 0;
        expiresAt[idx] = timer.getElapsed() + BURST_FADE_IN + 3 + Math.random() * 2 + BURST_FADE_OUT;
      }

      markDirty();
    };

    type Dive = {
      startTime: number;
      duration: number;
      fromZ: number;
      toZ: number;
      href: string;
      pushed: boolean;
      originClientX: number;
      originClientY: number;
      arrivalBurstFired: boolean;
    };
    type Settle = { startTime: number; duration: number; fromZ: number; toZ: number };

    let dive: Dive | null = null;
    let settle: Settle | null = null;
    let pendingDiveTarget: string | null = null;
    let diveAim: { x: number; y: number } | null = null;
    let lastPath = pathnameRef.current;

    // Freeroam: WASD/mouse-look flight with the camera let loose in the same
    // particle field, entered via the scene context and exited with Escape.
    type FreeroamState = {
      active: boolean;
      yaw: number;
      pitch: number;
      velocity: THREE.Vector3;
      dashDir: THREE.Vector3;
      dashTimeLeft: number;
      lastDashAt: number;
      enteredAt: number;
    };
    const freeroam: FreeroamState = {
      active: false,
      yaw: 0,
      pitch: 0,
      velocity: new THREE.Vector3(),
      dashDir: new THREE.Vector3(0, 0, -1),
      dashTimeLeft: 0,
      lastDashAt: -Infinity,
      enteredAt: 0,
    };
    type FreeroamReturn = { start: number; fromPos: THREE.Vector3; fromYaw: number; fromPitch: number; toZ: number };
    let freeroamReturn: FreeroamReturn | null = null;
    const keysDown = new Set<string>();

    // Touch look: the one non-joystick finger drags the camera around,
    // tracked by its own pointerId so a second finger on the joystick
    // doesn't get mistaken for it. Released without much movement, it
    // counts as a tap (drop a node at the crosshair) instead of a look.
    let lookTouchId: number | null = null;
    let lookTouchPos: { x: number; y: number } | null = null;
    let lookTouchStart: { x: number; y: number } | null = null;
    let lookTouchMoved = false;
    const resetLookTouch = () => {
      lookTouchId = null;
      lookTouchPos = null;
      lookTouchStart = null;
      lookTouchMoved = false;
    };

    // Homepage mini-game state - see the PREY_* constants above. `entering`
    // is true only during its initial dash in from off-screen - once that
    // lands it inside the safe zone, normal flee/bounce behavior takes over
    // and it stays on-screen until caught.
    // `offscreenSince`/`returnDelay`/`returnTarget` drive the out-of-frame
    // excursion: it keeps its real position and velocity the whole time it's
    // outside the viewport, and only once it's been gone longer than
    // `returnDelay` does it start thrusting back toward `returnTarget`.
    type Prey = {
      x: number;
      y: number;
      vx: number;
      vy: number;
      entering: boolean;
      offscreenSince: number | null;
      returnDelay: number;
      returnTarget: { x: number; y: number } | null;
    };
    let prey: Prey | null = null;
    let nextPreySpawnAt = PREY_SPAWN_MIN_DELAY + Math.random() * (PREY_SPAWN_MAX_DELAY - PREY_SPAWN_MIN_DELAY);

    // A random point inside the home zone - where it dashes to on arrival,
    // and where it aims when coming back in from off-screen.
    const preyHomePoint = () => ({
      x: PREY_EDGE_MARGIN + Math.random() * Math.max(1, width - PREY_EDGE_MARGIN * 2),
      y: PREY_TOP_MARGIN + Math.random() * Math.max(1, height - PREY_TOP_MARGIN - PREY_EDGE_MARGIN),
    });

    const randomReturnDelay = () => PREY_RETURN_DELAY_MIN + Math.random() * (PREY_RETURN_DELAY_MAX - PREY_RETURN_DELAY_MIN);

    const spawnPrey = () => {
      const { x: targetX, y: targetY } = preyHomePoint();

      // Starts just off one random edge of the screen and dashes toward a
      // point inside the safe zone, so it reads as arriving from outside
      // the frame instead of blinking into existence mid-screen.
      const edge = Math.floor(Math.random() * 4);
      let startX: number;
      let startY: number;
      if (edge === 0) {
        startX = Math.random() * width;
        startY = -PREY_ENTRY_OFFSCREEN_MARGIN;
      } else if (edge === 1) {
        startX = width + PREY_ENTRY_OFFSCREEN_MARGIN;
        startY = Math.random() * height;
      } else if (edge === 2) {
        startX = Math.random() * width;
        startY = height + PREY_ENTRY_OFFSCREEN_MARGIN;
      } else {
        startX = -PREY_ENTRY_OFFSCREEN_MARGIN;
        startY = Math.random() * height;
      }

      const dx = targetX - startX;
      const dy = targetY - startY;
      const dist = Math.hypot(dx, dy) || 1;
      prey = {
        x: startX,
        y: startY,
        vx: (dx / dist) * PREY_ENTRY_SPEED,
        vy: (dy / dist) * PREY_ENTRY_SPEED,
        entering: true,
        offscreenSince: null,
        returnDelay: randomReturnDelay(),
        returnTarget: null,
      };
    };

    // Colorful sparkle layer for a catch - see CATCH_SPARK_* above. Plain
    // radial scatter (matching the 3D burst's own dispersal) rather than
    // gravity/confetti-fall, so it reads as part of the same "explosion of
    // molecules" language, just brighter and more varied.
    type CatchSpark = { x: number; y: number; vx: number; vy: number; color: string; size: number; born: number; life: number; peakAlpha: number };
    const catchSparks: CatchSpark[] = [];

    const spawnCatchSparks = (x: number, y: number) => {
      for (let i = 0; i < CATCH_SPARK_COUNT; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 60 + Math.random() * 220;
        catchSparks.push({
          x,
          y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          color: CATCH_SPARK_PALETTE[Math.floor(Math.random() * CATCH_SPARK_PALETTE.length)],
          size: 1.5 + Math.random() * 3,
          born: timer.getElapsed(),
          life: 0.6 + Math.random() * 0.7,
          // Each spark gets its own peak brightness/transparency, so the
          // burst reads as a scatter of distinct sparks rather than one
          // uniform flash.
          peakAlpha: 0.35 + Math.random() * 0.65,
        });
      }
    };

    // Bursts like any other entity event (a page dive, an opened post) and
    // pays out XP - the respawn delay set here is the mini-game's whole
    // pacing, so no separate per-catch cooldown is needed beyond the small
    // backstop in awardParticleCatchXp itself.
    const catchPrey = (x: number, y: number) => {
      burstParticles(x, y, PREY_BURST_COUNT);
      spawnCatchSparks(x, y);
      awardParticleCatchXp();
      prey = null;
      nextPreySpawnAt = timer.getElapsed() + PREY_SPAWN_MIN_DELAY + Math.random() * (PREY_SPAWN_MAX_DELAY - PREY_SPAWN_MIN_DELAY);
    };

    const drawPrey = (p: Prey, t: number, coreColor: string) => {
      const pulse = 0.85 + 0.15 * Math.sin(t * 3.2);
      // A shimmering, constantly-shifting aura - the part that keeps this
      // from ever visually blending into a static user color choice,
      // whatever it happens to be.
      const hue = (t * 70) % 360;
      const auraColor = `hsl(${hue.toFixed(0)}, 90%, 65%)`;
      const auraSize = (PREY_CORE_RADIUS + 10) * pulse;

      const glow = lineCtx.createRadialGradient(p.x, p.y, 0, p.x, p.y, auraSize * 2.2);
      glow.addColorStop(0, auraColor);
      glow.addColorStop(1, "transparent");
      lineCtx.globalAlpha = 0.5;
      lineCtx.fillStyle = glow;
      lineCtx.beginPath();
      lineCtx.arc(p.x, p.y, auraSize * 2.2, 0, Math.PI * 2);
      lineCtx.fill();
      lineCtx.globalAlpha = 1;

      // A couple of tiny orbiting motes - same "alive" language as the
      // cursor's own molecule.
      for (let k = 0; k < 2; k++) {
        const angle = t * 2.4 + k * Math.PI;
        const ox = p.x + Math.cos(angle) * (PREY_CORE_RADIUS + 6);
        const oy = p.y + Math.sin(angle) * (PREY_CORE_RADIUS + 6) * 0.6;
        lineCtx.beginPath();
        lineCtx.fillStyle = auraColor;
        lineCtx.arc(ox, oy, 2.2, 0, Math.PI * 2);
        lineCtx.fill();
      }

      // Solid, background-contrasting core on top - always readable.
      lineCtx.beginPath();
      lineCtx.fillStyle = `rgb(${coreColor})`;
      lineCtx.arc(p.x, p.y, PREY_CORE_RADIUS * pulse, 0, Math.PI * 2);
      lineCtx.fill();
    };

    // The particle or gate (if any) currently near enough to the crosshair
    // to lock onto - recomputed every frame in the tick loop below, consumed
    // when Enter is pressed. Particles carry their buffer index so the zoom
    // can keep homing on their live (drifting) position rather than a stale
    // snapshot; the gate is static between respawns so its snapshot is fine.
    type AimCandidate = { position: THREE.Vector3; screenDist: number; kind: "particle" | "gate"; particleIndex?: number };
    let aimCandidate: AimCandidate | null = null;
    const aimedParticleWorld = new THREE.Vector3();

    // The rapid lock-on flight Enter kicks off - active until it arrives (or
    // times out), during which normal WASD/mouse-look input is ignored.
    type FreeroamZoom = {
      kind: "particle" | "gate";
      particleIndex?: number;
      fallbackPosition: THREE.Vector3;
      start: number;
    };
    let freeroamZoom: FreeroamZoom | null = null;
    const zoomTargetTmp = new THREE.Vector3();

    const freeroamForward = () => {
      const euler = new THREE.Euler(freeroam.pitch, freeroam.yaw, 0, "YXZ");
      return new THREE.Vector3(0, 0, -1).applyEuler(euler);
    };

    const enterFreeroam = () => {
      if (freeroam.active || dive) return;
      freeroam.active = true;
      freeroam.yaw = 0;
      freeroam.pitch = 0;
      freeroam.velocity.set(0, 0, 0);
      freeroam.dashTimeLeft = 0;
      freeroam.enteredAt = timer.getElapsed();
      freeroamReturn = null;
      aimCandidate = null;
      freeroamZoom = null;
      keysDown.clear();
      resetLookTouch();
      freeroamMove.current = { x: 0, z: 0 };
      // Clears any highlight left over from the cursor at the moment freeroam
      // took over, since the normal per-frame highlight pass is skipped
      // while active and would otherwise leave a few particles stuck bright.
      highlights.fill(0);
      (geometry.attributes.aHighlight as THREE.BufferAttribute).needsUpdate = true;
      gate.mesh.visible = true;
      setFreeroamActive(true);
      try {
        const lock = renderer.domElement.requestPointerLock() as unknown as Promise<void> | undefined;
        lock?.catch(() => {});
      } catch {
        // Pointer lock isn't available here - flight still works, just without captured mouse-look.
      }
    };

    const exitFreeroam = () => {
      if (!freeroam.active) return;
      freeroam.active = false;
      // If a zoom was mid-flight, freeroam.yaw/pitch are stale (the zoom
      // drives the camera via lookAt, not those fields) - resync from the
      // camera's actual current facing so the return flight starts from
      // where you're really looking, not where you were before locking on.
      if (freeroamZoom) {
        const finalEuler = new THREE.Euler().setFromQuaternion(camera.quaternion, "YXZ");
        freeroam.yaw = finalEuler.y;
        freeroam.pitch = finalEuler.x;
      }
      // The zoom can leave fov kicked up past 60 - nothing else along the
      // return flight resets it.
      camera.fov = 60;
      camera.updateProjectionMatrix();
      freeroamReturn = {
        start: timer.getElapsed(),
        fromPos: camera.position.clone(),
        fromYaw: freeroam.yaw,
        fromPitch: freeroam.pitch,
        toZ: depthForPath(pathnameRef.current),
      };
      aimCandidate = null;
      freeroamZoom = null;
      keysDown.clear();
      resetLookTouch();
      freeroamMove.current = { x: 0, z: 0 };
      gate.mesh.visible = false;
      setFreeroamActive(false);
      if (document.pointerLockElement) document.exitPointerLock();
    };
    enterFreeroamImplRef.current = enterFreeroam;
    exitFreeroamImplRef.current = exitFreeroam;

    // Enter locks onto whatever's under the crosshair and starts the rapid
    // zoom-in flight (handled per-frame in the tick loop); a plain click
    // (see onPointerDown below) always drops a new node instead.
    const lockOnToAimCandidate = () => {
      if (!aimCandidate || freeroamZoom) return;
      freeroamZoom = {
        kind: aimCandidate.kind,
        particleIndex: aimCandidate.particleIndex,
        fallbackPosition: aimCandidate.position.clone(),
        start: timer.getElapsed(),
      };
    };

    // Hands control back at wherever the zoom's own lookAt left the camera
    // facing (baked into freeroam.yaw/pitch so normal mouse-look picks up
    // from there instead of snapping) - shared by a normal arrival/timeout
    // and by the gate relocating out from under an in-flight zoom.
    const endFreeroamZoom = () => {
      const finalEuler = new THREE.Euler().setFromQuaternion(camera.quaternion, "YXZ");
      freeroam.yaw = finalEuler.y;
      freeroam.pitch = finalEuler.x;
      freeroam.velocity.set(0, 0, 0);
      camera.fov = 60;
      camera.updateProjectionMatrix();
      freeroamZoom = null;
    };

    const spawnNodeAtCrosshair = () => {
      const worldPos = camera.position.clone().addScaledVector(freeroamForward(), FREEROAM_SPAWN_DISTANCE);
      spawnParticleAtLocal(points.worldToLocal(worldPos));
      recordNodeCreated();
    };

    // Cursor wake: tiny motes that drift, slowly rise, and fade — like dust
    // disturbed by something moving through it, not a smoke trail. Faster
    // movement stirs up more of them.
    type TrailDot = {
      x: number;
      y: number;
      vx: number;
      vy: number;
      born: number;
      life: number;
      baseSize: number;
      growth: number;
      peakAlpha: number;
      phase: number;
    };
    const trail: TrailDot[] = [];
    let lastTrailMouse: { x: number; y: number } | null = null;

    // querySelectorAll + getBoundingClientRect force a layout read; doing
    // that every frame was the single biggest cost in this loop. Targets
    // (nav orbs, the home button) barely move, so a periodic refresh reads
    // as instant while cutting that cost by ~15x.
    type Target = { x: number; y: number; accent: string };
    let cachedTargets: Target[] = [];
    let lastTargetsRefresh = -Infinity;
    const TARGETS_REFRESH_INTERVAL = 0.25;

    // Lets other elements (a hovered letter) borrow the exact same subtle
    // motes as the cursor's own trail, instead of a separate effect. Settings
    // > Cursor trail gates this the same as the cursor's own wake below.
    const emitDust = (x: number, y: number, count: number) => {
      if (!getSettingsSnapshot().trailEffect) return;
      for (let n = 0; n < count; n++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 3 + Math.random() * 8;
        trail.push({
          x: x + (Math.random() - 0.5) * 6,
          y: y + (Math.random() - 0.5) * 6,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed - 4,
          born: timer.getElapsed(),
          life: 0.7 + Math.random() * 0.5,
          baseSize: 0.6 + Math.random() * 0.6,
          growth: 1 + Math.random() * 1.5,
          peakAlpha: 0.14 + Math.random() * 0.1,
          phase: Math.random() * Math.PI * 2,
        });
      }
      if (trail.length > 90) trail.splice(0, trail.length - 90);
    };
    emitDustImplRef.current = (x: number, y: number, count = 2) => emitDust(x, y, count);

    diveToImplRef.current = (href: string, originEl?: HTMLElement | null) => {
      if (dive || freeroam.active) return;
      let ndcX = targetCam.x;
      let ndcY = targetCam.y;
      let clientX = width / 2;
      let clientY = height / 2;
      if (originEl) {
        const rect = originEl.getBoundingClientRect();
        clientX = rect.left + rect.width / 2;
        clientY = rect.top + rect.height / 2;
        ndcX = (clientX / width - 0.5) * 2;
        ndcY = (clientY / height - 0.5) * 2;
      }
      diveAim = { x: ndcX, y: ndcY };
      pendingDiveTarget = href;
      const reducedMotion = getSettingsSnapshot().reducedMotion;
      dive = {
        startTime: timer.getElapsed(),
        duration: reducedMotion ? 0.35 : 1.6,
        fromZ: camera.position.z,
        toZ: depthForPath(href),
        href,
        pushed: false,
        originClientX: clientX,
        originClientY: clientY,
        arrivalBurstFired: false,
      };
      // The page you're leaving dissolves into this burst.
      burstParticles(clientX, clientY, reducedMotion ? Math.round(DIVE_BURST_COUNT * 0.3) : DIVE_BURST_COUNT);
    };

    burstAtImplRef.current = (x: number, y: number, count = ENTITY_BURST_COUNT) => {
      burstParticles(x, y, count);
    };

    const applyLookDelta = (dx: number, dy: number, sensitivity: number) => {
      freeroam.yaw -= dx * sensitivity;
      freeroam.pitch -= dy * sensitivity;
      freeroam.pitch = Math.max(-FREEROAM_PITCH_LIMIT, Math.min(FREEROAM_PITCH_LIMIT, freeroam.pitch));
    };

    const onPointerMove = (e: PointerEvent) => {
      mouse.current = { x: e.clientX, y: e.clientY };
      if (!dive) {
        targetCam.x = (e.clientX / width - 0.5) * 2;
        targetCam.y = (e.clientY / height - 0.5) * 2;
      }
      if (!freeroam.active) return;
      if (e.pointerType === "touch") {
        if (e.pointerId !== lookTouchId || !lookTouchPos) return;
        const dx = e.clientX - lookTouchPos.x;
        const dy = e.clientY - lookTouchPos.y;
        applyLookDelta(dx, dy, FREEROAM_TOUCH_LOOK_SENSITIVITY);
        lookTouchPos = { x: e.clientX, y: e.clientY };
        if (lookTouchStart) {
          const traveled = Math.hypot(e.clientX - lookTouchStart.x, e.clientY - lookTouchStart.y);
          if (traveled > FREEROAM_TAP_MOVE_THRESHOLD) lookTouchMoved = true;
        }
      } else {
        applyLookDelta(e.movementX, e.movementY, FREEROAM_LOOK_SENSITIVITY);
      }
    };
    const onPointerLeave = () => {
      mouse.current = null;
    };
    const onPointerDown = (e: PointerEvent) => {
      if (freeroam.active) {
        if (e.pointerType === "touch") {
          // The joystick calls stopPropagation on its own pointer events, so
          // any touch reaching here started somewhere else on screen - the
          // one finger available for looking/tapping.
          if (lookTouchId === null) {
            lookTouchId = e.pointerId;
            lookTouchPos = { x: e.clientX, y: e.clientY };
            lookTouchStart = { x: e.clientX, y: e.clientY };
            lookTouchMoved = false;
          }
          return;
        }
        spawnNodeAtCrosshair();
        return;
      }
      if (prey && pathnameRef.current === "/") {
        const dx = e.clientX - prey.x;
        const dy = e.clientY - prey.y;
        if (Math.hypot(dx, dy) < PREY_CATCH_RADIUS) {
          catchPrey(prey.x, prey.y);
          return;
        }
      }
      spawnParticle(e.clientX, e.clientY);
      recordNodeCreated();
    };
    const onPointerUp = (e: PointerEvent) => {
      if (e.pointerId !== lookTouchId) return;
      // A short tap (barely moved) drops a node, same as a click would -
      // a drag that actually turned the camera doesn't also spawn one.
      if (freeroam.active && !lookTouchMoved) spawnNodeAtCrosshair();
      resetLookTouch();
    };
    const onPointerCancel = (e: PointerEvent) => {
      if (e.pointerId !== lookTouchId) return;
      resetLookTouch();
    };
    // Every tap/click on the site earns XP, wherever it lands - a link, a
    // button, an overlay, the empty scene. Registered separately from
    // onPointerDown below (which is the scene's own click handling, and
    // returns early down several paths) and in the capture phase, so a
    // handler that calls stopPropagation - the freeroam joystick does -
    // can't swallow the tap before it counts.
    const onAnyPointerDown = () => {
      awardClickXp();
    };
    window.addEventListener("pointerdown", onAnyPointerDown, { capture: true });

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerleave", onPointerLeave);
    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerCancel);

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && freeroam.active) {
        e.preventDefault();
        exitFreeroam();
        return;
      }
      if (!freeroam.active) return;
      if (e.code === "Space") {
        e.preventDefault();
        if (!e.repeat && timer.getElapsed() - freeroam.lastDashAt > FREEROAM_DASH_COOLDOWN) {
          freeroam.lastDashAt = timer.getElapsed();
          freeroam.dashTimeLeft = FREEROAM_DASH_DURATION;
          freeroam.dashDir.copy(freeroamForward());
        }
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        if (!e.repeat) lockOnToAimCandidate();
        return;
      }
      keysDown.add(e.key.toLowerCase());
    };
    const onKeyUp = (e: KeyboardEvent) => {
      keysDown.delete(e.key.toLowerCase());
    };
    const onPointerLockChange = () => {
      // Catches the lock being released some other way (the browser's own
      // Escape handling, alt-tab, ...) so freeroam still exits cleanly.
      if (!document.pointerLockElement && freeroam.active) exitFreeroam();
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    document.addEventListener("pointerlockchange", onPointerLockChange);

    const resize = () => {
      width = window.innerWidth;
      height = window.innerHeight;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
      lineCanvas.width = width * dpr;
      lineCanvas.height = height * dpr;
      lineCanvas.style.width = `${width}px`;
      lineCanvas.style.height = `${height}px`;
      lineCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
      lastTargetsRefresh = -Infinity;
    };
    resize();
    window.addEventListener("resize", resize);

    const projected = new THREE.Vector3();
    let rafId = 0;

    // Digital-molecule cursor: a soft pulsing core with a few small, dim
    // satellite orbs drifting around it on tilted, out-of-phase orbits — no
    // ring outlines or bond lines, just glowing bodies, so it reads as a
    // tiny organism drifting through the field rather than a textbook
    // diagram. Each orbit's sine phase doubles as a pseudo-depth: satellites
    // swinging "toward" the viewer render larger, brighter, and on top.
    const MOLECULE_ORBS = [
      { rx: 18, ry: 7, tilt: 0, speed: 0.75, phase: 0 },
      { rx: 15, ry: 6, tilt: (Math.PI * 2) / 3, speed: 0.6, phase: 2.1 },
      { rx: 21, ry: 6, tilt: (Math.PI * 4) / 3, speed: 0.5, phase: 4.2 },
    ];

    const drawCursorMolecule = (cx: number, cy: number, elapsed: number) => {
      lineCtx.save();
      lineCtx.translate(cx, cy);

      const orbs = MOLECULE_ORBS.map((orbit) => {
        const angle = elapsed * orbit.speed + orbit.phase;
        const localX = Math.cos(angle) * orbit.rx;
        const localY = Math.sin(angle) * orbit.ry;
        const x = localX * Math.cos(orbit.tilt) - localY * Math.sin(orbit.tilt);
        const y = localX * Math.sin(orbit.tilt) + localY * Math.cos(orbit.tilt);
        const depth = Math.sin(angle) * 0.5 + 0.5; // 0 = far side, 1 = near side
        return { x, y, depth };
      }).sort((a, b) => a.depth - b.depth);

      const pulse = 0.88 + 0.12 * Math.sin(elapsed * 1.4);

      for (const orb of orbs) {
        const size = (2.2 + orb.depth * 1.4) * pulse;
        const alpha = 0.1 + orb.depth * 0.14;
        const glow = lineCtx.createRadialGradient(orb.x, orb.y, 0, orb.x, orb.y, size * 2.4);
        glow.addColorStop(0, `rgba(${currentCursorColor}, ${alpha.toFixed(3)})`);
        glow.addColorStop(1, `rgba(${currentCursorColor}, 0)`);
        lineCtx.fillStyle = glow;
        lineCtx.beginPath();
        lineCtx.arc(orb.x, orb.y, size * 2.4, 0, Math.PI * 2);
        lineCtx.fill();

        lineCtx.beginPath();
        lineCtx.fillStyle = `rgba(255, 255, 255, ${(0.16 + orb.depth * 0.18).toFixed(3)})`;
        lineCtx.arc(orb.x, orb.y, size, 0, Math.PI * 2);
        lineCtx.fill();
      }

      const coreSize = 7 * pulse;
      const coreGlow = lineCtx.createRadialGradient(0, 0, 0, 0, 0, coreSize * 1.8);
      coreGlow.addColorStop(0, `rgba(${currentCursorColor}, 0.4)`);
      coreGlow.addColorStop(1, `rgba(${currentCursorColor}, 0)`);
      lineCtx.fillStyle = coreGlow;
      lineCtx.beginPath();
      lineCtx.arc(0, 0, coreSize * 1.8, 0, Math.PI * 2);
      lineCtx.fill();

      lineCtx.beginPath();
      lineCtx.fillStyle = "rgba(255, 255, 255, 0.7)";
      lineCtx.arc(0, 0, 2.6, 0, Math.PI * 2);
      lineCtx.fill();

      lineCtx.restore();
    };

    const tick = (timestamp: number) => {
      timer.update(timestamp);
      const t = timer.getElapsed();
      const dt = timer.getDelta();
      material.uniforms.uTime.value = t;
      const { reducedMotion, trailEffect, cursorColor, nodeColor, backgroundColor } = getSettingsSnapshot();

      if (pathnameRef.current !== lastPath) {
        const newPath = pathnameRef.current;
        lastPath = newPath;
        if (dive && pendingDiveTarget === newPath) {
          pendingDiveTarget = null;
        } else {
          dive = null;
          diveAim = null;
          pendingDiveTarget = null;
          settle = { startTime: t, duration: reducedMotion ? 0.2 : 0.9, fromZ: camera.position.z, toZ: depthForPath(newPath) };
        }
      }

      const posAttr = geometry.attributes.position as THREE.BufferAttribute;
      let activeDirty = false;
      for (let i = 0; i < TOTAL; i++) {
        if (i >= BASE_COUNT && expiresAt[i] !== Infinity) {
          const age = t - births[i];
          const remaining = expiresAt[i] - t;
          const fadeIn = smoothstep(0, BURST_FADE_IN, age);
          const fadeOut = smoothstep(0, BURST_FADE_OUT, remaining);
          actives[i] = Math.min(fadeIn, fadeOut) * BURST_PEAK_ACTIVE;
          activeDirty = true;
        }

        let x = positions[i * 3] + velocities[i * 3];
        let y = positions[i * 3 + 1] + velocities[i * 3 + 1];
        let z = positions[i * 3 + 2] + velocities[i * 3 + 2];
        if (x > SPREAD_X) x = -SPREAD_X;
        if (x < -SPREAD_X) x = SPREAD_X;
        if (y > SPREAD_Y) y = -SPREAD_Y;
        if (y < -SPREAD_Y) y = SPREAD_Y;
        if (z > SPREAD_Z) z = -SPREAD_Z;
        if (z < -SPREAD_Z) z = SPREAD_Z;
        positions[i * 3] = x;
        positions[i * 3 + 1] = y;
        positions[i * 3 + 2] = z;
      }
      if (activeDirty) (geometry.attributes.aActive as THREE.BufferAttribute).needsUpdate = true;
      posAttr.needsUpdate = true;

      points.rotation.y = t * (reducedMotion ? 0.006 : 0.025);
      points.rotation.x = reducedMotion ? 0 : Math.sin(t * 0.05) * 0.05;

      const targetAccent = accentForPath(pathnameRef.current);
      const uAccent = material.uniforms.uAccent.value as THREE.Color;
      uAccent.lerp(new THREE.Color(...targetAccent.color), 0.04);
      currentAccentMix += (targetAccent.mix - currentAccentMix) * 0.04;
      material.uniforms.uAccentMix.value = currentAccentMix;
      currentCursorColor = cursorColor;

      const targetNodeColors = nodeColors(nodeColor);
      (material.uniforms.uBaseColor.value as THREE.Color).lerp(targetNodeColors.base, 0.04);
      (material.uniforms.uHighlightColor.value as THREE.Color).lerp(targetNodeColors.highlight, 0.04);

      // Drives the DOM content's fade directly off dive/settle progress
      // instead of a fixed-duration CSS transition, so the page visibly
      // dissolves early in the dive (leaving only the particle burst and
      // camera motion), then reassembles once the new page has mounted.
      let contentOpacity = 1;

      if (freeroamReturn) {
        const progress = Math.min((t - freeroamReturn.start) / FREEROAM_RETURN_DURATION, 1);
        const eased = easeInOutCubic(progress);
        camera.position.lerpVectors(freeroamReturn.fromPos, new THREE.Vector3(0, 0, freeroamReturn.toZ), eased);
        camera.rotation.order = "YXZ";
        camera.rotation.set(freeroamReturn.fromPitch * (1 - eased), freeroamReturn.fromYaw * (1 - eased), 0);
        contentOpacity = Math.min((t - freeroamReturn.start) / FREEROAM_FADE_S, 1);
        if (progress >= 1) freeroamReturn = null;
      } else if (freeroam.active) {
        if (freeroamZoom) {
          // Homes on the particle's live position (it keeps drifting), the
          // gate's current spot, or a frozen fallback if the particle it
          // locked onto happened to expire mid-flight.
          let zoomTarget: THREE.Vector3;
          if (freeroamZoom.kind === "particle" && freeroamZoom.particleIndex !== undefined && actives[freeroamZoom.particleIndex] >= 0.5) {
            const idx = freeroamZoom.particleIndex;
            zoomTarget = zoomTargetTmp.set(positions[idx * 3], positions[idx * 3 + 1], positions[idx * 3 + 2]).applyMatrix4(points.matrixWorld);
          } else if (freeroamZoom.kind === "gate") {
            zoomTarget = gate.mesh.position;
          } else {
            zoomTarget = freeroamZoom.fallbackPosition;
          }

          const toTarget = zoomTarget.clone().sub(camera.position);
          const dist = toTarget.length();
          const elapsed = t - freeroamZoom.start;

          if (dist < FREEROAM_ZOOM_ARRIVAL || elapsed > FREEROAM_ZOOM_TIMEOUT) {
            endFreeroamZoom();
          } else {
            const rampT = Math.min(elapsed / FREEROAM_ZOOM_RAMP_S, 1);
            const speed = FREEROAM_ZOOM_MIN_SPEED + (FREEROAM_ZOOM_MAX_SPEED - FREEROAM_ZOOM_MIN_SPEED) * rampT;
            const step = Math.min(speed * dt, dist);
            camera.position.addScaledVector(toTarget.normalize(), step);
            camera.lookAt(zoomTarget);
            camera.fov = 60 + Math.min(FREEROAM_ZOOM_FOV_KICK, elapsed * 60);
            camera.updateProjectionMatrix();
          }
        } else {
          camera.rotation.order = "YXZ";
          camera.rotation.set(freeroam.pitch, freeroam.yaw, 0);

          const forward = freeroamForward();
          const right = new THREE.Vector3(1, 0, 0).applyEuler(new THREE.Euler(0, freeroam.yaw, 0, "YXZ"));

          let moveX = 0;
          let moveZ = 0;
          if (keysDown.has("w")) moveZ += 1;
          if (keysDown.has("s")) moveZ -= 1;
          if (keysDown.has("d")) moveX += 1;
          if (keysDown.has("a")) moveX -= 1;
          // The joystick reports an analog vector (magnitude 0-1) rather
          // than WASD's on/off - clamp instead of always-normalize, so a
          // gentle push actually moves slower instead of snapping to full
          // speed the moment it's off-center.
          moveX += freeroamMove.current.x;
          moveZ += freeroamMove.current.z;
          const inputLen = Math.hypot(moveX, moveZ);
          if (inputLen > 1) {
            moveX /= inputLen;
            moveZ /= inputLen;
          }

          const sprinting = keysDown.has("shift");
          const targetSpeed = FREEROAM_BASE_SPEED * (sprinting ? FREEROAM_SPRINT_MULT : 1);
          const targetVelocity = new THREE.Vector3()
            .addScaledVector(forward, moveZ * targetSpeed)
            .addScaledVector(right, moveX * targetSpeed);
          freeroam.velocity.lerp(targetVelocity, 1 - Math.exp(-FREEROAM_ACCEL_RATE * dt));
          camera.position.addScaledVector(freeroam.velocity, dt);

          if (freeroam.dashTimeLeft > 0) {
            const dashStrength = freeroam.dashTimeLeft / FREEROAM_DASH_DURATION;
            camera.position.addScaledVector(freeroam.dashDir, FREEROAM_DASH_SPEED * dashStrength * dt);
            freeroam.dashTimeLeft = Math.max(0, freeroam.dashTimeLeft - dt);
          }

          // A loose leash around the particle field, so flying "forward
          // forever" eventually turns you back toward the life of the scene
          // instead of off into empty space.
          const boundX = SPREAD_X * 1.3;
          const boundY = SPREAD_Y * 1.3;
          const boundZ = SPREAD_Z * 1.3;
          camera.position.x = Math.max(-boundX, Math.min(boundX, camera.position.x));
          camera.position.y = Math.max(-boundY, Math.min(boundY, camera.position.y));
          camera.position.z = Math.max(-boundZ, Math.min(boundZ, camera.position.z));
        }

        contentOpacity = Math.max(0, 1 - (t - freeroam.enteredAt) / FREEROAM_FADE_S);
      } else if (dive) {
        const progress = Math.min((t - dive.startTime) / dive.duration, 1);
        const eased = easeInOutCubic(progress);
        camera.position.z = dive.fromZ + (dive.toZ - dive.fromZ) * eased;
        camera.fov = 60 + Math.sin(progress * Math.PI) * 14;
        camera.updateProjectionMatrix();

        if (diveAim) {
          camera.position.x += (diveAim.x * 90 - camera.position.x) * 0.12;
          camera.position.y += (-diveAim.y * 60 - camera.position.y) * 0.12;
        }

        contentOpacity = 1 - smoothstep(0, 0.4, progress) + smoothstep(0.62, 1, progress);

        if (progress >= 0.55 && !dive.pushed) {
          dive.pushed = true;
          router.push(dive.href);
        }
        if (progress >= 0.6 && !dive.arrivalBurstFired) {
          dive.arrivalBurstFired = true;
          // The new page reassembles out of this second burst.
          burstParticles(dive.originClientX, dive.originClientY, Math.round(DIVE_BURST_COUNT * 0.6));
        }
        if (progress >= 1) {
          dive = null;
          diveAim = null;
          camera.fov = 60;
          camera.updateProjectionMatrix();
        }
      } else if (settle) {
        const progress = Math.min((t - settle.startTime) / settle.duration, 1);
        const eased = easeInOutCubic(progress);
        camera.position.z = settle.fromZ + (settle.toZ - settle.fromZ) * eased;
        contentOpacity = smoothstep(0, 1, progress);
        if (progress >= 1) settle = null;
        camera.position.x += (targetCam.x * 70 - camera.position.x) * 0.04;
        camera.position.y += (-targetCam.y * 45 - camera.position.y) * 0.04;
      } else {
        camera.position.x += (targetCam.x * 70 - camera.position.x) * 0.04;
        camera.position.y += (-targetCam.y * 45 - camera.position.y) * 0.04;
      }

      if (!freeroam.active && !freeroamReturn) camera.lookAt(0, 0, 0);
      renderer.render(scene, camera);

      if (contentRef.current) {
        contentRef.current.style.opacity = contentOpacity.toFixed(3);
        contentRef.current.style.pointerEvents = contentOpacity > 0.4 ? "auto" : "none";
        const rx = -targetCam.y * 5;
        const ry = targetCam.x * 5;
        contentRef.current.style.transform = `perspective(1400px) rotateX(${rx}deg) rotateY(${ry}deg)`;
      }

      lineCtx.clearRect(0, 0, width, height);
      // The crosshair stands in for the cursor while freeroaming, so the
      // same reach/line-drawing logic below lights up nearby particles (and,
      // further down, gates) around it instead of a 2D mouse position.
      const crosshair = { x: width / 2, y: height / 2 };
      const m = freeroam.active ? crosshair : freeroamReturn ? null : mouse.current;
      aimCandidate = null;

      // Homepage mini-game: spawn/flee/draw the prey. Skipped entirely
      // during freeroam/dives/settles, where the page itself is dissolved.
      if (pathnameRef.current === "/" && !freeroam.active && !freeroamReturn && !dive && !settle) {
        if (!prey && t > nextPreySpawnAt) spawnPrey();
        if (prey) {
          if (prey.entering) {
            // A straight dash in from off-screen - no flee steering or
            // edge-bounce yet, since both would fight the very entrance
            // being animated. Ends the moment it crosses into the safe
            // zone, at whatever speed it arrived with; the drag below then
            // takes over next frame and settles it into an idle drift.
            prey.x += prey.vx * dt;
            prey.y += prey.vy * dt;
            const insideX = prey.x >= PREY_EDGE_MARGIN && prey.x <= width - PREY_EDGE_MARGIN;
            const insideY = prey.y >= PREY_TOP_MARGIN && prey.y <= height - PREY_EDGE_MARGIN;
            if (insideX && insideY) prey.entering = false;
          } else {
            if (m) {
              const dx = prey.x - m.x;
              const dy = prey.y - m.y;
              const dist = Math.hypot(dx, dy) || 1;
              if (dist < PREY_FLEE_REACH) {
                const strength = 1 - dist / PREY_FLEE_REACH;
                prey.vx += (dx / dist) * PREY_FLEE_ACCEL * strength * dt;
                prey.vy += (dy / dist) * PREY_FLEE_ACCEL * strength * dt;
              }
            }
            // Fully outside the viewport (core included, so it only counts
            // once it's genuinely gone rather than half-clipped at an edge).
            const gone =
              prey.x < -PREY_CORE_RADIUS ||
              prey.x > width + PREY_CORE_RADIUS ||
              prey.y < -PREY_CORE_RADIUS ||
              prey.y > height + PREY_CORE_RADIUS;
            if (gone) {
              if (prey.offscreenSince === null) {
                prey.offscreenSince = t;
                prey.returnDelay = randomReturnDelay();
                prey.returnTarget = preyHomePoint();
              }
            } else {
              prey.offscreenSince = null;
              prey.returnTarget = null;
            }

            // Once it's been out of frame past its delay, it thrusts back
            // toward a point in the home zone - real acceleration applied to
            // the velocity it already had, so it visibly arcs around and
            // comes back rather than reappearing from nowhere.
            const returning = prey.offscreenSince !== null && t - prey.offscreenSince > prey.returnDelay;
            if (returning && prey.returnTarget) {
              const rx = prey.returnTarget.x - prey.x;
              const ry = prey.returnTarget.y - prey.y;
              const rd = Math.hypot(rx, ry) || 1;
              prey.vx += (rx / rd) * PREY_RETURN_ACCEL * dt;
              prey.vy += (ry / rd) * PREY_RETURN_ACCEL * dt;
            }

            const dragFactor = Math.exp(-PREY_DRAG * dt);
            prey.vx *= dragFactor;
            prey.vy *= dragFactor;
            const maxSpeed = returning ? PREY_RETURN_MAX_SPEED : PREY_MAX_SPEED;
            const speed = Math.hypot(prey.vx, prey.vy);
            if (speed > maxSpeed) {
              prey.vx = (prey.vx / speed) * maxSpeed;
              prey.vy = (prey.vy / speed) * maxSpeed;
            }
            prey.x += prey.vx * dt;
            prey.y += prey.vy * dt;

            // The only hard bounds left are well outside the frame - it can
            // be chased off any edge, it just can't disappear into the
            // distance and leave the game with nothing to chase.
            const minX = -PREY_OFFSCREEN_LIMIT;
            const maxX = width + PREY_OFFSCREEN_LIMIT;
            const minY = -PREY_OFFSCREEN_LIMIT;
            const maxY = height + PREY_OFFSCREEN_LIMIT;
            if (prey.x < minX) {
              prey.x = minX;
              prey.vx = Math.abs(prey.vx);
            }
            if (prey.x > maxX) {
              prey.x = maxX;
              prey.vx = -Math.abs(prey.vx);
            }
            if (prey.y < minY) {
              prey.y = minY;
              prey.vy = Math.abs(prey.vy);
            }
            if (prey.y > maxY) {
              prey.y = maxY;
              prey.vy = -Math.abs(prey.vy);
            }
          }

          drawPrey(prey, t, contrastToBackground(backgroundColor));
        }
      }

      // Colorful catch-sparkle layer - updated/drawn regardless of route so
      // a catch made right as the player dives away still finishes its
      // fade instead of being cut off.
      for (let i = catchSparks.length - 1; i >= 0; i--) {
        const spark = catchSparks[i];
        const age = t - spark.born;
        if (age >= spark.life) {
          catchSparks.splice(i, 1);
          continue;
        }
        const drag = Math.exp(-2.6 * dt);
        spark.vx *= drag;
        spark.vy *= drag;
        spark.x += spark.vx * dt;
        spark.y += spark.vy * dt;

        const k = age / spark.life;
        const alpha = spark.peakAlpha * (1 - k) * (1 - k);
        if (alpha <= 0.01) continue;

        lineCtx.beginPath();
        lineCtx.fillStyle = `rgba(${spark.color}, ${alpha.toFixed(3)})`;
        lineCtx.arc(spark.x, spark.y, spark.size, 0, Math.PI * 2);
        lineCtx.fill();
      }

      if (m) {
        if (lastTrailMouse && trailEffect && !freeroam.active) {
          const dx = m.x - lastTrailMouse.x;
          const dy = m.y - lastTrailMouse.y;
          const dist = Math.hypot(dx, dy);
          const speed = dist / Math.max(dt, 1 / 240); // px/sec
          const intensity = Math.min(speed / 2600, 1);
          // Mostly quiet at rest — just the occasional faint stir, like
          // ambient motion in the liquid rather than a cursor marker.
          const spawnCount = intensity > 0.04 ? Math.round(1 + intensity * 2) : Math.random() < 0.12 ? 1 : 0;
          for (let s = 0; s < spawnCount; s++) {
            const along = spawnCount > 1 ? s / (spawnCount - 1) : 1;
            trail.push({
              x: lastTrailMouse.x + dx * along,
              y: lastTrailMouse.y + dy * along,
              vx: dx / Math.max(dt, 1 / 240) * 0.05 + (Math.random() - 0.5) * 5,
              vy: dy / Math.max(dt, 1 / 240) * 0.05 + (Math.random() - 0.5) * 5,
              born: t,
              life: 0.9 + intensity * 0.5 + Math.random() * 0.3,
              baseSize: 0.6 + intensity * 0.8,
              growth: 1.2 + intensity * 1.8,
              peakAlpha: 0.1 + intensity * 0.14,
              phase: Math.random() * Math.PI * 2,
            });
          }
          if (trail.length > 90) trail.splice(0, trail.length - 90);
        }
        lastTrailMouse = { x: m.x, y: m.y };
      } else {
        lastTrailMouse = null;
      }

      if (t - lastTargetsRefresh > TARGETS_REFRESH_INTERVAL) {
        lastTargetsRefresh = t;
        cachedTargets = Array.from(document.querySelectorAll<HTMLElement>("[data-particle-target]")).map((el) => {
          const rect = el.getBoundingClientRect();
          return {
            x: rect.left + rect.width / 2,
            y: rect.top + rect.height / 2,
            accent: el.dataset.accent || DEFAULT_ACCENT,
          };
        });
      }
      // Empty (rather than skipping the refresh above) while freeroam is
      // active/returning, so every line-to-a-target loop below just no-ops
      // without each needing its own guard.
      const targets = freeroam.active || freeroamReturn ? [] : cachedTargets;

      // The cursor draws a line to nearby particles; it draws the same kind
      // of line straight to a nearby target (a hero letter, a nav orb) too,
      // once per target rather than per particle.
      if (m) {
        for (const tg of targets) {
          const dx = tg.x - m.x;
          const dy = tg.y - m.y;
          const dist = Math.hypot(dx, dy);
          if (dist < TARGET_REACH) {
            const proximity = 1 - dist / TARGET_REACH;
            lineCtx.beginPath();
            lineCtx.moveTo(m.x, m.y);
            lineCtx.lineTo(tg.x, tg.y);
            lineCtx.strokeStyle = `rgba(${tg.accent}, ${proximity * 0.5})`;
            lineCtx.lineWidth = 1;
            lineCtx.stroke();
          }
        }
      }

      // Targets link up with each other when close together too — this is
      // what turns a word into a constellation: adjacent hero letters (or
      // the home button's scattered ones) draw lines between themselves,
      // not just out to particles and the cursor.
      for (let a = 0; a < targets.length; a++) {
        for (let b = a + 1; b < targets.length; b++) {
          const ta = targets[a];
          const tb = targets[b];
          const dx = tb.x - ta.x;
          const dy = tb.y - ta.y;
          const dist = Math.hypot(dx, dy);
          if (dist < TARGET_LINK_REACH) {
            const proximity = 1 - dist / TARGET_LINK_REACH;
            lineCtx.beginPath();
            lineCtx.moveTo(ta.x, ta.y);
            lineCtx.lineTo(tb.x, tb.y);
            lineCtx.strokeStyle = `rgba(${ta.accent}, ${proximity * 0.35})`;
            lineCtx.lineWidth = 1;
            lineCtx.stroke();
          }
        }
      }

      for (let i = 0; i < TOTAL; i++) {
        if (actives[i] < 0.5) continue;

        projected.set(positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]);
        projected.applyMatrix4(points.matrixWorld);
        if (freeroam.active) aimedParticleWorld.copy(projected);
        projected.project(camera);
        if (projected.z > 1) continue;

        const sx = (projected.x * 0.5 + 0.5) * width;
        const sy = (1 - (projected.y * 0.5 + 0.5)) * height;

        let highlight = 0;

        if (m) {
          const dx = sx - m.x;
          const dy = sy - m.y;
          const dist = Math.hypot(dx, dy);
          if (dist < CURSOR_REACH) {
            const proximity = 1 - dist / CURSOR_REACH;
            highlight = Math.max(highlight, proximity);
            lineCtx.beginPath();
            lineCtx.moveTo(m.x, m.y);
            lineCtx.lineTo(sx, sy);
            lineCtx.strokeStyle = `rgba(${currentCursorColor}, ${proximity * 0.5})`;
            lineCtx.lineWidth = 1;
            lineCtx.stroke();
          }
          if (freeroam.active && dist < FREEROAM_AIM_THRESHOLD && (!aimCandidate || dist < aimCandidate.screenDist)) {
            aimCandidate = { position: aimedParticleWorld.clone(), screenDist: dist, kind: "particle", particleIndex: i };
          }
        }

        targets.forEach((tg) => {
          const dx = sx - tg.x;
          const dy = sy - tg.y;
          const dist = Math.hypot(dx, dy);
          if (dist < TARGET_REACH) {
            const proximity = 1 - dist / TARGET_REACH;
            highlight = Math.max(highlight, proximity);
            lineCtx.beginPath();
            lineCtx.moveTo(tg.x, tg.y);
            lineCtx.lineTo(sx, sy);
            lineCtx.strokeStyle = `rgba(${tg.accent}, ${proximity * 0.45})`;
            lineCtx.lineWidth = 1;
            lineCtx.stroke();
          }
        });

        highlights[i] = highlight;
      }
      (geometry.attributes.aHighlight as THREE.BufferAttribute).needsUpdate = true;

      if (freeroam.active) {
        const gateMaterial = gate.mesh.material as THREE.MeshBasicMaterial;
        gate.mesh.rotation.z += dt * 0.25;
        const cooldownT = Math.min((t - gate.lastActivatedAt) / GATE_COOLDOWN, 1);
        gateMaterial.opacity = 0.3 + 0.6 * cooldownT;
        gate.mesh.scale.setScalar(1 + 0.12 * Math.sin(t * 2 + gate.phase));

        // Fly-through trigger: an edge-triggered 3D proximity check, not
        // tied to the crosshair, so it counts a pass-through from any
        // approach angle (including arriving via a locked-on zoom).
        const inside = camera.position.distanceTo(gate.mesh.position) < GATE_TRIGGER_RADIUS;
        if (inside && !gate.wasInside && cooldownT >= 1) {
          gate.lastActivatedAt = t;
          awardGateXp();
          // One gate at a time - scoring it sends it off somewhere new, so
          // finding the next one means actually looking around again.
          gate.mesh.position.copy(randomGatePosition(camera.position));
          if (freeroamZoom?.kind === "gate") endFreeroamZoom();
        }
        gate.wasInside = inside;

        // Crosshair line + lock-on aim, same reach-based treatment as a
        // particle target above.
        const gp = gate.mesh.position.clone().project(camera);
        if (gp.z <= 1) {
          const sx = (gp.x * 0.5 + 0.5) * width;
          const sy = (1 - (gp.y * 0.5 + 0.5)) * height;
          const dx = sx - crosshair.x;
          const dy = sy - crosshair.y;
          const dist = Math.hypot(dx, dy);
          if (dist < GATE_REACH) {
            const proximity = 1 - dist / GATE_REACH;
            lineCtx.beginPath();
            lineCtx.moveTo(crosshair.x, crosshair.y);
            lineCtx.lineTo(sx, sy);
            lineCtx.strokeStyle = `rgba(${GATE_COLOR}, ${proximity * 0.6})`;
            lineCtx.lineWidth = 1.5;
            lineCtx.stroke();
          }
          if (dist < FREEROAM_AIM_THRESHOLD && (!aimCandidate || dist < aimCandidate.screenDist)) {
            aimCandidate = { position: gate.mesh.position.clone(), screenDist: dist, kind: "gate" };
          }
        }
      }

      for (let i = trail.length - 1; i >= 0; i--) {
        const dot = trail[i];
        const age = t - dot.born;
        if (age >= dot.life) {
          trail.splice(i, 1);
          continue;
        }

        // Viscous drag, a slow buoyant rise, and a light wobble — it drifts
        // like something suspended in liquid, not a marker snapped to the
        // cursor's path.
        const drag = Math.exp(-2.2 * dt);
        dot.vx = dot.vx * drag + Math.sin(t * 1.6 + dot.phase) * 2 * dt;
        dot.vy = dot.vy * drag - 3 * dt;
        dot.x += dot.vx * dt;
        dot.y += dot.vy * dt;

        const k = age / dot.life;
        const size = dot.baseSize + dot.growth * k;
        const alpha = dot.peakAlpha * (1 - k) * (1 - k);
        if (alpha <= 0.004) continue;

        // A plain small fill reads as a discrete particle; a soft gradient
        // at this alpha just smears into a haze.
        lineCtx.beginPath();
        lineCtx.fillStyle = `rgba(${currentCursorColor}, ${alpha.toFixed(3)})`;
        lineCtx.arc(dot.x, dot.y, size, 0, Math.PI * 2);
        lineCtx.fill();
      }

      if (m && !freeroam.active) drawCursorMolecule(m.x, m.y, t);

      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerleave", onPointerLeave);
      window.removeEventListener("pointerdown", onAnyPointerDown, { capture: true });
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerCancel);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      document.removeEventListener("pointerlockchange", onPointerLockChange);
      if (document.pointerLockElement === renderer.domElement) document.exitPointerLock();
      renderer.dispose();
      geometry.dispose();
      material.dispose();
      gateGeometry.dispose();
      (gate.mesh.material as THREE.Material).dispose();
      mount.removeChild(renderer.domElement);
    };
  }, [router, particleDensity]);

  return (
    <SceneContext.Provider value={contextValue}>
      <div ref={mountRef} className="fixed inset-0 z-0" />
      <canvas ref={lineCanvasRef} className="pointer-events-none fixed inset-0 z-[1]" />
      {/* Shared across routes so the wordmark can hand its letters off
          between the home hero and this button by layoutId, rather than
          one fading out while the other fades in. */}
      <LayoutGroup>
        {/* HomeButton/UtilityButton live inside this same fading wrapper (not
            as separate siblings) so freeroam dissolving `children` dissolves
            them too, instead of leaving nav chrome floating over the flight
            view. */}
        <div ref={contentRef} className="relative z-10" style={{ opacity: 1, transformStyle: "preserve-3d" }}>
          {pathname !== "/" && <HomeButton />}
          <UtilityButton hidden={!utilityVisible} />
          {children}
        </div>
      </LayoutGroup>
      {freeroamActive && (
        <div className="pointer-events-none fixed inset-0 z-30">
          <div className="absolute left-1/2 top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/50" />
          <p className="absolute left-1/2 top-6 -translate-x-1/2 whitespace-nowrap text-xs tracking-[0.3em] text-white/60">
            Lv {level} · {xp.toLocaleString()} XP
          </p>
          {isCoarsePointer ? (
            <>
              <p className="absolute bottom-10 left-1/2 -translate-x-1/2 whitespace-nowrap text-center text-xs tracking-[0.3em] text-white/40">
                Joystick to move · Drag to look · Tap to drop a node
              </p>
              <FreeroamJoystick onMove={(x, z) => { freeroamMove.current = { x, z }; }} />
              <button
                type="button"
                onClick={() => exitFreeroamImplRef.current()}
                className="pointer-events-auto fixed right-8 top-6 z-30 rounded-full border border-white/15 bg-white/5 px-4 py-1.5 text-xs tracking-[0.2em] text-white/70 backdrop-blur-md transition-colors hover:border-white/30 hover:text-white"
              >
                Exit
              </button>
            </>
          ) : (
            <p className="absolute bottom-10 left-1/2 -translate-x-1/2 whitespace-nowrap text-xs tracking-[0.3em] text-white/40">
              WASD to move · Shift to sprint · Space to dash · Enter to lock on · Esc to return
            </p>
          )}
        </div>
      )}
    </SceneContext.Provider>
  );
}
