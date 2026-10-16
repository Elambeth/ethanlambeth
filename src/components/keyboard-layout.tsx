"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

// Corne v4 keymap (read from the board over Vial). Each half is listed as the
// matrix sees it: 3 finger rows of 7 (col 6 = the two inner keys, rows 0–1
// only) + 3 thumbs (outer → inner). Both halves are written outer → inner,
// so the right half reads pinky-first (mirrored on screen).
//   "_"  transparent (falls through to the layer below)
//   "·"  unassigned

type HalfMap = { rows: string[][]; thumbs: string[] };
type Layer = {
  id: string;
  name: string;
  how: string;
  blurb: string;
  below?: string; // what transparent keys fall through to
  left: HalfMap;
  right: HalfMap;
};

const LAYERS: Layer[] = [
  {
    id: "base",
    name: "Base",
    how: "default",
    blurb: "Dvorak-style letters. Hold a middle thumb for Lower / Raise.",
    left: {
      rows: [
        ["TAB", ";", ",", ".", "P", "Y", "OSM(⇧)"],
        ["LSFT", "A", "O", "E", "U", "I", "CAPS"],
        ["LCTL", "'", "Q", "J", "K", "X"],
      ],
      thumbs: ["LALT", "MO(1)", "SPC"],
    },
    right: {
      rows: [
        ["BSPC", "L", "R", "C", "G", "F", "LGUI"],
        ["LGUI", "S", "N", "T", "H", "D", "LALT"],
        ["ESC", "Z", "V", "W", "M", "B"],
      ],
      thumbs: ["TG(4)", "MO(2)", "ENT"],
    },
  },
  {
    id: "lower",
    name: "Lower",
    how: "hold left middle thumb",
    blurb: "Numbers, function keys, arrows and volume.",
    below: "base",
    left: {
      rows: [
        ["TAB", "1", "2", "3", "4", "5", "LCTL"],
        ["F1", "F2", "F3", "F4", "F5", "F6", "LALT"],
        ["F7", "F8", "F9", "F10", "F11", "F12"],
      ],
      thumbs: ["LGUI", "_", "SPC"],
    },
    right: {
      rows: [
        ["DEL", "0", "9", "8", "7", "6", "TG(4)"],
        [";", "→", "↑", "↓", "←", "·", "RALT"],
        ["·", "·", "Vol+", "Vol-", "Mute", "·"],
      ],
      thumbs: ["RGUI", "LGUI", "LSFT"],
    },
  },
  {
    id: "raise",
    name: "Raise",
    how: "hold right middle thumb",
    blurb: "Symbols and page navigation. ⇧ keys send a shifted symbol.",
    below: "base",
    left: {
      rows: [
        ["TAB", "⇧", "⇧", "⇧", "⇧", "⇧", "LCTL"],
        ["⇧", "⇧", "'", "⇧", "-", "/", "LALT"],
        ["LSFT", "PrtSc", "[", "]", "⇧", "`"],
      ],
      thumbs: ["LGUI", "LCTL", "SPC"],
    },
    right: {
      rows: [
        ["DEL", "⇧", "⇧", "⇧", "⇧", "⇧", "RCTL"],
        ["LGUI", "End", "PgDn", "PgUp", "Home", "\\", "RALT"],
        ["⇧", "\\", "⇧", "⇧", "=", "⇧"],
      ],
      thumbs: ["RGUI", "_", "ENT"],
    },
  },
  {
    id: "mouse",
    name: "Mouse",
    how: "tap right outer thumb",
    blurb: "Cursor on the right home row, clicks on the thumbs, a game cluster on the left.",
    below: "base",
    left: {
      rows: [
        ["ESC", "1", "2", "3", "4", "T", "TAB"],
        ["LSFT", "LSFT", "Q", "W", "E", "R", "H"],
        ["LCTL", "LSFT", "A", "S", "D", "F"],
      ],
      thumbs: ["LALT", "MO(5)", "Ms2"],
    },
    right: {
      rows: [
        ["_", "_", "_", "_", "_", "_", "TO(0)"],
        ["_", "Ms→", "Ms↑", "Ms↓", "Ms←", "J", "_"],
        ["ESC", "_", "_", "_", "_", "_"],
      ],
      thumbs: ["_", "_", "Ms1"],
    },
  },
  {
    id: "scroll",
    name: "Scroll",
    how: "hold left middle thumb in Mouse",
    blurb: "The cursor keys become the scroll wheel.",
    below: "mouse",
    left: {
      rows: [
        ["_", "_", "_", "_", "_", "_", "_"],
        ["_", "_", "_", "_", "_", "_", "_"],
        ["_", "_", "_", "_", "_", "_"],
      ],
      thumbs: ["_", "_", "_"],
    },
    right: {
      rows: [
        ["_", "_", "_", "_", "_", "_", "_"],
        ["_", "Wh→", "Wh↑", "Wh↓", "Wh←", "_", "_"],
        ["_", "_", "_", "_", "_", "_"],
      ],
      thumbs: ["_", "_", "_"],
    },
  },
];

