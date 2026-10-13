#!/usr/bin/env node
/**
 * Local admin for /input-gestures — never deployed.
 *
 *   node scripts/input-gestures-admin.mjs   (or: pnpm admin)
 *
 * Serves http://127.0.0.1:4173 — drag to reorder, click to edit notes,
 * Save writes src/app/input-gestures/{notes,order}.json.
 * Publish button = git commit + push (Cloudflare Pages deploys on push).
 */
import { createServer } from "http";
import { execSync } from "child_process";
import { readdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";

const ROOT = join(import.meta.dirname, "..");
const IMG_DIR = join(ROOT, "public/input-gestures");
const NOTES = join(ROOT, "src/app/input-gestures/notes.json");
const ORDER = join(ROOT, "src/app/input-gestures/order.json");
const HIDDEN = join(ROOT, "src/app/input-gestures/hidden.json");
const PORT = 4173;

const readJson = (p, fallback) => {
  try {
    return JSON.parse(readFileSync(p, "utf8"));
  } catch {
    return fallback;
  }
};

function state() {
  const all = readdirSync(IMG_DIR)
    .filter((n) => /\.(jpe?g|png|gif|webp|avif)$/i.test(n))
    .sort();
  const order = readJson(ORDER, []);
  const hidden = readJson(HIDDEN, []);
  const ordered = [
    ...order.filter((n) => all.includes(n) && !hidden.includes(n)),
    ...all.filter((n) => !order.includes(n) && !hidden.includes(n)),
  ];
  return { images: ordered, hidden: all.filter((n) => hidden.includes(n)), notes: readJson(NOTES, {}) };
}

function save({ notes, order, hidden }) {
  writeFileSync(NOTES, JSON.stringify(notes, null, 2) + "\n");
  writeFileSync(ORDER, JSON.stringify(order, null, 2) + "\n");
  writeFileSync(HIDDEN, JSON.stringify(hidden, null, 2) + "\n");
}

function publish() {
  const out = execSync(
    "git add src/app/input-gestures public/input-gestures && " +
      'git commit -m "input-gestures: update notes/order" --no-verify && git push',
    { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }
  );
  return out;
}

const PAGE = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>input-gestures admin</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body { margin: 0; font: 14px/1.4 system-ui, sans-serif; background: #111; color: #eee; }
  header { position: sticky; top: 0; z-index: 2; display: flex; gap: 12px; align-items: center;
           padding: 12px 20px; background: #111; border-bottom: 1px solid #2a2a2a; }
  header h1 { font-size: 15px; font-weight: 600; margin: 0; margin-right: auto; }
  button { font: inherit; color: inherit; background: #222; border: 1px solid #333;
           border-radius: 8px; padding: 6px 14px; cursor: pointer; }
  button:hover { background: #2c2c2c; }
  button:disabled { opacity: .45; cursor: default; }
  #publish { background: #1d4ed8; border-color: #1d4ed8; }
  #publish:hover { background: #2563eb; }
  #grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
          gap: 10px; padding: 20px; }
  #hiddenwrap { padding: 0 20px 28px; }
  #hiddenwrap h2 { font-size: 13px; font-weight: 600; color: #9ca3af; margin: 0 0 10px; }
  #hidden { display: flex; flex-wrap: wrap; gap: 8px; }
  #hidden .hcell { position: relative; }
  #hidden img { width: 84px; height: 84px; object-fit: cover; border-radius: 8px;
                opacity: .4; display: block; }
  #hidden .hcell:hover img { opacity: .8; }
  #hidden .restore { position: absolute; inset: 0; display: flex; align-items: center;
                     justify-content: center; font-size: 12px; opacity: 0; color: #fff; }
  #hidden .hcell:hover .restore { opacity: 1; }
  .cell { position: relative; border-radius: 10px; overflow: hidden; cursor: grab;
          border: 2px solid transparent; background: #1a1a1a; }
  .cell.dragging { opacity: .35; }
  .cell.target { border-color: #3b82f6; }
  .cell img { display: block; width: 100%; height: 140px; object-fit: cover; pointer-events: none; }
  .num { position: absolute; top: 4px; left: 6px; font-size: 11px; color: #fff;
         text-shadow: 0 1px 2px #000; }
  .dot { position: absolute; top: 6px; right: 6px; width: 8px; height: 8px; border-radius: 50%;
         background: #f59e0b; }
  .cell:hover .edit { opacity: 1; }
  .edit { position: absolute; inset: 0; opacity: 0; transition: opacity .12s; display: flex;
          align-items: center; justify-content: center; background: rgba(0,0,0,.55); }
  .edit span { pointer-events: none; }
  #dialog { position: fixed; inset: 0; display: none; align-items: center; justify-content: center;
            background: rgba(0,0,0,.7); z-index: 3; }
  #dialog.open { display: flex; }
  #dialog .box { width: min(420px, 90vw); background: #1a1a1a; border: 1px solid #333;
                 border-radius: 12px; padding: 16px; }
  #dialog img { max-height: 220px; max-width: 100%; border-radius: 8px; margin-bottom: 12px; }
  textarea { width: 100%; height: 70px; resize: vertical; font: inherit; color: inherit;
             background: #111; border: 1px solid #333; border-radius: 8px; padding: 8px; }
  #msg { font-size: 12px; color: #9ca3af; }
</style>
</head>
<body>
<header>
  <h1>input-gestures admin</h1>
  <span id="msg"></span>
  <button id="save">Save</button>
  <button id="publish" title="Save, commit, push — Cloudflare Pages will deploy">Publish</button>
</header>
<div id="grid"></div>
<div id="hiddenwrap" style="display:none">
  <h2>Hidden <span id="hcount"></span></h2>
  <div id="hidden"></div>
</div>
<div id="dialog"><div class="box">
  <img id="d-img">
  <textarea id="d-note" placeholder="note shown on hover + beside expanded image"></textarea>
  <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:12px">
    <button id="d-hide" style="margin-right:auto">Hide image</button>
    <button id="d-remove">Remove note</button>
    <button id="d-ok" style="background:#1d4ed8;border-color:#1d4ed8">Done</button>
  </div>
</div></div>
<script type="module">
const $ = (s) => document.querySelector(s);
let hidden = [], notes = {}, order = [], dirty = false;
let dragIdx = null, editing = null;

const res = await fetch("/api/state").then((r) => r.json());
order = res.images; hidden = res.hidden; notes = res.notes;

function render() {
  const grid = $("#grid");
  grid.innerHTML = "";
  order.forEach((name, i) => {
    const cell = document.createElement("div");
    cell.className = "cell";
    cell.draggable = true;
    cell.innerHTML =
      '<span class="num">' + (i + 1) + "</span>" +
      (notes[name] ? '<span class="dot"></span>' : "") +
      '<img src="/img/' + name + '" alt="">' +
      '<div class="edit"><span>' + (notes[name] ? "edit note" : "add note") + "</span></div>";
    cell.onclick = () => openDialog(name);
    cell.ondragstart = () => { dragIdx = i; cell.classList.add("dragging"); };
    cell.ondragend = () => { dragIdx = null; cell.classList.remove("dragging");
                             document.querySelectorAll(".cell").forEach((c) => c.classList.remove("target")); };
    cell.ondragover = (e) => { e.preventDefault(); cell.classList.add("target"); };
    cell.ondragleave = () => cell.classList.remove("target");
    cell.ondrop = (e) => {
      e.preventDefault();
      if (dragIdx === null || dragIdx === i) return;
      const [moved] = order.splice(dragIdx, 1);
      order.splice(i, 0, moved);
      dirty = true; render();
    };
    grid.appendChild(cell);
  });

  const wrap = $("#hiddenwrap"), hgrid = $("#hidden");
  wrap.style.display = hidden.length ? "block" : "none";
  $("#hcount").textContent = "(" + hidden.length + ")";
  hgrid.innerHTML = "";
  hidden.forEach((name) => {
    const cell = document.createElement("div");
    cell.className = "hcell";
    cell.innerHTML =
      '<img src="/img/' + name + '" alt="">' +
      '<div class="restore">restore</div>';
    cell.onclick = () => {
      hidden = hidden.filter((n) => n !== name);
      order.push(name);
      dirty = true; render();
    };
    hgrid.appendChild(cell);
  });
}

function openDialog(name) {
  editing = name;
  $("#d-img").src = "/img/" + name;
  $("#d-note").value = notes[name] || "";
  $("#dialog").classList.add("open");
  $("#d-note").focus();
}
function closeDialog() { $("#dialog").classList.remove("open"); editing = null; }
$("#d-ok").onclick = () => {
  const v = $("#d-note").value.trim();
  if (v) notes[editing] = v; else delete notes[editing];
  dirty = true; closeDialog(); render();
};
$("#d-remove").onclick = () => { delete notes[editing]; dirty = true; closeDialog(); render(); };
$("#d-hide").onclick = () => {
  const name = editing;
  order = order.filter((n) => n !== name);
  if (!hidden.includes(name)) hidden.push(name);
  dirty = true; closeDialog(); render();
};
$("#dialog").onclick = (e) => { if (e.target === $("#dialog")) closeDialog(); };

async function post(body) {
  const r = await fetch("/api/state", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(await r.text());
  return r.text();
}
function flash(t) { $("#msg").textContent = t; setTimeout(() => ($("#msg").textContent = ""), 4000); }

$("#save").onclick = async () => {
  await post({ notes, order, hidden, publish: false });
  dirty = false; flash("saved ✓");
};
$("#publish").onclick = async () => {
  if (!confirm("Commit + push to main? Cloudflare Pages will deploy.")) return;
  $("#publish").disabled = true; $("#msg").textContent = "pushing…";
  try {
    await post({ notes, order, hidden, publish: true });
    dirty = false; flash("pushed ✓ — deploying");
  } catch (e) { flash("failed: " + e.message); }
  $("#publish").disabled = false;
};

render();
</script>
</body>
</html>`;

createServer((req, res) => {
  const json = (code, body) => {
    res.writeHead(code, { "content-type": "application/json" });
    res.end(JSON.stringify(body));
  };
  if (req.method === "GET" && req.url === "/") {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(PAGE);
  } else if (req.method === "GET" && req.url === "/api/state") {
    json(200, state());
  } else if (req.method === "GET" && req.url.startsWith("/img/")) {
    const name = decodeURIComponent(req.url.slice(5));
    try {
      const buf = readFileSync(join(IMG_DIR, name));
      res.writeHead(200, { "content-type": "image/jpeg", "cache-control": "no-cache" });
      res.end(buf);
    } catch {
      res.writeHead(404).end();
    }
  } else if (req.method === "POST" && req.url === "/api/state") {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      try {
        const { notes, order, hidden, publish: doPublish } = JSON.parse(body);
        save({ notes, order, hidden });
        let gitOut = "";
        if (doPublish) gitOut = publish();
        json(200, { ok: true, gitOut });
      } catch (e) {
        json(500, { error: String(e.message || e) });
      }
    });
  } else {
    res.writeHead(404).end();
  }
}).listen(PORT, "127.0.0.1", () => {
  console.log(`input-gestures admin → http://127.0.0.1:${PORT}`);
});
