"use client";

import { useEffect, useRef } from "react";

// Tiny looping canvas drawings for the home page rows (one blue, thin lines).
export type GlyphKind =
  | "eye"
  | "typing"
  | "dock"
  | "brackets"
  | "takeover"
  | "wheel"
  | "pinch"
  | "lens"
  | "sweep"
  | "build"
  | "stack"
  | "panes"
  | "tabs";

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
  // Gesture inputs: an iPod click wheel, a thumb scrolling round it then tapping the centre
  wheel(c, T) {
    const { w, h } = c, g = c.ctx, cx = w / 2, cy = h / 2, t = T % 4.2;
    const R = h * 0.4, r0 = R * 0.38, mid = (R + r0) / 2;
    ring(c, cx, cy, R, c.ink);
    ring(c, cx, cy, r0, c.ink);
    const a = -Math.PI / 2 + ease((t - 0.3) / 2.2) * Math.PI * 1.6;
    const tap = t > 2.9 && t < 3.5 ? Math.sin(((t - 2.9) / 0.6) * Math.PI) : 0;
    if (t < 2.9) {
      g.strokeStyle = c.blue;
      g.lineWidth = c.lw * 1.6;
      g.beginPath();
      g.arc(cx, cy, mid, a - 0.9 * clamp(t / 0.6), a);
      g.stroke();
      dot(c, cx + Math.cos(a) * mid, cy + Math.sin(a) * mid, h * 0.06, c.blue);
    }
    if (tap > 0) {
      g.globalAlpha = tap;
      dot(c, cx, cy, r0 * 0.78, c.blue);
      g.globalAlpha = 1;
    }
  },

  // Gesture inputs: thumb and index closing into a pinch, a blue spark at contact
  pinch(c, T) {
    const { w, h } = c, g = c.ctx, t = T % 2.8, cy = h * 0.5;
    const p = t < 1 ? ease(t / 1) : t < 1.6 ? 1 : 1 - ease((t - 1.6) / 0.9);
    const tx = w * 0.62, gap = h * 0.26 * (1 - p) + h * 0.02;
    g.strokeStyle = c.ink;
    g.lineWidth = c.lw * 1.3;
    g.beginPath(); // index finger, two knuckles
    g.moveTo(w * 0.2, h * 0.32);
    g.lineTo(w * 0.42, h * 0.18 + p * h * 0.06);
    g.lineTo(tx, cy - gap);
    g.moveTo(w * 0.24, h * 0.78); // thumb
    g.lineTo(w * 0.44, h * 0.76 - p * h * 0.06);
    g.lineTo(tx, cy + gap);
    g.stroke();
    dot(c, tx, cy - gap, h * 0.035, p > 0.95 ? c.blue : c.ink);
    dot(c, tx, cy + gap, h * 0.035, p > 0.95 ? c.blue : c.ink);
    if (t > 1 && t < 1.8) {
      const k = (t - 1) / 0.8;
      g.globalAlpha = 1 - k;
      ring(c, tx, cy, h * (0.06 + k * 0.2), c.blue);
      g.globalAlpha = 1;
    }
  },

  // Live ad-blocker: a lens drifts over a wall of billboards, the ads inside it gone
  lens(c, T) {
    const { w, h } = c, g = c.ctx;
    const boards: number[][] = [];
    const bw = w * 0.24, bh = h * 0.3;
    for (let r = 0; r < 2; r++) for (let i = 0; i < 3; i++)
      boards.push([w * 0.1 + i * w * 0.28 + (r ? w * 0.04 : 0), h * 0.13 + r * h * 0.42, bw, bh]);
    const lx = w * (0.5 + 0.3 * Math.sin(T * 0.7)), ly = h * (0.5 + 0.22 * Math.sin(T * 1.1 + 1));
    const LR = h * 0.3;
    const ad = (x: number, y: number, bw: number, bh: number) => {
      g.save();
      rrect(c, x, y, bw, bh, 1);
      g.clip();
      for (let k = -bh; k < bw; k += h * 0.07) line(c, x + k, y + bh, x + k + bh, y, c.faint);
      g.restore();
      rrect(c, x, y, bw, bh, 1);
      g.strokeStyle = c.ink;
      g.lineWidth = c.lw;
      g.stroke();
    };
    for (const [x, y, bw, bh] of boards) ad(x, y, bw, bh);
    g.save();
    g.beginPath();
    g.arc(lx, ly, LR, 0, Math.PI * 2);
    g.clip();
    g.clearRect(0, 0, w, h);
    g.globalAlpha = 0.08;
    g.fillStyle = c.blue;
    g.fillRect(0, 0, w, h);
    g.globalAlpha = 1;
    for (const [x, y, bw, bh] of boards) {
      rrect(c, x, y, bw, bh, 1);
      g.strokeStyle = c.faint;
      g.lineWidth = c.lw;
      g.stroke();
    }
    g.restore();
    ring(c, lx, ly, LR, c.blue, c.lw * 1.4);
  },

  // Live ad-blocker: a blue scan sweeps a street, wiping billboards clean, then the ads creep back
  sweep(c, T) {
    const { w, h } = c, g = c.ctx, t = T % 5, base = h * 0.84;
    const sx = t < 3.6 ? lerp(-w * 0.05, w * 1.05, ease((t - 0.4) / 2.4)) : lerp(w * 1.05, -w * 0.05, ease((t - 3.8) / 1));
    line(c, w * 0.04, base, w * 0.96, base, c.faint);
    const boards = [
      [0.08, 0.24, 0.24, 0.3],
      [0.4, 0.12, 0.26, 0.38],
      [0.73, 0.3, 0.2, 0.26],
    ].map(([x, y, bw, bh]) => [x * w, y * h, bw * w, bh * h]);
    for (const [x, y, bw, bh] of boards) {
      line(c, x + bw / 2, y + bh, x + bw / 2, base, c.ink);
      for (const clean of [false, true]) {
        g.save();
        g.beginPath();
        if (clean) g.rect(0, 0, sx, h);
        else g.rect(sx, 0, w, h);
        g.clip();
        rrect(c, x, y, bw, bh, 1);
        if (clean) {
          g.fillStyle = c.blue;
          g.globalAlpha = 0.18;
          g.fill();
          g.globalAlpha = 1;
          g.strokeStyle = c.blue;
        } else {
          g.save();
          g.clip();
          // the "ad": a headline bar and two lines of copy
          g.fillStyle = c.ink;
          g.fillRect(x + bw * 0.14, y + bh * 0.22, bw * 0.72, bh * 0.2);
          line(c, x + bw * 0.14, y + bh * 0.62, x + bw * 0.86, y + bh * 0.62, c.ink);
          line(c, x + bw * 0.14, y + bh * 0.8, x + bw * 0.6, y + bh * 0.8, c.ink);
          g.restore();
          rrect(c, x, y, bw, bh, 1);
          g.strokeStyle = c.ink;
        }
        g.lineWidth = c.lw;
        g.stroke();
        g.restore();
      }
    }
    if (sx > 0 && sx < w) line(c, sx, h * 0.04, sx, base, c.blue, c.lw * 1.3);
  },

  // How to explain things: concepts appear one by one, each linked back to what came before
  build(c, T) {
    const { w, h } = c, g = c.ctx, step = 0.75;
    const N: [number, number][] = [[0.12, 0.62], [0.3, 0.3], [0.33, 0.78], [0.54, 0.52], [0.72, 0.24], [0.88, 0.66]];
    const P = [[], [0], [0], [1, 2], [3], [3, 4]];
    const cycle = N.length * step + 1.8, t = T % cycle;
    const fade = 1 - ease((t - (cycle - 0.6)) / 0.5);
    const newest = Math.min(N.length - 1, Math.floor(t / step));
    g.globalAlpha = fade;
    N.forEach(([nx, ny], i) => {
      const k = (t - i * step) / step;
      if (k <= 0) return;
      const x = nx * w, y = ny * h;
      for (const j of P[i]) {
        const px = N[j][0] * w, py = N[j][1] * h, e = ease(k * 1.6);
        line(c, px, py, lerp(px, x, e), lerp(py, y, e), c.ink);
      }
    });
    N.forEach(([nx, ny], i) => {
      const k = (t - i * step) / step;
      if (k <= 0) return;
      const r = h * 0.07 * ease(k * 2);
      const blue = i === newest;
      dot(c, nx * w, ny * h, r, blue ? c.blue : c.ink);
    });
    g.globalAlpha = 1;
  },

  // How to explain things: blocks laid from the ground up, the newest in blue
  stack(c, T) {
    const { w, h } = c, g = c.ctx, step = 0.7;
    const L = [0.62, 0.5, 0.38, 0.26], bh = h * 0.15, base = h * 0.86;
    const cycle = L.length * step + 1.8, t = T % cycle;
    const fade = 1 - ease((t - (cycle - 0.6)) / 0.5);
    line(c, w * 0.1, base, w * 0.9, base, c.faint);
    g.globalAlpha = fade;
    L.forEach((bw, i) => {
      const k = (t - i * step) / (step * 0.8);
      if (k <= 0) return;
      const y = base - (i + 1) * (bh + h * 0.02);
      const yy = lerp(-bh, y, 1 - Math.pow(1 - clamp(k), 3));
      const x = (w - bw * w) / 2;
      rrect(c, x, yy, bw * w, bh, 1.5);
      const newest = i === Math.min(L.length - 1, Math.floor(t / step));
      if (newest) {
        g.fillStyle = c.blue;
        g.fill();
      }
      g.strokeStyle = newest ? c.blue : c.ink;
      g.lineWidth = c.lw;
      g.stroke();
    });
    g.globalAlpha = 1;
  },

  // Useful computer things: a tmux window, lines typing out in whichever pane is active
  panes(c, T) {
    const { w, h } = c, g = c.ctx;
    const X = w * 0.1, Y = h * 0.12, W = w * 0.8, H = h * 0.72, sb = h * 0.08;
    const panes = [
      [X, Y, W * 0.55, H],
      [X + W * 0.55, Y, W * 0.45, H * 0.5],
      [X + W * 0.55, Y + H * 0.5, W * 0.45, H * 0.5],
    ];
    const seg = 2.2, active = Math.floor(T / seg) % 3, local = T % seg;
    rrect(c, X, Y, W, H + sb, 2);
    g.strokeStyle = c.ink;
    g.lineWidth = c.lw;
    g.stroke();
    line(c, X + W * 0.55, Y, X + W * 0.55, Y + H, c.ink);
    line(c, X + W * 0.55, Y + H * 0.5, X + W, Y + H * 0.5, c.ink);
    line(c, X, Y + H, X + W, Y + H, c.faint);
    g.fillStyle = c.blue;
    g.fillRect(X + 1, Y + H + 1, W * 0.18, sb - 1); // status bar session tag
    panes.forEach(([px, py, pw, ph], i) => {
      const pad = h * 0.07, lh = h * 0.1, rows = Math.floor((ph - pad) / lh);
      const typed = i === active ? local * 7 : 99;
      let used = 0, cx = px + pad, cy = py + pad;
      for (let r = 0; r < rows; r++) {
        const full = (0.35 + hash(i * 31 + r + (Math.floor(T / (seg * 3)) * 7)) * 0.5) * (pw - pad * 2);
        const len = clamp(typed - used, 0, 1) * full;
        used += 1;
        const y = py + pad + r * lh + lh * 0.3;
        if (len > 0) line(c, px + pad, y, px + pad + len, y, i === active ? c.ink : c.faint);
        if (len > 0) { cx = px + pad + len; cy = y; }
      }
      if (i === active && Math.floor(T * 2.5) % 2 === 0)
        g.fillRect(cx + h * 0.02, cy - lh * 0.3, h * 0.04, lh * 0.6);
    });
  },

  // Useful computer things: a row of hoarded tabs; the ones you haven't looked at fall asleep
  tabs(c, T) {
    const { w, h } = c, g = c.ctx, n = 6, step = 0.9;
    const X = w * 0.06, Y = h * 0.3, tw = (w * 0.88) / n;
    const now = Math.floor(T / step);
    line(c, w * 0.04, Y + h * 0.22, w * 0.96, Y + h * 0.22, c.faint);
    for (let i = 0; i < n; i++) {
      let last = -99;
      for (let k = now; k > now - 12; k--) if (Math.floor(hash(k) * n) === i) { last = k; break; }
      const idle = T - last * step;
      const active = last === now;
      const sleep = clamp((idle - 2.6) / 0.6);
      const x = X + i * tw;
      rrect(c, x + tw * 0.06, Y, tw * 0.88, h * 0.22, 2);
      if (active) {
        g.fillStyle = c.blue;
        g.fill();
      }
      g.strokeStyle = active ? c.blue : sleep > 0.5 ? c.faint : c.ink;
      g.lineWidth = c.lw;
      g.stroke();
      if (sleep > 0) {
        // a little z drifting up off the sleeping tab
        const zz = h * 0.07, zx = x + tw * 0.4, zy = Y - h * 0.06 - ((idle * 0.4) % 1) * h * 0.12;
        g.globalAlpha = sleep * (1 - ((idle * 0.4) % 1));
        g.strokeStyle = c.ink;
        g.beginPath();
        g.moveTo(zx, zy);
        g.lineTo(zx + zz, zy);
        g.lineTo(zx, zy + zz);
        g.lineTo(zx + zz, zy + zz);
        g.stroke();
        g.globalAlpha = 1;
      }
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
