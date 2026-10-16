"use client";

import { useEffect, useRef } from "react";

// Tiny looping canvas drawings for the home page rows (one blue, thin lines).
export type GlyphKind = "eye" | "typing" | "dock" | "brackets" | "takeover";

type Colors = { blue: string; ink: string; faint: string };
type Ctx = Colors & { ctx: CanvasRenderingContext2D; w: number; h: number; lw: number };
type State = Record<string, any>;

const clamp = (x: number, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const ease = (x: number) => {
  x = clamp(x);
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
};
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
function rng(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const hash = (n: number) => rng(n * 7919 + 13)();

function line(c: Ctx, x1: number, y1: number, x2: number, y2: number, color: string, lw = c.lw) {
  const g = c.ctx;
  g.strokeStyle = color;
  g.lineWidth = lw;
  g.beginPath();
  g.moveTo(x1, y1);
  g.lineTo(x2, y2);
  g.stroke();
}
function dot(c: Ctx, x: number, y: number, r: number, color: string) {
  const g = c.ctx;
  g.fillStyle = color;
  g.beginPath();
  g.arc(x, y, Math.max(0.6, r), 0, Math.PI * 2);
  g.fill();
}
function ring(c: Ctx, x: number, y: number, r: number, color: string, lw = c.lw) {
  const g = c.ctx;
  g.strokeStyle = color;
  g.lineWidth = lw;
  g.beginPath();
  g.arc(x, y, Math.max(0.6, r), 0, Math.PI * 2);
  g.stroke();
}
function rrect(c: Ctx, x: number, y: number, w: number, h: number, r: number) {
  const g = c.ctx;
  g.beginPath();
  if (g.roundRect) g.roundRect(x, y, w, h, r);
  else g.rect(x, y, w, h);
}

// Corne v4 silhouette (6x3 per half + 3 thumbs), fitted to the canvas
const STAGGER = [0.4, 0.4, 0.15, 0, 0.15, 0.3];
function corne(c: Ctx) {
  const BW = 13.8, BH = 4.7;
  const u = Math.min((c.w * 0.84) / BW, (c.h * 0.84) / BH);
  const ox = (c.w - BW * u) / 2, oy = (c.h - BH * u) / 2;
  const keys: { x: number; y: number; s: number }[] = [];
  for (const side of [0, 1]) {
    const pos: { x: number; y: number }[] = [];
    for (let r = 0; r < 3; r++) for (let col = 0; col < 6; col++) pos.push({ x: col, y: r + STAGGER[col] });
    pos.push({ x: 3.4, y: 3.5 }, { x: 4.45, y: 3.55 }, { x: 5.5, y: 3.65 });
    for (const p of pos) {
      const bx = side === 0 ? p.x : BW - 1 - p.x;
      keys.push({ x: ox + bx * u, y: oy + p.y * u, s: u * 0.86 });
    }
  }
  return keys;
}

const DRAW: Record<GlyphKind, (c: Ctx, t: number, S: State) => void> = {
  // Panacea: an eye scanning left and right, blinking now and then
  eye(c, T) {
    const { w, h } = c, g = c.ctx, cx = w / 2, cy = h / 2, W = h * 0.62;
    const t = T % 4;
    const gaze = t < 1.6 ? lerp(-1, 1, ease((t - 0.3) / 1.1)) : lerp(1, -1, ease((t - 2.3) / 1.1));
    const bt = T % 5.3, blink = bt > 5.0 ? Math.sin(((bt - 5.0) / 0.3) * Math.PI) : 0;
    const H = h * 0.3 * (1 - 0.95 * blink);
    const shape = () => {
      g.beginPath();
      g.moveTo(cx - W, cy);
      g.quadraticCurveTo(cx, cy - H * 2, cx + W, cy);
      g.quadraticCurveTo(cx, cy + H * 2, cx - W, cy);
      g.closePath();
    };
    shape();
    g.save();
    g.clip();
    // Keep the iris (ring included) a clear gap inside the open eye's outline:
    // gap from the iris centre to the lid curve y = H0(1 - (x/W)^2), minus both half strokes.
    const H0 = h * 0.3, margin = c.lw * 2.3;
    const room = (ox: number) => {
      let d = Infinity;
      for (let i = 0; i <= 64; i++) {
        const x = -W + (2 * W * i) / 64;
        d = Math.min(d, Math.hypot(x - ox, H0 * (1 - (x / W) ** 2)));
      }
      return d - margin;
    };
    const r = Math.min(W * 0.31, room(0));
    let lo = 0, hi = W;
    for (let i = 0; i < 16; i++) {
      const mid = (lo + hi) / 2;
      if (room(mid) >= r) lo = mid;
      else hi = mid;
    }
    const ix = cx + gaze * Math.min(W * 0.45, lo);
    if (H > 0.5) {
      ring(c, ix, cy, r, c.blue, c.lw * 1.4);
      dot(c, ix, cy, r * 0.55, c.blue);
    }
    g.restore();
    shape();
    g.strokeStyle = c.ink;
    g.lineWidth = c.lw * 1.2;
    g.stroke();
  },

  // Keyboard: the split board with keys lighting as if typed on
  typing(c, T) {
    const keys = corne(c), g = c.ctx, n = keys.length;
    const step = Math.floor(T * 5.5);
    const glow = new Array(n).fill(0);
    for (let k = step - 8; k <= step; k++) {
      const idx = Math.floor(hash(k) * n);
      glow[idx] = Math.max(glow[idx], Math.exp(-(T - k / 5.5) * 3.2));
    }
    keys.forEach((k, i) => {
      rrect(c, k.x, k.y, k.s, k.s, k.s * 0.18);
      if (glow[i] > 0.02) {
        g.globalAlpha = glow[i];
        g.fillStyle = c.blue;
        g.fill();
        g.globalAlpha = 1;
      }
      g.strokeStyle = c.ink;
      g.lineWidth = c.lw * 0.8;
      g.stroke();
    });
  },

  // Interfaces: a row of tiles swelling under a moving pointer
  dock(c, T) {
    const { w, h } = c, g = c.ctx, n = 9, base = h * 0.7;
    const px = w * (0.5 + 0.36 * Math.sin(T * 0.8));
    const gap = h * 0.125, x0 = w / 2 - (gap * (n - 1)) / 2, pad = h * 0.025;
    line(c, w * 0.08, base + h * 0.03, w * 0.92, base + h * 0.03, c.faint);
    const sizes = Array.from({ length: n }, (_, i) => {
      const d = (x0 + i * gap - px) / (gap * 1.6);
      return h * (0.1 + 0.14 * Math.exp(-d * d));
    });
    let x = w / 2 - (sizes.reduce((a, b) => a + b, 0) + pad * (n - 1)) / 2;
    for (const s of sizes) {
      const mag = (s / h - 0.1) / 0.14;
      rrect(c, x, base - s, s, s, s * 0.22);
      if (mag > 0.35) {
        g.globalAlpha = (mag - 0.35) / 0.65;
        g.fillStyle = c.blue;
        g.fill();
        g.globalAlpha = 1;
      }
      g.strokeStyle = mag > 0.35 ? c.blue : c.ink;
      g.lineWidth = c.lw;
      g.stroke();
      x += s + pad;
    }
    const s = h * 0.07, y = base + h * 0.1;
    g.fillStyle = c.ink;
    g.beginPath();
    g.moveTo(px, y);
    g.lineTo(px + s * 0.3, y + s);
    g.lineTo(px + s * 0.75, y + s * 0.7);
    g.closePath();
    g.fill();
  },

  // AR: a spinning wireframe cube that blue brackets lock onto
  brackets(c, T, S) {
    const { w, h } = c, g = c.ctx, t = T % 6;
    const ry = T * 0.6, rx = 0.45 + Math.sin(T * 0.4) * 0.2, sz = h * 0.2;
    const V: [number, number][] = [];
    for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) {
      const X = x * Math.cos(ry) + z * Math.sin(ry);
      let Z = -x * Math.sin(ry) + z * Math.cos(ry);
      const Y = y * Math.cos(rx) - Z * Math.sin(rx);
      Z = y * Math.sin(rx) + Z * Math.cos(rx);
      const p = 3.6 / (3.6 + Z * 0.5);
      V.push([w / 2 + X * sz * p, h * 0.54 + Y * sz * p]);
    }
    for (let i = 0; i < 8; i++) for (let j = i + 1; j < 8; j++) {
      const d = i ^ j;
      if (d === 1 || d === 2 || d === 4) line(c, V[i][0], V[i][1], V[j][0], V[j][1], c.ink);
    }
    const xs = V.map((v) => v[0]), ys = V.map((v) => v[1]), pad = h * 0.05;
    const box = [Math.min(...xs) - pad, Math.min(...ys) - pad, Math.max(...xs) + pad, Math.max(...ys) + pad];
    S.b = S.b ? S.b.map((v: number, i: number) => lerp(v, box[i], 0.12)) : box;
    const show = ease((t - 0.4) / 0.5) * (1 - ease((t - 5.2) / 0.5));
    if (show <= 0) return;
    const [x0, y0, x1, y1] = S.b, L = h * 0.11 * show;
    g.globalAlpha = show;
    g.strokeStyle = c.blue;
    g.lineWidth = c.lw * 1.4;
    g.beginPath();
    for (const [x, y, sx, sy] of [[x0, y0, 1, 1], [x1, y0, -1, 1], [x0, y1, 1, -1], [x1, y1, -1, -1]]) {
      g.moveTo(x + sx * L, y);
      g.lineTo(x, y);
      g.lineTo(x, y + sy * L);
    }
    g.stroke();
    g.globalAlpha = 1;
  },

  // Agent swarms: a small blue swarm hunts a grey one; every grey agent it touches turns blue
  takeover(c, T, S) {
    const { w, h } = c, sc = h / 100;
    const reset = () => {
      const r = rng(61 + Math.floor(T));
      S.done = 0;
      S.a = Array.from({ length: 30 }, (_, i) => {
        const blue = i < 6;
        return {
          x: blue ? w * (0.1 + r() * 0.15) : w * (0.55 + r() * 0.35),
          y: h * (0.2 + r() * 0.6),
          vx: 0, vy: 0, blue, flash: 0, ph: r() * 6.28,
        };
      });
    };
    if (!S.a) reset();
    const A: any[] = S.a;
    for (const a of A) {
      let tx: number, ty: number;
      if (a.blue) {
        let best: any = null, bd = 1e9;
        for (const o of A) if (!o.blue) {
          const d = Math.hypot(o.x - a.x, o.y - a.y);
          if (d < bd) { bd = d; best = o; }
        }
        if (best) { tx = best.x; ty = best.y; }
        else { tx = w / 2 + Math.cos(T + a.ph) * w * 0.25; ty = h / 2 + Math.sin(T * 1.3 + a.ph) * h * 0.25; }
      } else {
        tx = w * 0.72 + Math.cos(T * 0.7 + a.ph) * w * 0.16;
        ty = h / 2 + Math.sin(T * 0.9 + a.ph * 2) * h * 0.3;
      }
      const k = 0.0016 * (a.blue ? 1.4 : 1);
      a.vx = a.vx * 0.92 + (tx - a.x) * k;
      a.vy = a.vy * 0.92 + (ty - a.y) * k;
      for (const o of A) {
        if (o === a) continue;
        const dx = a.x - o.x, dy = a.y - o.y, d = Math.hypot(dx, dy);
        if (d < 5 * sc && d > 0) { a.vx += (dx / d) * 0.06 * sc; a.vy += (dy / d) * 0.06 * sc; }
      }
      a.x += a.vx;
      a.y += a.vy;
      if (a.flash > 0) a.flash -= 1 / 40;
    }
    for (const b of A.filter((a) => a.blue))
      for (const o of A) if (!o.blue && Math.hypot(o.x - b.x, o.y - b.y) < 5 * sc) { o.blue = true; o.flash = 1; }
    if (A.every((a) => a.blue)) { S.done += 1 / 60; if (S.done > 2.2) reset(); }
    for (const a of A) {
      if (a.flash > 0) {
        c.ctx.globalAlpha = a.flash;
        ring(c, a.x, a.y, h * (0.03 + (1 - a.flash) * 0.05), c.blue);
        c.ctx.globalAlpha = 1;
      }
      dot(c, a.x, a.y, h * 0.022, a.blue ? c.blue : c.ink);
    }
  },
};

function readColors(): Colors {
  const dark = document.documentElement.classList.contains("dark");
  const fg = getComputedStyle(document.documentElement).getPropertyValue("--foreground").trim(); // "0 0% 10%"
  const [hh, s, l] = fg.split(/\s+/);
  const ink = (a: number) => (fg ? `hsla(${hh}, ${s}, ${l}, ${a})` : `rgba(128,128,128,${a})`);
  return { blue: dark ? "#60a5fa" : "#2563eb", ink: ink(0.55), faint: ink(0.14) };
}

export default function Glyph({ kind, className }: { kind: GlyphKind; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    let colors = readColors();
    let visible = true;
    let raf = 0;
    const state: State = {};
    const t0 = performance.now();

    const draw = (t: number) => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = cv.clientWidth, h = cv.clientHeight;
      if (!w || !h) return;
      if (cv.width !== Math.round(w * dpr)) {
        cv.width = Math.round(w * dpr);
        cv.height = Math.round(h * dpr);
      }
      const ctx = cv.getContext("2d");
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      DRAW[kind]({ ...colors, ctx, w, h, lw: Math.max(0.9, Math.min(w, h * 1.6) / 170) }, t, state);
    };

    const loop = (now: number) => {
      if (visible) draw(Math.max(0, now - t0) / 1000);
      raf = requestAnimationFrame(loop);
    };

    const io = new IntersectionObserver(([e]) => (visible = e.isIntersecting));
    io.observe(cv);
    // next-themes toggles the `dark` class on <html>
    // (always animates, even with prefers-reduced-motion: these are small ambient loops)
    const mo = new MutationObserver(() => (colors = readColors()));
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });

    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
      mo.disconnect();
    };
  }, [kind]);

  return <canvas ref={ref} aria-hidden="true" className={className} />;
}