const byId = (id: string) => LAYERS.find((l) => l.id === id)!;

// Layer keys → the layer they open
const LAYER_TARGET: Record<string, string> = {
  "MO(1)": "lower",
  "MO(2)": "raise",
  "TG(4)": "mouse",
  "MO(5)": "scroll",
  "TO(0)": "base",
};

type Kind = "alpha" | "mod" | "layer" | "action" | "trans" | "none";

type Legend = { main: string; sub?: string; kind: Kind; title: string };

const MOD: Record<string, [string, string?]> = {
  LSFT: ["⇧", "shift"],
  LCTL: ["ctrl"],
  RCTL: ["ctrl"],
  LALT: ["alt"],
  RALT: ["alt"],
  LGUI: ["⌘", "super"],
  RGUI: ["⌘", "super"],
  "OSM(⇧)": ["⇧", "one-shot"],
};

const ACTION: Record<string, [string, string?]> = {
  TAB: ["⇥", "tab"],
  BSPC: ["⌫"],
  DEL: ["⌦", "del"],
  ENT: ["⏎", "enter"],
  SPC: ["␣", "space"],
  ESC: ["esc"],
  CAPS: ["caps"],
  PrtSc: ["prt sc"],
  "Vol+": ["vol +"],
  "Vol-": ["vol −"],
  Mute: ["mute"],
  Home: ["home"],
  End: ["end"],
  PgUp: ["pg up"],
  PgDn: ["pg dn"],
  Ms1: ["click", "left"],
  Ms2: ["click", "right"],
  "Ms←": ["←", "mouse"],
  "Ms→": ["→", "mouse"],
  "Ms↑": ["↑", "mouse"],
  "Ms↓": ["↓", "mouse"],
  "Wh←": ["←", "wheel"],
  "Wh→": ["→", "wheel"],
  "Wh↑": ["↑", "wheel"],
  "Wh↓": ["↓", "wheel"],
};

const LAYER_LEGEND: Record<string, [string, string]> = {
  "MO(1)": ["lower", "hold"],
  "MO(2)": ["raise", "hold"],
  "TG(4)": ["mouse", "toggle"],
  "MO(5)": ["scroll", "hold"],
  "TO(0)": ["base", "exit"],
};

function legend(code: string): Legend {
  if (code === "·") return { main: "", kind: "none", title: "unassigned" };
  if (LAYER_LEGEND[code]) {
    const [main, sub] = LAYER_LEGEND[code];
    return { main, sub, kind: "layer", title: `${sub} → ${main} layer` };
  }
  if (MOD[code]) {
    const [main, sub] = MOD[code];
    return { main, sub, kind: "mod", title: code };
  }
  if (ACTION[code]) {
    const [main, sub] = ACTION[code];
    return { main, sub, kind: "action", title: code };
  }
  if (code === "⇧") return { main: "⇧", sub: "symbol", kind: "alpha", title: "shifted symbol" };
  if (/^F\d+$/.test(code)) return { main: code, kind: "action", title: code };
  return { main: code, kind: "alpha", title: code };
}

// Resolve a transparent key by walking down to the layer it falls through to
function resolveTrans(layer: Layer, side: "left" | "right", r: number, c: number): string {
  let below = layer.below ? byId(layer.below) : undefined;
  while (below) {
    const map = below[side];
    const code = r === 3 ? map.thumbs[c] : map.rows[r][c];
    if (code !== "_") return code;
    below = below.below ? byId(below.below) : undefined;
  }
  return "·";
}

// ---------- geometry (key units, left half; right half is mirrored) ----------

const COL_Y = [0.4, 0.4, 0.15, 0, 0.15, 0.3]; // Corne column stagger
const KEY = 0.92; // key size inside its 1u cell
const HALF_W = 7.1;
const HALF_H = 4.55;

type Pos = { x: number; y: number; rot: number; r: number; c: number };

