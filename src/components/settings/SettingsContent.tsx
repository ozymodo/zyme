"use client";

import { useSyncExternalStore } from "react";
import AnimatedTitle from "@/components/common/AnimatedTitle";
import { Row, Section } from "@/components/common/Panel";
import {
  BACKGROUND_COLOR_PRESETS,
  COLOR_PRESETS,
  colorToHex,
  getServerSettingsSnapshot,
  getSettingsSnapshot,
  hexToColor,
  resetSettings,
  subscribeSettings,
  updateSettings,
  WORDMARK_SIZE_MAX,
  WORDMARK_SIZE_MIN,
  WORDMARK_WEIGHTS,
  type FontChoice,
  type ParticleDensity,
} from "@/lib/settings";

const DENSITY_OPTIONS: { value: ParticleDensity; label: string }[] = [
  { value: "off", label: "Off" },
  { value: "low", label: "Low" },
  { value: "standard", label: "Standard" },
  { value: "high", label: "High" },
];

const FONT_OPTIONS: { value: FontChoice; label: string; className: string }[] = [
  { value: "sans", label: "Sans", className: "font-sans" },
  { value: "serif", label: "Serif", className: "font-serif" },
  { value: "mono", label: "Mono", className: "font-mono" },
];

const WEIGHT_LABELS: Record<number, string> = {
  100: "Thin",
  200: "Extra light",
  300: "Light",
  400: "Regular",
  500: "Medium",
  600: "Semibold",
  700: "Bold",
  800: "Extra bold",
  900: "Black",
};

function Toggle({
  checked,
  onChange,
  accent,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  accent: string;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className="relative h-7 w-12 shrink-0 rounded-full border border-white/15 transition-colors duration-200"
      style={{ backgroundColor: checked ? `rgba(${accent}, 0.35)` : "rgba(255,255,255,0.06)" }}
    >
      <span
        className="absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white/90 shadow transition-transform duration-200"
        style={{ transform: checked ? "translateX(20px)" : "translateX(0)" }}
      />
    </button>
  );
}

function Slider({
  value,
  min,
  max,
  step,
  accent,
  onChange,
  formatValue,
}: {
  value: number;
  min: number;
  max: number;
  step: number;
  accent: string;
  onChange: (v: number) => void;
  formatValue: (v: number) => string;
}) {
  return (
    <div className="flex items-center gap-3">
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ accentColor: `rgb(${accent})` }}
        className="h-1.5 w-28 cursor-pointer sm:w-36"
      />
      <span className="w-16 text-right text-xs tabular-nums text-white/50">{formatValue(value)}</span>
    </div>
  );
}

function pillStyle(active: boolean, accent: string) {
  return active
    ? { borderColor: `rgba(${accent}, 0.5)`, backgroundColor: `rgba(${accent}, 0.15)`, color: `rgb(${accent})` }
    : { borderColor: "rgba(255,255,255,0.12)", color: "rgba(255,255,255,0.55)" };
}

/** A row of preset swatches plus a custom color picker, shared by the background/accent/node/cursor color settings. */
function ColorPicker({
  value,
  onChange,
  presets = COLOR_PRESETS,
}: {
  value: string;
  onChange: (color: string) => void;
  presets?: typeof COLOR_PRESETS;
}) {
  return (
    <div className="flex items-center gap-2">
      {presets.map((preset) => (
        <button
          key={preset.label}
          type="button"
          aria-label={preset.label}
          title={preset.label}
          onClick={() => onChange(preset.color)}
          className="h-7 w-7 rounded-full border-2 transition-transform hover:scale-110"
          style={{
            backgroundColor: `rgb(${preset.color})`,
            borderColor: value === preset.color ? "rgba(255,255,255,0.9)" : "transparent",
          }}
        />
      ))}
      <label
        className="relative flex h-7 w-7 cursor-pointer items-center justify-center rounded-full border-2 border-dashed border-white/25 text-[10px] text-white/50 hover:border-white/50"
        title="Custom color"
      >
        +
        <input
          type="color"
          value={colorToHex(value)}
          onChange={(e) => onChange(hexToColor(e.target.value))}
          aria-label="Custom color"
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
        />
      </label>
    </div>
  );
}