const LEFT_POS: Pos[] = [
  ...[0, 1, 2].flatMap((r) =>
    COL_Y.map((dy, c) => ({ x: c, y: r + dy, rot: 0, r, c }))
  ),
  // inner pair (v4 extra keys), sitting between the finger rows
  { x: 6.05, y: 0.75, rot: 0, r: 0, c: 6 },
  { x: 6.05, y: 1.75, rot: 0, r: 1, c: 6 },
  // thumb fan
  { x: 3.55, y: 3.45, rot: 0, r: 3, c: 0 },
  { x: 4.6, y: 3.48, rot: 6, r: 3, c: 1 },
  { x: 5.66, y: 3.62, rot: 12, r: 3, c: 2 },
];

function Half({
  layer,
  side,
  onJump,
}: {
  layer: Layer;
  side: "left" | "right";
  onJump: (id: string) => void;
}) {
  const map = layer[side];
  return (
    <div
      className="relative w-full"
      style={{ aspectRatio: `${HALF_W} / ${HALF_H}`, containerType: "inline-size" }}
    >
      {LEFT_POS.map((p) => {
        const raw = p.r === 3 ? map.thumbs[p.c] : map.rows[p.r][p.c];
        const trans = raw === "_";
        const code = trans ? resolveTrans(layer, side, p.r, p.c) : raw;
        const l = legend(code);
        const kind: Kind = trans ? "trans" : l.kind;
        const target = !trans ? LAYER_TARGET[raw] : undefined;
        // right half: mirror x and the thumb rotation
        const x = side === "left" ? p.x : HALF_W - 1 - p.x;
        const rot = side === "left" ? p.rot : -p.rot;
        const Tag = target ? "button" : "div";
        return (
          <Tag
            key={`${p.r}-${p.c}`}
            type={target ? "button" : undefined}
            onClick={target ? () => onJump(target) : undefined}
            title={trans ? `transparent (${l.title})` : l.title}
            className={cn(
              "absolute flex flex-col items-center justify-center rounded-[0.9cqw] border leading-none transition-colors duration-150",
              "border-border bg-background text-foreground shadow-[0_1px_0_hsl(var(--border))]",
              kind === "layer" && "cursor-pointer border-muted-foreground/30 bg-muted hover:bg-muted-foreground/20",
              kind === "trans" && "border-dashed text-muted-foreground/45 shadow-none"
            )}
            style={{
              left: `${(x / HALF_W) * 100}%`,
              top: `${(p.y / HALF_H) * 100}%`,
              width: `${(KEY / HALF_W) * 100}%`,
              height: `${(KEY / HALF_H) * 100}%`,
              transform: rot ? `rotate(${rot}deg)` : undefined,
              transformOrigin: side === "left" ? "top left" : "top right",
            }}
          >
            <span
              className={cn("font-medium", kind === "alpha" && l.main.length === 1 && "font-normal")}
              style={{ fontSize: l.main.length > 3 ? "3.1cqw" : l.main.length > 1 ? "3.6cqw" : "4.6cqw" }}
            >
              {l.main}
            </span>
            {l.sub && (
              <span className="mt-[0.6cqw] opacity-60" style={{ fontSize: "2.2cqw" }}>
                {l.sub}
              </span>
            )}
          </Tag>
        );
      })}
    </div>
  );
}

export default function KeyboardLayout() {
  const [activeId, setActiveId] = useState("base");
  const layer = byId(activeId);

  return (
    <figure className="not-prose my-10">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-3">
        <div role="tablist" aria-label="Keyboard layers" className="flex flex-wrap gap-1.5">
          {LAYERS.map((l) => {
            const active = l.id === activeId;
            return (
              <button
                key={l.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setActiveId(l.id)}
                className={cn(
                  "rounded-full border px-3 py-1 text-xs transition-colors",
                  active
                    ? "border-foreground bg-foreground text-background"
                    : "border-border text-muted-foreground hover:text-foreground"
                )}
              >
                {l.name}
              </button>
            );
          })}
        </div>
        <span className="text-xs text-muted-foreground">{layer.how}</span>
      </div>

      <div className="flex flex-col gap-6 sm:flex-row sm:gap-[6%]">
        <Half layer={layer} side="left" onJump={setActiveId} />
        <Half layer={layer} side="right" onJump={setActiveId} />
      </div>

      <figcaption className="mt-5 space-y-2 text-sm text-muted-foreground">
        <p className="text-foreground">{layer.blurb}</p>
        <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block size-3 rounded-sm border border-muted-foreground/30 bg-muted" /> layer key (click it)
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block size-3 rounded-sm border border-dashed" /> falls through
          </span>
        </p>
      </figcaption>
    </figure>
  );
}