export default function SettingsContent() {
  const settings = useSyncExternalStore(subscribeSettings, getSettingsSnapshot, getServerSettingsSnapshot);
  const { accent } = settings;

  return (
    <div className="scroll-page relative flex h-dvh touch-pan-y flex-col items-center gap-10 overflow-y-auto px-6 py-24 text-center short-landscape:gap-8 short-landscape:py-14">
      <div
        className="pointer-events-none absolute left-1/2 top-24 h-72 w-72 -translate-x-1/2 rounded-full opacity-25 blur-3xl"
        style={{ background: `radial-gradient(circle, rgba(${accent}, 0.5), transparent 70%)` }}
      />

      <div className="relative flex flex-col items-center gap-2">
        <AnimatedTitle
          text="SETTINGS"
          intensity={0.4}
          accent={accent}
          className="text-3xl font-semibold tracking-[0.15em] text-white/90 sm:text-4xl"
        />
        <p className="max-w-md text-sm text-white/40">
          Tune how zyme looks and moves for you. Saved on this device.
        </p>
      </div>

      <div className="relative flex w-full flex-col items-center gap-8">
        <Section title="Appearance">
          <Row title="Background color" description="The site's base color, behind the particle scene.">
            <ColorPicker
              value={settings.backgroundColor}
              onChange={(color) => updateSettings({ backgroundColor: color })}
              presets={BACKGROUND_COLOR_PRESETS}
            />
          </Row>
          <Row title="Accent color" description="Colors the wordmark and the home button.">
            <ColorPicker value={accent} onChange={(color) => updateSettings({ accent: color })} />
          </Row>
          <Row title="Node color" description="The ambient particles drifting through the scene.">
            <ColorPicker value={settings.nodeColor} onChange={(color) => updateSettings({ nodeColor: color })} />
          </Row>
          <Row title="Cursor color" description="Your cursor's glow, trail, and connecting lines.">
            <ColorPicker value={settings.cursorColor} onChange={(color) => updateSettings({ cursorColor: color })} />
          </Row>
          <Row
            title="Level-up colors"
            description="Every level up recolors one of the above - accent, nodes, cursor, or the wordmark, in turn. Never the background. Picking any color yourself switches this off."
          >
            <Toggle
              checked={settings.levelColors}
              onChange={(v) => updateSettings({ levelColors: v })}
              accent={accent}
              label="Recolor part of the site on every level up"
            />
          </Row>
        </Section>

        <Section title="Motion & effects">
          <Row title="Cursor trail" description="The drifting dust motes that follow your cursor.">
            <Toggle
              checked={settings.trailEffect}
              onChange={(v) => updateSettings({ trailEffect: v })}
              accent={accent}
              label="Cursor trail"
            />
          </Row>
          <Row title="Reduced motion" description="Calms ambient drifting, page-dive flythroughs, and orb pulsing.">
            <Toggle
              checked={settings.reducedMotion}
              onChange={(v) => updateSettings({ reducedMotion: v })}
              accent={accent}
              label="Reduced motion"
            />
          </Row>
          <Row title="Particle density" description="How many ambient particles drift through the scene.">
            <div className="flex gap-1.5">
              {DENSITY_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => updateSettings({ particleDensity: opt.value })}
                  className="rounded-full border px-3 py-1.5 text-xs font-medium transition-colors"
                  style={pillStyle(settings.particleDensity === opt.value, accent)}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </Row>
        </Section>

        <Section title="Typography">
          <Row title="Font" description="Applies across the whole site.">
            <div className="flex gap-1.5">
              {FONT_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => updateSettings({ font: opt.value })}
                  title={opt.label}
                  aria-label={opt.label}
                  className={`flex h-9 w-12 items-center justify-center rounded-full border text-sm transition-colors ${opt.className}`}
                  style={pillStyle(settings.font === opt.value, accent)}
                >
                  Aa
                </button>
              ))}
            </div>
          </Row>
        </Section>

        <Section title="Landing page title">
          <Row title="Font" description="Just the wordmark letters, not the whole site.">
            <div className="flex gap-1.5">
              {FONT_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => updateSettings({ wordmarkFont: opt.value })}
                  title={opt.label}
                  aria-label={opt.label}
                  className={`flex h-9 w-12 items-center justify-center rounded-full border text-sm transition-colors ${opt.className}`}
                  style={pillStyle(settings.wordmarkFont === opt.value, accent)}
                >
                  Aa
                </button>
              ))}
            </div>
          </Row>
          <Row title="Color" description="Shades from white down into this color.">
            <ColorPicker value={settings.wordmarkColor} onChange={(color) => updateSettings({ wordmarkColor: color })} />
          </Row>
          <Row title="Size">
            <Slider
              value={settings.wordmarkSize}
              min={WORDMARK_SIZE_MIN}
              max={WORDMARK_SIZE_MAX}
              step={0.05}
              accent={accent}
              onChange={(v) => updateSettings({ wordmarkSize: v })}
              formatValue={(v) => `${Math.round(v * 100)}%`}
            />
          </Row>
          <Row title="Thickness">
            <Slider
              value={settings.wordmarkWeight}
              min={WORDMARK_WEIGHTS[0]}
              max={WORDMARK_WEIGHTS[WORDMARK_WEIGHTS.length - 1]}
              step={100}
              accent={accent}
              onChange={(v) => updateSettings({ wordmarkWeight: v })}
              formatValue={(v) => WEIGHT_LABELS[v] ?? String(v)}
            />
          </Row>
          <Row
            title="Shuffle each visit"
            description="Draws a new word every time you open a page - the home button carries it back. Ignored while Account > Homepage text is set."
          >
            <Toggle
              checked={settings.shuffleWordmark}
              onChange={(v) => updateSettings({ shuffleWordmark: v })}
              accent={accent}
              label="Shuffle the landing page word each visit"
            />
          </Row>
        </Section>

        <button
          type="button"
          onClick={() => resetSettings()}
          className="text-xs font-medium text-white/35 underline decoration-white/20 underline-offset-4 transition-colors hover:text-white/60"
        >
          Reset to defaults
        </button>
      </div>
    </div>
  );
}
