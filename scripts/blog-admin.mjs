#!/usr/bin/env node
/**
 * Local admin for /blog, /topics and /wiki — never deployed.
 *
 *   node scripts/blog-admin.mjs   (or: pnpm admin:blog)
 *
 * Serves http://127.0.0.1:4174 — CodeMirror markdown editor + live preview
 * rendered through the site's own pipeline (src/data/blog.ts settings).
 * Posts → content/<slug>.mdx, topics → content/topics/<slug>.md, wiki → content/wiki/<slug>.md.
 * Paste/drop images → public/{blog,topics,wiki}/<slug>/; drag an image's corner to size it (![alt|400](src)).
 * [[links]] between any notes (src/lib/notes.mjs): [[ autocompletes, ⌘-click follows, renames rewrite them.
 * Footnotes (src/lib/footnotes.mjs): ⌘⌥F adds one, ⌘↩ hops mark ↔ note, hover reads it — inline on the site too.
 * Publish button = git commit + push of that one entry (Cloudflare Pages deploys on push).
 * Trash button = `gio trash` the entry + its image folder (→ ~/.local/share/Trash, like nvim's <leader>dd). Not committed.
 */
import { createServer } from "http";
import { execFileSync } from "child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from "fs";
import { extname, join } from "path";
import matter from "gray-matter";
import rehypePrettyCode from "rehype-pretty-code";
import rehypeStringify from "rehype-stringify";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import { unified } from "unified";
import { footnoteOptions } from "../src/lib/footnotes.mjs";
import { WIKILINK, linkNotes, noteIndex, rehypeImageSize, resolveTarget, slugify } from "../src/lib/notes.mjs";

const ROOT = join(import.meta.dirname, "..");
const PUBLIC = join(ROOT, "public");
const FONTS = join(ROOT, "node_modules/geist/dist/fonts");
const LIB = join(ROOT, "src/lib");
const PORT = Number(process.env.PORT) || 4174;

const SLUG_RE = /^[A-Za-z0-9_-]+$/;
const MIME = {
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif",
  ".webp": "image/webp", ".avif": "image/avif", ".svg": "image/svg+xml",
  ".woff2": "font/woff2", ".mjs": "text/javascript; charset=utf-8", ".html": "text/html; charset=utf-8",
};

// Same pipeline as markdownToHTML in src/data/blog.ts
const pipeline = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkRehype, footnoteOptions)
  .use(rehypeImageSize)
  .use(rehypePrettyCode, { theme: { light: "min-light", dark: "min-dark" }, keepBackground: false })
  .use(rehypeStringify);
const render = async (md) => String(await pipeline.process(md));

const dateStr = (d) => (d instanceof Date ? d.toISOString().slice(0, 10) : String(d ?? ""));
const list = (v) => (Array.isArray(v) ? v.map(String) : v ? [String(v)] : []);
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\-]/g, "\\$&");

// What the admin edits. `own` = frontmatter keys the form owns; everything else is kept verbatim.
// `img` = public/<img>/<slug>/ for pasted images; `msg` = commit message prefix.
const KINDS = {
  post: { dir: "content", ext: ".mdx", img: "blog", msg: "blog", own: ["title", "publishedAt", "summary", "topics", "draft"] },
  topic: { dir: "content/topics", ext: ".md", img: "topics", msg: "topic", own: ["title", "summary", "pages"] },
  wiki: { dir: "content/wiki", ext: ".md", img: "wiki", msg: "wiki", own: ["title", "summary", "topics", "draft"] },
};
const kindOf = (k) => {
  if (!KINDS[k]) throw new Error("unknown kind: " + k);
  return KINDS[k];
};
const fileOf = (kind, slug) => `${KINDS[kind].dir}/${slug}${KINDS[kind].ext}`;
const slugsOf = (kind) => {
  const { dir, ext } = KINDS[kind];
  return existsSync(join(ROOT, dir)) ? readdirSync(join(ROOT, dir)).filter((f) => extname(f) === ext).map((f) => f.slice(0, -ext.length)) : [];
};
const allFiles = () => Object.keys(KINDS).flatMap((k) => slugsOf(k).map((s) => [k, s, fileOf(k, s)]));

const git = (...args) => execFileSync("git", args, { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });

/** Uncommitted state per content file: "new" (never committed), "changed", "deleted". */
function gitState() {
  const out = new Map();
  try {
    for (const line of git("status", "--porcelain", "--untracked-files=all", "--", "content").split("\n")) {
      if (!line.trim()) continue;
      const xy = line.slice(0, 2), path = line.slice(3).split(" -> ").pop().replace(/^"|"$/g, "");
      out.set(path, /\?|A/.test(xy) ? "new" : /D/.test(xy) ? "deleted" : "changed");
    }
  } catch {}
  return out;
}
/** kind + slug for a content path, or null. */
function kindOfFile(path) {
  for (const [k, { dir, ext }] of Object.entries(KINDS)) {
    if (path.startsWith(dir + "/") && path.endsWith(ext) && !path.slice(dir.length + 1).includes("/")) return [k, path.slice(dir.length + 1, -ext.length)];
  }
  return null;
}

/** Sidebar rows. kind "all" = every kind. Deleted-but-uncommitted files appear as ghost rows so the deletion can be published. */
function listEntries(kind) {
  const kinds = kind === "all" ? Object.keys(KINDS) : [kindOf(kind) && kind];
  const state = gitState();
  const rows = kinds.flatMap((k) => slugsOf(k).map((slug) => {
    const file = fileOf(k, slug), path = join(ROOT, file);
    const { data, content } = matter(readFileSync(path, "utf8"));
    return {
      kind: k, slug, title: data.title || slug, summary: String(data.summary ?? ""), publishedAt: dateStr(data.publishedAt), draft: !!data.draft,
      topics: list(data.topics), pages: list(data.pages), mtime: statSync(path).mtimeMs,
      words: (content.match(/\S+/g) || []).length, git: state.get(file) || "",
    };
  }));
  for (const [file, s] of state) {
    const ks = s === "deleted" && kindOfFile(file);
    if (ks && kinds.includes(ks[0]) && !existsSync(join(ROOT, file)))
      rows.push({ kind: ks[0], slug: ks[1], title: ks[1], summary: "", publishedAt: "", draft: false, topics: [], pages: [], mtime: 0, words: 0, git: "deleted", deleted: true });
  }
  return rows;
}

/** Sets one frontmatter key in place (minimal diff). value "" removes it. */
function editKey(kind, slug, key, value) {
  const path = join(ROOT, fileOf(kind, slug));
  const text = readFileSync(path, "utf8");
  const out = text.replace(/^---\n[\s\S]*?\n---/, (fm) => setKey(fm, key, value));
  if (out === text) return false;
  writeFileSync(path, out);
  return true;
}

/** Bulk actions from the sidebar selection. Returns { done, skipped, files, gitOut }. */
function bulk({ action, items = [], topic }) {
  const done = [], skipped = [], files = new Set();
  for (const { kind, slug } of items) {
    kindOf(kind);
    if (!SLUG_RE.test(slug)) throw new Error("bad slug: " + slug);
  }
  const live = items.filter(({ kind, slug }) => existsSync(join(ROOT, fileOf(kind, slug))));
  const skip = (it, why) => skipped.push(`${it.slug} (${why})`);
  if (action === "draft" || action === "undraft") {
    for (const it of live) {
      if (it.kind === "topic") { skip(it, "topics can't be drafts"); continue; }
      if (editKey(it.kind, it.slug, "draft", action === "draft" ? "draft: true" : "")) files.add(fileOf(it.kind, it.slug));
      done.push(it);
    }
  } else if (action === "tag" || action === "untag") {
    if (!slugsOf("topic").includes(topic)) throw new Error(`no topic "${topic}"`);
    for (const it of live) {
      if (it.kind === "topic") { skip(it, "is a topic"); continue; }
      const was = readEntry(it.kind, it.slug);
      const on = action === "tag";
      const topics = on ? (was.topics.includes(topic) ? was.topics : [...was.topics, topic]) : was.topics.filter((t) => t !== topic);
      if (editKey(it.kind, it.slug, "topics", topics.length ? `topics: [${topics.join(", ")}]` : "")) files.add(fileOf(it.kind, it.slug));
      for (const f of syncTopics({ ...it, topics }, was)) files.add(f);
      done.push(it);
    }
  } else if (action === "trash") {
    for (const it of live) { trashEntry(it.kind, it.slug).forEach((f) => files.add(f)); done.push(it); }
  } else if (action === "publish") {
    const paths = [], names = [];
    for (const it of items) {
      const K = KINDS[it.kind];
      paths.push(fileOf(it.kind, it.slug), `public/${K.img}/${it.slug}`);
      names.push(existsSync(join(ROOT, fileOf(it.kind, it.slug))) ? readEntry(it.kind, it.slug).title || it.slug : it.slug + " (deleted)");
      done.push(it);
    }
    const msg = items.length === 1 ? `${KINDS[items[0].kind].msg}: ${names[0]}`
      : `writing: ${names.length} notes — ${names.slice(0, 4).join(", ")}${names.length > 4 ? ", …" : ""}`;
    return { done, skipped, files: [], gitOut: commitPaths(paths, msg) };
  } else throw new Error("unknown action: " + action);
  return { done, skipped, files: [...files], gitOut: "" };
}

function readEntry(kind, slug) {
  kindOf(kind);
  const { data, content } = matter(readFileSync(join(ROOT, fileOf(kind, slug)), "utf8"));
  return {
    kind, slug, title: data.title ?? "", summary: data.summary ?? "", publishedAt: dateStr(data.publishedAt),
    draft: !!data.draft, topics: list(data.topics), pages: list(data.pages), body: content.replace(/^\n+/, ""),
  };
}

/** Raw frontmatter text minus the keys the editor owns (and their indented continuation lines). */
function extraFrontmatter(kind, slug) {
  const raw = readFileSync(join(ROOT, fileOf(kind, slug)), "utf8").match(/^---\n([\s\S]*?)\n---/)?.[1] ?? "";
  const own = new RegExp(`^(${KINDS[kind].own.join("|")}):`);
  let skipping = false;
  const kept = raw.split("\n").filter((line) => {
    if (/^[\s-]/.test(line)) return !skipping; // continuation of the key above
    skipping = own.test(line);
    return !skipping;
  });
  const text = kept.join("\n").trim();
  return text ? text + "\n" : "";
}

/** Slugs in the form that don't exist on disk — returned as warnings, not errors. */
function unknownRefs({ kind, topics = [], pages = [] }) {
  const out = [];
  if (kind !== "topic") {
    const known = new Set(slugsOf("topic"));
    out.push(...topics.filter((t) => !known.has(t)).map((t) => `no topic "${t}"`));
  } else {
    const known = new Set([...slugsOf("wiki"), ...slugsOf("post")]);
    out.push(...pages.filter((p) => !known.has(p)).map((p) => `no wiki page or post "${p}"`));
  }
  return out;
}

/** Notes that link to (or list / tag) kind/slug. */
function backlinks(kind, slug) {
  const notes = noteIndex(ROOT);
  const target = notes.find((n) => n.kind === kind && n.slug === slug);
  if (!target) return [];
  return notes.flatMap((n) => {
    if (n === target) return [];
    const { data, content } = matter(readFileSync(join(ROOT, fileOf(n.kind, n.slug)), "utf8"));
    const linked = Array.from(content.matchAll(WIKILINK)).some((m) => resolveTarget(m[1], notes) === target);
    const listed = n.kind === "topic" && kind !== "topic" && list(data.pages).includes(slug);
    const tagged = kind === "topic" && n.kind !== "topic" && list(data.topics).includes(slug);
    if (!linked && !listed && !tagged) return [];
    const why = linked ? n.summary : listed ? "lists it in its pages" : "tagged with this topic";
    return [{ kind: n.kind, slug: n.slug, title: n.title, summary: why }];
  });
}

/** After kind/oldSlug → newSlug: rewrite [[links]], topic page lists and topic tags everywhere. Returns changed files. */
function rewriteRefs(kind, oldSlug, newSlug, before) {
  const was = before.find((n) => n.kind === kind && n.slug === oldSlug);
  const changed = [];
  for (const [k, , file] of allFiles()) {
    const text = readFileSync(join(ROOT, file), "utf8");
    let out = text.replace(WIKILINK, (whole, target, label) => {
      if (!was || resolveTarget(target, before) !== was) return whole;
      const prefix = target.trim().match(/^([a-z]+)\//)?.[1];
      return `[[${prefix ? prefix + "/" : ""}${newSlug}${label !== undefined ? "|" + label : ""}]]`;
    });
    out = out.replace(/^---\n[\s\S]*?\n---/, (fm) => {
      if (k === "topic" && kind !== "topic") return fm.replace(new RegExp(`^(\\s*-\\s*)${esc(oldSlug)}\\s*$`, "gm"), `$1${newSlug}`);
      if (k !== "topic" && kind === "topic")
        return fm.replace(/^topics:.*$/m, (line) => line.replace(new RegExp(`(?<=[\\[,\\s])${esc(oldSlug)}(?=[\\],\\s]|$)`, "g"), newSlug));
      return fm;
    });
    if (out !== text) {
      writeFileSync(join(ROOT, file), out);
      changed.push(file);
    }
  }
  return changed;
}

/** Frontmatter `key:` (and its "  - item" lines) set to `value`, removed when value is "", appended when missing. */
function setKey(fm, key, value) {
  const re = new RegExp(`^${key}:.*(?:\\n[ \\t]+-.*)*`, "m");
  if (re.test(fm)) return value ? fm.replace(re, () => value) : fm.replace(new RegExp(re.source + "\\n", "m"), "");
  return value ? fm.replace(/\n---$/, () => `\n${value}\n---`) : fm;
}

/**
 * Topic tags and topic page lists stay in step, both ways:
 * tagging a note appends it to the topic's pages (untagging drops it); listing a page on a topic tags it (unlisting untags).
 * `was` = the entry as it was on disk. Returns changed files.
 */
function syncTopics({ kind, slug, topics = [], pages = [] }, was) {
  const changed = [];
  const edit = (k, s, key, fn) => {
    const file = fileOf(k, s), path = join(ROOT, file);
    const text = readFileSync(path, "utf8");
    const out = text.replace(/^---\n[\s\S]*?\n---/, (fm) => setKey(fm, key, fn(readEntry(k, s))));
    if (out !== text) { writeFileSync(path, out); changed.push(file); }
  };
  const toggle = (xs, x, on) => (on ? (xs.includes(x) ? xs : [...xs, x]) : xs.filter((y) => y !== x));
  const diff = (now, before) => [...now.filter((x) => !before.includes(x)).map((x) => [x, true]), ...before.filter((x) => !now.includes(x)).map((x) => [x, false])];
  if (kind !== "topic") {
    const known = slugsOf("topic");
    for (const [t, on] of diff(topics, was.topics)) {
      if (!known.includes(t)) continue;
      edit("topic", t, "pages", (e) => { const xs = toggle(e.pages, slug, on); return xs.length ? ["pages:", ...xs.map((p) => `  - ${p}`)].join("\n") : "pages: []"; });
    }
  } else {
    for (const [s, on] of diff(pages, was.pages)) {
      const k = ["wiki", "post"].find((k) => slugsOf(k).includes(s));
      if (!k) continue;
      edit(k, s, "topics", (e) => { const xs = toggle(e.topics, slug, on); return xs.length ? `topics: [${xs.join(", ")}]` : ""; });
    }
  }
  return changed;
}

/** Writes the entry. Returns the body as written (image URLs follow a slug rename). */
function writeEntry({ kind, slug, prevSlug, title, summary, publishedAt, draft, topics = [], pages = [], body }) {
  const K = kindOf(kind);
  if (!SLUG_RE.test(slug)) throw new Error("slug: letters, numbers, - and _ only");
  const file = join(ROOT, fileOf(kind, slug));
  const prev = prevSlug && prevSlug !== slug ? join(ROOT, fileOf(kind, prevSlug)) : null;
  if ((prev || !prevSlug) && existsSync(file)) throw new Error(`${fileOf(kind, slug)} already exists`);

  // slug renamed — images move with it, so point the body at the new folder
  const oldImgs = prev ? join(PUBLIC, K.img, prevSlug) : null;
  const moveImgs = oldImgs && existsSync(oldImgs) && !existsSync(join(PUBLIC, K.img, slug));
  if (moveImgs) body = body.replaceAll(`/${K.img}/${prevSlug}/`, `/${K.img}/${slug}/`);

  // keep frontmatter the editor doesn't know about (gallery, image, …) verbatim
  const extra = prevSlug ? extraFrontmatter(kind, prevSlug) : "";
  const inline = (xs) => `[${xs.join(", ")}]`;
  const fm = [`title: ${JSON.stringify(title)}`];
  if (kind === "post") fm.push(`publishedAt: ${JSON.stringify(publishedAt)}`);
  fm.push(`summary: ${JSON.stringify(summary)}`);
  if (kind !== "topic" && topics.length) fm.push(`topics: ${inline(topics)}`);
  if (kind === "topic") fm.push(pages.length ? ["pages:", ...pages.map((p) => `  - ${p}`)].join("\n") : "pages: []");
  if (kind !== "topic" && draft) fm.push("draft: true");
  mkdirSync(join(ROOT, K.dir), { recursive: true });
  writeFileSync(file, `---\n${fm.join("\n")}\n${extra}---\n\n${body.trim()}\n`);

  if (prev) {
    unlinkSync(prev); // new file already written
    if (moveImgs) renameSync(oldImgs, join(PUBLIC, K.img, slug));
  }
  return body;
}

/** Moves the entry and its image folder to the desktop trash (restore: file manager or `gio trash --restore`). */
function trashEntry(kind, slug) {
  const K = kindOf(kind);
  if (!SLUG_RE.test(slug)) throw new Error("bad slug");
  const paths = [join(ROOT, fileOf(kind, slug)), join(PUBLIC, K.img, slug)].filter((p) => existsSync(p));
  if (!existsSync(paths[0] ?? "")) throw new Error(`${fileOf(kind, slug)} doesn't exist`);
  execFileSync("gio", ["trash", ...paths], { stdio: ["ignore", "pipe", "pipe"] });
  return paths.map((p) => p.slice(ROOT.length + 1));
}

/** Commits just these paths (additions, edits and deletions) and pushes. */
function commitPaths(paths, msg) {
  const tracked = [...new Set(paths)].filter((p) => existsSync(join(ROOT, p)) || git("ls-files", "--", p).trim());
  if (!tracked.length) return "nothing to commit";
  git("add", "-A", "--", ...tracked);
  if (!git("diff", "--cached", "--name-only", "--", ...tracked).trim()) return "nothing to commit";
  git("commit", "--no-verify", "-m", msg, "--", ...tracked);
  return git("push") || "pushed";
}

function publish(kind, slug, prevSlug, title, alsoFiles = []) {
  const K = kindOf(kind);
  const paths = [fileOf(kind, slug), ...alsoFiles, `public/${K.img}/${slug}`];
  if (prevSlug && prevSlug !== slug) paths.push(fileOf(kind, prevSlug), `public/${K.img}/${prevSlug}`);
  return commitPaths(paths, `${K.msg}: ${title || slug}`);
}

const readBody = (req) =>
  new Promise((ok, fail) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => ok(Buffer.concat(chunks)));
    req.on("error", fail);
  });

function serveFile(res, path) {
  try {
    const buf = readFileSync(path);
    res.writeHead(200, { "content-type": MIME[extname(path).toLowerCase()] || "application/octet-stream", "cache-control": "no-cache" });
    res.end(buf);
  } catch {
    res.writeHead(404).end();
  }
}

const PAGE = String.raw`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>writing admin</title>
<style>
  @font-face { font-family: Geist; src: url(/fonts/geist-sans/Geist-Variable.woff2) format("woff2"); font-weight: 100 900; }
  @font-face { font-family: "Geist Mono"; src: url(/fonts/geist-mono/GeistMono-Variable.woff2) format("woff2"); font-weight: 100 900; }
  /* tokens copied from src/app/globals.css */
  :root {
    --bg: hsl(0 0% 99%); --fg: hsl(0 0% 10%); --muted: hsl(0 0% 40%); --soft: hsl(40 15% 92%);
    --border: hsl(0 0% 88%); --accent: #1d4ed8; --panel: hsl(40 20% 97.5%); --warn: #d97706; --bad: #dc2626;
    --shadow: 0 12px 40px -8px rgb(0 0 0 / .22), 0 2px 6px rgb(0 0 0 / .06);
    color-scheme: light;
  }
  /* light by default; ☀/☾ button switches */
  :root[data-theme="dark"] {
    --bg: hsl(0 0% 7%); --fg: hsl(0 0% 92%); --muted: hsl(0 0% 64%); --soft: hsl(0 0% 16%);
    --border: hsl(0 0% 20%); --accent: #60a5fa; --panel: hsl(0 0% 9%); --warn: #f59e0b; --bad: #f87171;
    --shadow: 0 12px 40px -8px rgb(0 0 0 / .7), 0 0 0 1px hsl(0 0% 18%);
    color-scheme: dark;
  }
  pre[data-theme] span { color: var(--shiki-light); }
  :root[data-theme="dark"] pre[data-theme] span { color: var(--shiki-dark); }
  * { box-sizing: border-box; }
  html, body { height: 100%; }
  body { margin: 0; font: 14px/1.45 Geist, system-ui, sans-serif; background: var(--bg); color: var(--fg);
         display: grid; grid-template-columns: 272px 1fr; overflow: hidden; transition: grid-template-columns .18s ease; }
  body.nosidebar, body.zen { grid-template-columns: 0 1fr; }
  button, input { font: inherit; color: inherit; }
  button { background: transparent; border: 1px solid var(--border); border-radius: 8px; padding: 5px 12px; cursor: pointer; }
  button:hover { background: var(--soft); }
  button:disabled { opacity: .45; cursor: default; }
  button.primary { background: var(--fg); color: var(--bg); border-color: var(--fg); }
  button.primary:hover { opacity: .85; }
  button.icon { padding: 6px 8px; }
  button svg { width: 16px; height: 16px; display: block; flex: none; }
  button.icon svg { color: var(--muted); }
  button.icon:hover svg, button.icon.on svg { color: var(--fg); }
  body.dirty #save svg { color: var(--warn); }
  button.primary { display: inline-flex; align-items: center; gap: 6px; }
  #theme .to-light, [data-theme="dark"] #theme .to-dark { display: none; }
  [data-theme="dark"] #theme .to-light { display: block; }
  kbd { font: 11px "Geist Mono", monospace; color: var(--muted); border: 1px solid var(--border); border-radius: 4px; padding: 0 4px; }

  /* sidebar */
  aside { border-right: 1px solid var(--border); background: var(--panel); display: flex; flex-direction: column; min-width: 0; overflow: hidden; }
  aside .top { display: flex; align-items: center; justify-content: space-between; padding: 14px 14px 10px; }
  aside .top b { font-size: 13px; font-weight: 600; }
  #kinds { margin: 0 14px 8px; display: flex; flex: none; }
  #kinds button { flex: 1; }
  #filter { margin: 0 14px 8px; border: 1px solid var(--border); border-radius: 7px; background: var(--bg); padding: 5px 8px; font-size: 13px; outline: none; }
  #filter:focus { border-color: var(--muted); }
  #posts { overflow-y: auto; padding: 0 8px 16px; flex: 1; min-height: 0; }
  /* row: [checkbox] title / meta — the box shows on hover, and on every row once anything is selected */
  .post { display: grid; grid-template-columns: 18px minmax(0, 1fr); gap: 0 6px; align-items: start; width: 100%; text-align: left;
          border: 0; border-radius: 7px; padding: 7px 8px 7px 4px; outline: none; }
  .post.active { background: var(--soft); }
  .post.sel { background: color-mix(in srgb, var(--accent) 11%, transparent); }
  .post.sel.active { background: color-mix(in srgb, var(--accent) 18%, transparent); }
  .post:focus-visible { box-shadow: inset 0 0 0 1.5px var(--muted); }
  .post .t { display: flex; align-items: center; gap: 6px; min-width: 0; }
  .post .t span { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  body.dirty .post.active .t span::before { content: "● "; color: var(--warn); }
  .post .d { grid-column: 2; display: flex; gap: 6px; font-size: 11.5px; color: var(--muted); min-width: 0; }
  .post .d .m { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .post .d .ago { margin-left: auto; flex: none; opacity: .75; font-variant-numeric: tabular-nums; }
  .post.deleted .t span { text-decoration: line-through; color: var(--muted); }
  .ck { width: 14px; height: 14px; margin-top: 3px; border: 1.5px solid var(--border); border-radius: 4px; flex: none; cursor: pointer;
        display: grid; place-items: center; background: var(--bg); opacity: 0; transition: opacity .1s; }
  .post:hover .ck, .post:focus-visible .ck, body.selecting .post .ck, #listhead .ck { opacity: 1; }
  .ck:hover { border-color: var(--muted); }
  .ck.on, .ck.some { background: var(--accent); border-color: var(--accent); }
  .ck.on::after { content: ""; width: 7px; height: 4px; border: 2px solid #fff; border-top: 0; border-right: 0; transform: translateY(-1px) rotate(-45deg); }
  .ck.some::after { content: ""; width: 7px; height: 2px; background: #fff; border-radius: 1px; }
  /* git state: amber = edited since last publish, blue = never published */
  .gs { width: 6px; height: 6px; border-radius: 50%; flex: none; }
  .gs.changed { background: var(--warn); }
  .gs.new { background: var(--accent); }
  .gs.deleted { background: var(--bad); }
  .badge { font-size: 10px; text-transform: uppercase; letter-spacing: .04em; border: 1px solid var(--border);
           border-radius: 4px; padding: 0 4px; color: var(--muted); flex: none; line-height: 1.4; }
  /* filter chips: status row + topic row under the filter box */
  .chips { margin: -2px 12px 6px; display: flex; flex-wrap: wrap; gap: 1px; }
  .chips:empty { display: none; }
  .chips button { border: 0; border-radius: 999px; padding: 1px 6px; font-size: 11.5px; color: var(--muted); display: inline-flex; align-items: center; gap: 3px; }
  .chips button.on { background: var(--soft); color: var(--fg); }
  .chips button i { font-style: normal; opacity: .6; }
  #statusbar { padding-bottom: 4px; }
  #statusbar:has(+ #topicbar:not(:empty)) { border-bottom: 1px dashed var(--border); margin-bottom: 6px; padding-bottom: 6px; }
  #listhead { display: flex; align-items: center; gap: 8px; margin: 0 8px 2px; padding: 4px 8px 4px 6px; font-size: 11.5px; color: var(--muted); }
  #listhead .ck { margin-top: 0; }
  #count { flex: 1; }
  #sort { border: 0; padding: 1px 6px; font-size: 11.5px; color: var(--muted); }
  #sort:hover { color: var(--fg); }
  /* bulk bar: takes the foot of the sidebar while something is selected */
  #bulk { position: relative; margin: 0 8px 8px; padding: 8px; border: 1px solid var(--border); border-radius: 10px; background: var(--bg); box-shadow: var(--shadow); }
  #bulk[hidden] { display: none; }
  #bulk:not([hidden]) ~ .keyhelp { display: none; }
  .bk-top { display: flex; align-items: baseline; gap: 6px; padding: 0 2px 8px; font-size: 12.5px; }
  .bk-top b { font-weight: 600; }
  #bk-hidden { color: var(--muted); font-size: 11.5px; }
  #bk-clear { margin-left: auto; border: 0; padding: 0 4px; font-size: 11.5px; color: var(--muted); }
  .bk-acts { display: flex; gap: 4px; }
  .bk-acts button { padding: 4px 8px; font-size: 12.5px; white-space: nowrap; }
  .bk-acts button.primary { margin-left: auto; }
  #bk-trash:hover svg { color: var(--bad); }
  #bk-menu { top: auto; bottom: calc(100% + 4px); left: 0; right: 0; margin: 0; max-height: 50vh; }
  #bk-menu .row .ck { opacity: 1; margin-top: 0; }
  #bk-menu .row { align-items: center; }
  #bk-menu .hint { padding: 4px 10px 6px; font-size: 11px; color: var(--muted); }
  .empty-list { padding: 14px 10px; font-size: 12.5px; color: var(--muted); }
  /* shortcuts: a ⌨ button at the foot of the sidebar; the list pops up on hover / focus */
  aside .keyhelp { margin-top: auto; padding: 6px 10px 10px; position: relative; }
  aside .keyhelp > button { border: 0; font-size: 11.5px; color: var(--muted); padding: 3px 6px; }
  aside .keys { position: absolute; left: 10px; right: 10px; bottom: 100%; padding: 10px 12px; font-size: 11.5px; color: var(--muted);
                background: var(--bg); border: 1px solid var(--border); border-radius: 8px; box-shadow: var(--shadow);
                display: grid; grid-template-columns: auto 1fr; gap: 4px 8px; align-items: center;
                opacity: 0; visibility: hidden; transform: translateY(4px); transition: opacity .12s, transform .12s, visibility .12s; }
  aside .keyhelp:hover .keys, aside .keyhelp:focus-within .keys { opacity: 1; visibility: visible; transform: none; }

  /* main: header / meta / panes on fixed rows so hiding meta never shuffles the grid */
  main { display: grid; grid-template-rows: auto auto minmax(0, 1fr); min-width: 0; min-height: 0; position: relative; }
  header { grid-row: 1; display: flex; gap: 8px; align-items: center; padding: 10px 16px; border-bottom: 1px solid var(--border); background: var(--bg); }
  #crumb { display: none; min-width: 0; max-width: 34ch; font-size: 13px; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  #crumb span { color: var(--muted); font-weight: 400; }
  body.nometa #crumb, body.zen #crumb { display: block; }
  #msg { margin-right: auto; font-size: 12px; color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  /* unsaved: amber pill in the header, amber Save, ● on the sidebar row and the tab title */
  #dirty { display: none; flex: none; align-items: center; gap: 6px; font-size: 12px; font-weight: 500; color: var(--warn);
           border: 1px solid color-mix(in srgb, var(--warn) 45%, transparent); background: color-mix(in srgb, var(--warn) 10%, transparent);
           border-radius: 999px; padding: 2px 10px 2px 8px; }
  #dirty::before { content: ""; width: 7px; height: 7px; border-radius: 50%; background: var(--warn); }
  body.dirty #dirty { display: inline-flex; }
  body.dirty #save { border-color: var(--warn); color: var(--warn); font-weight: 600; }
  body:not(.dirty) #save { opacity: .45; }
  #backs { font-size: 12px; color: var(--muted); padding: 4px 9px; }
  .seg { display: inline-flex; border: 1px solid var(--border); border-radius: 8px; overflow: hidden; }
  .seg button { border: 0; border-radius: 0; padding: 5px 10px; }
  .seg button.on { background: var(--soft); }
  #trash:hover svg { color: var(--bad); }
  #togglemeta.on, #zenbtn.on, #spellbtn.on { background: var(--soft); }

  #meta { grid-row: 2; display: grid; grid-template-columns: 1fr 1fr 130px auto; gap: 8px; padding: 10px 16px; border-bottom: 1px solid var(--border); }
  body.nometa #meta, body.zen #meta { display: none; }
  #meta label { display: flex; flex-direction: column; gap: 3px; font-size: 11px; color: var(--muted); }
  #meta label.check { flex-direction: row; align-items: center; gap: 6px; padding-top: 14px; font-size: 13px; color: var(--fg); }
  #meta input[type=text], #meta input[type=date] { width: 100%; background: transparent; border: 1px solid var(--border);
      border-radius: 7px; padding: 6px 8px; font-size: 13.5px; outline: none; }
  #meta input:focus { border-color: var(--muted); }
  #meta .wide { grid-column: 1 / -1; }
  body:not(.kind-post) #meta { grid-template-columns: 1fr 1fr; }
  body.kind-wiki #meta { grid-template-columns: 1fr 1fr auto; }
  body:not(.kind-post) .only-post, body.kind-topic .no-topic, body:not(.kind-topic) .only-topic { display: none !important; }
  .refs { font-size: 11px; color: var(--muted); }
  .page .notes-h { margin: 56px 0 0; padding-bottom: 12px; border-bottom: 1px solid var(--border); font-size: .875rem; font-weight: 500; }
  .page .notes { list-style: none; margin: 0; padding: 0; }
  .page .notes li { padding: 14px 0; border-bottom: 1px solid var(--border); }
  .page .notes li span { color: var(--muted); }
  .page .notes li.missing { color: var(--bad); }
  .page .notes a { color: inherit; text-decoration: none; display: block; }
  .page .notes a:hover b { text-decoration: underline; text-underline-offset: 4px; }
  .page .notes b { font-weight: 500; }
  .page .notes small { display: block; color: var(--muted); font-size: .85rem; margin-top: 2px; }
  #p-backs-wrap { margin-top: 64px; background: var(--panel); border: 1px solid var(--border); border-radius: 10px; padding: 4px 18px 2px; }
  #p-backs-wrap .notes-h { margin: 0; padding: 12px 0; }
  #p-backs li:last-child { border-bottom: 0; }
  body.kind-topic .prose { margin-top: 24px; color: var(--muted); }
  #meta .slugwrap { grid-column: 1 / -1; display: flex; align-items: center; gap: 6px; font-size: 12px; color: var(--muted); }
  #meta .slugwrap input { border: 0 !important; padding: 0 !important; font: 12px "Geist Mono", monospace !important; color: var(--fg); width: auto !important; flex: 1; }

  #panes { grid-row: 3; display: grid; grid-template-columns: 1fr 0; min-height: 0; }
  body.mode-preview #panes { grid-template-columns: 0 1fr; }
  #editor, #preview { min-height: 0; overflow: hidden; }
  #editor .cm-editor { height: 100%; outline: none !important; }
  #editor .cm-scroller { font: 1.0625rem/1.8 Geist, system-ui, sans-serif; padding: 48px 0 40vh; }
  #editor .cm-content { box-sizing: border-box; width: 100%; max-width: 42rem; margin: 0 auto; padding: 0 28px; caret-color: var(--fg); }
  #editor .cm-line { padding: 0; }
  #editor .cm-prose-gap { line-height: 1.25em; }
  #editor .cm-prose-heading { letter-spacing: -.025em; line-height: 1.3; font-weight: 600; padding-top: .6em; padding-bottom: .3em; }
  #editor .cm-prose-h1 { font-size: 2.1em; font-weight: 800; }
  #editor .cm-prose-h2 { font-size: 1.5em; font-weight: 700; }
  #editor .cm-prose-h3 { font-size: 1.25em; }
  #editor .cm-prose-quote { border-left: 1px solid var(--border); padding-left: 1.25rem; color: var(--muted); }
  #editor .cm-prose-list { padding-left: 1.6em; text-indent: -1.6em; line-height: 1.625; padding-top: .25rem; padding-bottom: .25rem; }
  #editor .cm-prose-code { font: .875em/1.7 "Geist Mono", monospace; background: var(--panel); padding-left: 1.2em; padding-right: 1.2em; }
  #editor .cm-prose-inline-code, #editor .cm-prose-inline-code * { color: var(--fg) !important; }
  #editor .cm-prose-inline-code { font: .875em "Geist Mono", monospace; font-weight: 600; }
  #editor .cm-prose-link { color: inherit; text-decoration: underline; text-decoration-color: var(--border); text-underline-offset: 4px; }
  #editor .cm-prose-bullet { display: inline-block; width: 1.6em; text-indent: 0; text-align: center; }
  #editor .cm-prose-rule { display: inline-block; width: 100%; border-top: 1px solid var(--border); vertical-align: middle; }
  body.mode-source #editor .cm-scroller { font: 15px/1.7 "Geist Mono", ui-monospace, monospace; padding-top: 28px; }
  body.mode-source #editor .cm-content { max-width: 72ch; }
  #editor .cm-cursor { border-left: 2px solid var(--fg); }
  #editor .cm-selectionBackground, #editor .cm-focused .cm-selectionBackground { background: color-mix(in srgb, var(--accent) 22%, transparent) !important; }
  #editor .cm-activeLine { background: transparent; }
  #editor .cm-placeholder { color: var(--muted); }
  #editor.drop { outline: 2px dashed var(--accent); outline-offset: -8px; }
  #preview { overflow-y: auto; }

  /* [[wiki links]] in the editor */
  #editor .cm-wl, #editor .cm-wl * { color: var(--accent) !important; text-decoration: none !important; }
  #editor .cm-wl { border-bottom: 1px solid color-mix(in srgb, var(--accent) 35%, transparent); }
  #editor .cm-wl.missing, #editor .cm-wl.missing * { color: var(--bad) !important; }
  #editor .cm-wl.missing { border-bottom: 1px dashed var(--bad); }
  #editor .cm-wl-br, #editor .cm-wl-br * { color: var(--muted) !important; opacity: .55; }
  body.modkey #editor .cm-wl { cursor: pointer; border-bottom-width: 2px; }

  /* [^1] footnotes in the editor */
  #editor .cm-fn, #editor .cm-fn * { color: var(--accent) !important; text-decoration: none !important; }
  #editor .cm-fn { font: .78em "Geist Mono", monospace; vertical-align: .3em; }
  #editor .cm-fn.def { vertical-align: baseline; font-size: .85em; }
  #editor .cm-fn.missing, #editor .cm-fn.missing * { color: var(--bad) !important; }
  body.modkey #editor .cm-fn { cursor: pointer; text-decoration: underline !important; }
  .fn-tip { max-height: 260px; overflow-y: auto; white-space: pre-wrap; }

  /* tooltips + [[ autocomplete */
  #editor .cm-tooltip { background: var(--bg); color: var(--fg); border: 1px solid var(--border); border-radius: 10px; box-shadow: var(--shadow); overflow: hidden; }
  #editor .cm-tooltip-autocomplete > ul { font: 13.5px Geist, system-ui, sans-serif; max-height: 18em; min-width: 300px; padding: 4px; }
  #editor .cm-tooltip-autocomplete > ul > li { padding: 5px 10px; border-radius: 6px; display: flex; gap: 10px; align-items: baseline; }
  #editor .cm-tooltip-autocomplete > ul > li[aria-selected] { background: var(--soft); color: var(--fg); }
  #editor .cm-completionLabel { flex: 1; }
  #editor .cm-completionDetail { font: 11.5px "Geist Mono", monospace; color: var(--muted); font-style: normal; }
  #editor .cm-completionIcon { display: none; }
  #editor .cm-completionMatchedText { text-decoration: none; font-weight: 600; }
  .wl-tip { padding: 10px 12px; max-width: 320px; font: 13px/1.45 Geist, system-ui, sans-serif; }
  .wl-tip b { display: block; font-weight: 600; font-size: 14px; }
  .wl-tip p { margin: 4px 0 0; color: var(--muted); }
  .wl-tip small { display: block; margin-top: 8px; color: var(--muted); font-size: 11px; }
  .wl-tip.missing b { color: var(--bad); }
  #editor .cm-typo { text-decoration: underline wavy var(--bad) 1px; text-underline-offset: 3px; text-decoration-skip-ink: none; }

  /* images in the editor: live, resizable */
  .cm-img { padding: 6px 0 12px; user-select: none; }
  .cm-img-box { position: relative; margin: 0 auto; width: fit-content; max-width: 100%; }
  .cm-img-box img { display: block; max-width: 100%; max-height: 26rem; border-radius: 6px; }
  .cm-img-box.sized img { width: 100%; max-height: none; }
  .cm-img-box.broken { padding: 10px 14px; border: 1px dashed var(--border); border-radius: 6px; font: 12px Geist, sans-serif; color: var(--muted); }
  .rs-handle { position: absolute; right: -7px; bottom: -7px; width: 16px; height: 16px; border-radius: 50%; background: var(--accent);
               border: 3px solid var(--bg); cursor: nwse-resize; opacity: 0; transition: opacity .12s; touch-action: none; }
  .rs-bar { position: absolute; top: 8px; right: 8px; display: flex; gap: 2px; padding: 2px; border-radius: 8px; background: color-mix(in srgb, var(--bg) 88%, transparent);
            backdrop-filter: blur(6px); box-shadow: var(--shadow); opacity: 0; transition: opacity .12s; font: 11.5px Geist, sans-serif; }
  .rs-bar button { border: 0; padding: 2px 7px; border-radius: 6px; font-size: 11.5px; }
  .rs-bar button.on { background: var(--soft); font-weight: 600; }
  .rs-size { position: absolute; left: 8px; bottom: 8px; font: 11px "Geist Mono", monospace; color: #fff; background: rgb(0 0 0 / .55);
             border-radius: 5px; padding: 1px 6px; opacity: 0; transition: opacity .12s; pointer-events: none; }
  .cm-img-box:hover .rs-handle, .cm-img-box:hover .rs-bar, .cm-img-box:hover .rs-size,
  .rs-wrap:hover .rs-handle, .rs-wrap:hover .rs-size, .resizing .rs-handle, .resizing .rs-size { opacity: 1; }
  .resizing { outline: 2px solid var(--accent); outline-offset: 2px; border-radius: 6px; }
  body.dragging, body.dragging * { cursor: nwse-resize !important; user-select: none !important; }

  /* preview ≈ src/app/blog/[slug]/page.tsx + .prose rules in globals.css */
  .page { max-width: 42rem; margin: 0 auto; padding: 48px 28px 40vh; }
  .page h1.title { font-size: 2.6rem; font-weight: 600; line-height: 1.08; letter-spacing: -0.045em; margin: 0; text-wrap: balance; }
  .page p.summary { margin: 20px 0 0; max-width: 36rem; font-size: 1.125rem; line-height: 2rem; color: var(--muted); }
  .prose { margin-top: 48px; max-width: 68ch; font-size: 1.0625rem; line-height: 1.8; }
  .prose > :first-child { margin-top: 0; }
  .prose p { margin: 1.25em 0; }
  .prose h1, .prose h2, .prose h3, .prose h4 { letter-spacing: -0.025em; line-height: 1.3; font-weight: 600; }
  .prose h1 { font-size: 2.1em; font-weight: 800; margin: 0 0 .9em; }
  .prose h2 { font-size: 1.5em; font-weight: 700; margin: 2em 0 1em; }
  .prose h3 { font-size: 1.25em; margin: 1.6em 0 .6em; }
  .prose a { color: inherit; text-decoration: underline; text-decoration-color: var(--border); text-underline-offset: 4px; }
  .prose a:hover { text-decoration-color: var(--fg); }
  .prose a.int { text-decoration-color: color-mix(in srgb, var(--accent) 45%, transparent); }
  .prose a.int:hover { text-decoration-color: var(--accent); }
  .prose a[href^="#missing:"] { color: var(--bad); text-decoration-style: dashed; text-decoration-color: var(--bad); }
  .prose blockquote { margin: 1.6em 0; border-left: 1px solid var(--border); padding-left: 1.25rem; color: var(--muted); }
  .prose ul, .prose ol { padding-left: 1.6em; margin: 1.25em 0; }
  .prose li { margin: .5rem 0; line-height: 1.625; }
  .prose img { display: block; margin: 0 auto; max-width: 100%; max-height: 26rem; width: auto; border-radius: 6px; }
  .prose .rs-wrap { display: block; position: relative; width: fit-content; max-width: 100%; margin: 0 auto; }
  .prose figure { margin: 1.6em 0; }
  .prose hr { border: 0; border-top: 1px solid var(--border); margin: 3em 0; }
  .prose strong { font-weight: 600; }
  .prose :not(pre) > code { font: .875em "Geist Mono", monospace; font-weight: 600; }
  .prose :not(pre) > code::before, .prose :not(pre) > code::after { content: "\0060"; }
  .prose pre { font: .875em/1.7 "Geist Mono", monospace; overflow-x: auto; padding: 1em 1.2em; border-radius: 6px; border: 1px solid var(--border); }
  .prose table { border-collapse: collapse; width: 100%; font-size: .9em; }
  .prose th, .prose td { border-bottom: 1px solid var(--border); padding: .5em .6em; text-align: left; }
  /* footnotes ≈ globals.css */
  .prose sup:has(> a[data-footnote-ref]) { font: .68em/0 "Geist Mono", monospace; vertical-align: super; padding-left: .1em; }
  .prose a[data-footnote-ref] { color: var(--muted); text-decoration: none; padding: 0 .15em; }
  .prose a[data-footnote-ref]:hover, .prose a[data-footnote-ref][aria-expanded="true"] { color: var(--fg); }
  .prose section[data-footnotes] { margin-top: 4rem; border-top: 1px solid var(--border); padding-top: 1.5rem; font-size: .9em; color: var(--muted); }
  .prose .footnotes-label { margin: 0 0 1rem; font-size: .875rem; font-weight: 500; text-transform: uppercase; letter-spacing: .08em; }
  .prose section[data-footnotes] li::marker { font: .85em "Geist Mono", monospace; }
  .prose section[data-footnotes] li.flash { color: var(--fg); }
  .prose a[data-footnote-backref] { text-decoration: none; }
  .fn-pop { position: fixed; z-index: 60; width: min(26rem, calc(100vw - 24px)); max-height: min(22rem, 55vh); overflow-y: auto;
            background: var(--bg); border: 1px solid var(--border); border-radius: 10px; box-shadow: var(--shadow);
            padding: 12px 16px; font: 14px/1.65 Geist, system-ui, sans-serif; }
  .fn-pop[hidden] { display: none; }
  .fn-pop-n { float: left; margin-right: 8px; font: 12px/1.65rem "Geist Mono", monospace; color: var(--muted); }
  .fn-pop p { margin: 0; }
  .fn-pop p + p, .fn-pop ul, .fn-pop ol, .fn-pop blockquote, .fn-pop pre { margin-top: .6rem; }
  .fn-pop ul, .fn-pop ol { padding-left: 1.25rem; }
  .fn-pop a { color: inherit; text-decoration: underline; text-decoration-color: var(--border); text-underline-offset: 4px; }
  .fn-pop a.int { text-decoration-color: color-mix(in srgb, var(--accent) 45%, transparent); }
  .fn-pop img { max-height: 12rem; margin-top: .5rem; border-radius: 4px; }
  .empty { color: var(--muted); }

  /* zen: no chrome — header slides in when the pointer touches the top edge */
  #peek { display: none; position: fixed; inset: 0 0 auto 0; height: 10px; z-index: 30; }
  body.zen #peek { display: block; }
  body.zen main { grid-template-rows: minmax(0, 1fr); }
  body.zen #panes { grid-row: 1; }
  body.zen header { position: fixed; inset: 0 0 auto 0; z-index: 31; transform: translateY(-100%); opacity: 0;
                    transition: transform .2s ease, opacity .2s ease; box-shadow: 0 1px 0 var(--border); }
  body.zen.peek header, body.zen header:focus-within { transform: none; opacity: 1; }
  body.zen #editor .cm-scroller { padding-top: 12vh; }
  #zenstat { display: none; position: fixed; right: 18px; bottom: 14px; font-size: 12px; color: var(--muted); opacity: .55; z-index: 5; pointer-events: none; }
  body.zen #zenstat { display: block; }
  body.zen.dirty #zenstat::before { content: "● "; color: var(--warn); }

  /* ⌘P / ⌘K palette */
  #palette { position: fixed; inset: 0; z-index: 50; background: rgb(0 0 0 / .18); display: flex; justify-content: center; align-items: flex-start; padding-top: 14vh; }
  #palette[hidden] { display: none; }
  #palette .box { width: min(560px, calc(100vw - 32px)); background: var(--bg); border: 1px solid var(--border); border-radius: 14px; box-shadow: var(--shadow); overflow: hidden; }
  #pal-q { width: 100%; border: 0; border-bottom: 1px solid var(--border); background: transparent; padding: 14px 16px; font-size: 15px; outline: none; }
  #pal-list { max-height: 50vh; overflow-y: auto; padding: 6px; }
  #pal-list .row { display: flex; align-items: baseline; gap: 10px; padding: 7px 10px; border-radius: 8px; cursor: pointer; }
  #pal-list .row.sel { background: var(--soft); }
  #pal-list .row .t { flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  #pal-list .row .s { font: 11.5px "Geist Mono", monospace; color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 40%; }
  #pal-list .row.new .t { color: var(--accent); }
  #pal-list .none { padding: 12px; color: var(--muted); }
  /* topics / pages fields: dropdown of existing slugs */
  #meta label { position: relative; }
  .pick { position: absolute; top: 100%; left: 0; right: 0; z-index: 30; margin-top: 4px; padding: 4px; max-height: 16em; overflow-y: auto;
          background: var(--bg); border: 1px solid var(--border); border-radius: 10px; box-shadow: var(--shadow); font-size: 13.5px; color: var(--fg); }
  .pick[hidden] { display: none; }
  .pick .row { display: flex; align-items: baseline; gap: 10px; padding: 5px 10px; border-radius: 6px; cursor: pointer; }
  .pick .row.sel { background: var(--soft); }
  .pick .row .t { flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .pick .row .s { font: 11.5px "Geist Mono", monospace; color: var(--muted); white-space: nowrap; }
  .pick .row.new .t { color: var(--accent); }
  #pal-foot { border-top: 1px solid var(--border); padding: 7px 14px; font-size: 11.5px; color: var(--muted); display: flex; gap: 14px; }

  @media (max-width: 1100px) {
    header { flex-wrap: wrap; }
    #msg { min-width: 0; }
  }
  @media (max-width: 800px) {
    body { grid-template-columns: 0 1fr; }
    #meta { grid-template-columns: 1fr 1fr; }
  }
</style>
</head>
<body class="mode-write">
<script>try {
  if (localStorage.getItem("blog-admin-theme") === "dark") document.documentElement.dataset.theme = "dark";
  if (localStorage.getItem("blog-admin-zen") === "1") document.body.classList.add("zen");
  if (localStorage.getItem("blog-admin-nometa") === "1") document.body.classList.add("nometa");
} catch {}</script>
<aside>
  <div class="top"><b>Writing</b><button id="new" title="New">+ New</button></div>
  <div class="seg" id="kinds">
    <button data-kind="all">All</button><button data-kind="post">Posts</button><button data-kind="topic">Topics</button><button data-kind="wiki">Wiki</button>
  </div>
  <input id="filter" type="text" placeholder="Filter…  ( / )" spellcheck="false">
  <div id="statusbar" class="chips"></div>
  <div id="topicbar" class="chips"></div>
  <div id="listhead">
    <span class="ck" id="selall" role="checkbox" title="Select all shown  (⌘A in the list)"></span>
    <span id="count"></span>
    <button id="sort" title="Sort"></button>
  </div>
  <div id="posts" role="listbox" aria-multiselectable="true"></div>
  <div id="bulk" hidden>
    <div class="bk-top"><b id="bk-n"></b><span id="bk-hidden"></span><button id="bk-clear" title="Clear selection — Esc">Clear</button></div>
    <div class="bk-acts">
      <button id="bk-draft"></button>
      <button id="bk-topics">Topics ▾</button>
      <button id="bk-publish" class="primary" title="Commit + push the selected notes">Publish</button>
      <button id="bk-trash" class="icon" title="Move the selected notes to the trash"><svg aria-hidden="true" viewBox="0 0 256 256" fill="currentColor"><path d="M216,48H176V40a24,24,0,0,0-24-24H104A24,24,0,0,0,80,40v8H40a8,8,0,0,0,0,16h8V208a16,16,0,0,0,16,16H192a16,16,0,0,0,16-16V64h8a8,8,0,0,0,0-16ZM96,40a8,8,0,0,1,8-8h48a8,8,0,0,1,8,8v8H96Zm96,168H64V64H192ZM112,104v64a8,8,0,0,1-16,0V104a8,8,0,0,1,16,0Zm48,0v64a8,8,0,0,1-16,0V104a8,8,0,0,1,16,0Z"/></svg></button>
    </div>
    <div id="bk-menu" class="pick" hidden></div>
  </div>
  <div class="keyhelp">
  <button>⌨ Shortcuts</button>
  <div class="keys">
    <kbd>⌘P</kbd><span>jump to any note</span>
    <kbd>[[</kbd><span>link a note</span>
    <kbd>⌘K</kbd><span>link the selection</span>
    <kbd>⌘-click</kbd><span>follow a link</span>
    <kbd>⌘⌥F</kbd><span>add a footnote</span>
    <kbd>⌘↩</kbd><span>footnote ↔ its note</span>
    <kbd>⌘;</kbd><span>spellcheck on / off</span>
    <kbd>⌘'</kbd><span>fix the next typo</span>
    <kbd>⌘.</kbd><span>zen mode</span>
    <kbd>Alt ←</kbd><span>back</span>
    <kbd>/</kbd><span>filter the list</span>
    <kbd>↑↓</kbd><span>move in the list</span>
    <kbd>x</kbd><span>select (⇧↑↓ extends)</span>
    <kbd>⇧-click</kbd><span>select a range</span>
    <kbd>⌘A</kbd><span>select all shown</span>
  </div>
  </div>
</aside>
<main>
  <div id="peek"></div>
  <header>
    <button id="toggleside" class="icon" title="Toggle sidebar"><svg aria-hidden="true" viewBox="0 0 256 256" fill="currentColor"><path d="M216,40H40A16,16,0,0,0,24,56V200a16,16,0,0,0,16,16H216a16,16,0,0,0,16-16V56A16,16,0,0,0,216,40Zm0,160H88V56H216V200Z"/></svg></button>
    <div id="crumb"></div>
    <span id="dirty" title="Changes not written to disk yet — ⌘/Ctrl+S">Unsaved</span>
    <span id="msg"></span>
    <button id="backs" hidden title="Notes linking here"></button>
    <div class="seg" id="modes">
      <button data-mode="write" class="icon" title="Write — formatted editor  (⌘/Ctrl+\ cycles)"><svg aria-hidden="true" viewBox="0 0 256 256" fill="currentColor"><path d="M243.31,81.36,174.63,12.68a16,16,0,0,0-22.63,0L123.56,41.12l-58,21.76A16,16,0,0,0,55.36,75.23L34.59,199.83a4,4,0,0,0,6.77,3.49l57-57a23.85,23.85,0,0,1-2.29-12.08,24,24,0,1,1,13.6,23.4l-57,57a4,4,0,0,0,3.49,6.77l124.61-20.77a16,16,0,0,0,12.35-10.16l21.77-58.07L243.31,104a16,16,0,0,0,0-22.63ZM208,116.68,139.32,48l24-24L232,92.68Z"/></svg></button><button data-mode="preview" class="icon" title="Preview — as it renders on the site"><svg aria-hidden="true" viewBox="0 0 256 256" fill="currentColor"><path d="M247.31,124.76c-.35-.79-8.82-19.58-27.65-38.41C194.57,61.26,162.88,48,128,48S61.43,61.26,36.34,86.35C17.51,105.18,9,124,8.69,124.76a8,8,0,0,0,0,6.5c.35.79,8.82,19.57,27.65,38.4C61.43,194.74,93.12,208,128,208s66.57-13.26,91.66-38.34c18.83-18.83,27.3-37.61,27.65-38.4A8,8,0,0,0,247.31,124.76ZM128,168a40,40,0,1,1,40-40A40,40,0,0,1,128,168Z"/></svg></button><button data-mode="source" class="icon" title="Source — edit with all Markdown visible"><svg aria-hidden="true" viewBox="0 0 256 256" fill="currentColor"><path d="M216,40H40A16,16,0,0,0,24,56V200a16,16,0,0,0,16,16H216a16,16,0,0,0,16-16V56A16,16,0,0,0,216,40ZM92.8,145.6a8,8,0,1,1-9.6,12.8l-32-24a8,8,0,0,1,0-12.8l32-24a8,8,0,0,1,9.6,12.8L69.33,128Zm58.89-71.4-32,112a8,8,0,1,1-15.38-4.4l32-112a8,8,0,0,1,15.38,4.4Zm53.11,60.2-32,24a8,8,0,0,1-9.6-12.8L186.67,128,163.2,110.4a8,8,0,1,1,9.6-12.8l32,24a8,8,0,0,1,0,12.8Z"/></svg></button>
    </div>
    <button id="togglemeta" class="icon" title="Details — show / hide title, summary, slug"><svg aria-hidden="true" viewBox="0 0 256 256" fill="currentColor"><path d="M32,80a8,8,0,0,1,8-8H77.17a28,28,0,0,1,53.66,0H216a8,8,0,0,1,0,16H130.83a28,28,0,0,1-53.66,0H40A8,8,0,0,1,32,80Zm184,88H194.83a28,28,0,0,0-53.66,0H40a8,8,0,0,0,0,16H141.17a28,28,0,0,0,53.66,0H216a8,8,0,0,0,0-16Z"/></svg></button>
    <button id="spellbtn" class="icon" title="Spellcheck — ⌘/Ctrl+;  (⌘/Ctrl+' fixes the next typo)"><svg aria-hidden="true" viewBox="0 0 256 256" fill="currentColor"><path d="M200,156c0,6.5-7.33,12-16,12s-16-5.5-16-12,7.33-12,16-12S200,149.5,200,156ZM232,56V200a16,16,0,0,1-16,16H40a16,16,0,0,1-16-16V56A16,16,0,0,1,40,40H216A16,16,0,0,1,232,56ZM143.37,172.88l-44-104a8,8,0,0,0-14.74,0l-44,104a8,8,0,0,0,14.74,6.24L66.84,152h50.32l11.47,27.12a8,8,0,0,0,14.74-6.24ZM216,124c0-15.44-14.36-28-32-28a34.86,34.86,0,0,0-20.78,6.68,8,8,0,0,0,9.56,12.83A18.84,18.84,0,0,1,184,112c8.56,0,15.8,5.36,16,11.76v8A35.24,35.24,0,0,0,184,128c-17.64,0-32,12.56-32,28s14.36,28,32,28a35.13,35.13,0,0,0,16.93-4.26A8,8,0,0,0,216,176ZM73.61,136h36.78L92,92.53Z"/></svg></button>
    <button id="zenbtn" class="icon" title="Zen mode — ⌘/Ctrl+.  (Esc leaves)"><svg aria-hidden="true" viewBox="0 0 256 256" fill="currentColor"><path d="M245.83,121.63a15.53,15.53,0,0,0-9.52-7.33,73.55,73.55,0,0,0-22.17-2.22c4-19.85,1-35.55-2-44.86a16.17,16.17,0,0,0-18.8-10.88,85.53,85.53,0,0,0-28.55,12.12,94.58,94.58,0,0,0-27.11-33.25,16.05,16.05,0,0,0-19.26,0A94.58,94.58,0,0,0,91.26,68.46,85.53,85.53,0,0,0,62.71,56.34,16.14,16.14,0,0,0,43.92,67.22c-3,9.31-6,25-2.06,44.86a73.55,73.55,0,0,0-22.17,2.22,15.53,15.53,0,0,0-9.52,7.33,16,16,0,0,0-1.6,12.26c3.39,12.58,13.8,36.49,45.33,55.33S113.13,208,128.05,208s42.67,0,74-18.78c31.53-18.84,41.94-42.75,45.33-55.33A16,16,0,0,0,245.83,121.63ZM62.1,175.49C35.47,159.57,26.82,140.05,24,129.7a59.61,59.61,0,0,1,22.5-1.17,129.08,129.08,0,0,0,9.15,19.41,142.28,142.28,0,0,0,34,39.56A114.92,114.92,0,0,1,62.1,175.49ZM128,190.4c-9.33-6.94-32-28.23-32-71.23C96,76.7,118.38,55.24,128,48c9.62,7.26,32,28.72,32,71.19C160,162.17,137.33,183.46,128,190.4Zm104-60.68c-2.77,10.24-11.4,29.81-38.09,45.77a114.92,114.92,0,0,1-27.55,12,142.28,142.28,0,0,0,34-39.56,129.08,129.08,0,0,0,9.15-19.41A59.69,59.69,0,0,1,232,129.71Z"/></svg></button>
    <button id="theme" class="icon" title="Light / dark"><svg aria-hidden="true" class="to-dark" viewBox="0 0 256 256" fill="currentColor"><path d="M235.54,150.21a104.84,104.84,0,0,1-37,52.91A104,104,0,0,1,32,120,103.09,103.09,0,0,1,52.88,57.48a104.84,104.84,0,0,1,52.91-37,8,8,0,0,1,10,10,88.08,88.08,0,0,0,109.8,109.8,8,8,0,0,1,10,10Z"/></svg><svg aria-hidden="true" class="to-light" viewBox="0 0 256 256" fill="currentColor"><path d="M120,40V16a8,8,0,0,1,16,0V40a8,8,0,0,1-16,0Zm8,24a64,64,0,1,0,64,64A64.07,64.07,0,0,0,128,64ZM58.34,69.66A8,8,0,0,0,69.66,58.34l-16-16A8,8,0,0,0,42.34,53.66Zm0,116.68-16,16a8,8,0,0,0,11.32,11.32l16-16a8,8,0,0,0-11.32-11.32ZM192,72a8,8,0,0,0,5.66-2.34l16-16a8,8,0,0,0-11.32-11.32l-16,16A8,8,0,0,0,192,72Zm5.66,114.34a8,8,0,0,0-11.32,11.32l16,16a8,8,0,0,0,11.32-11.32ZM48,128a8,8,0,0,0-8-8H16a8,8,0,0,0,0,16H40A8,8,0,0,0,48,128Zm80,80a8,8,0,0,0-8,8v24a8,8,0,0,0,16,0V216A8,8,0,0,0,128,208Zm112-88H216a8,8,0,0,0,0,16h24a8,8,0,0,0,0-16Z"/></svg></button>
    <button id="trash" class="icon" title="Move to trash — gio trash, restorable"><svg aria-hidden="true" viewBox="0 0 256 256" fill="currentColor"><path d="M216,48H176V40a24,24,0,0,0-24-24H104A24,24,0,0,0,80,40v8H40a8,8,0,0,0,0,16h8V208a16,16,0,0,0,16,16H192a16,16,0,0,0,16-16V64h8a8,8,0,0,0,0-16ZM96,40a8,8,0,0,1,8-8h48a8,8,0,0,1,8,8v8H96Zm96,168H64V64H192ZM112,104v64a8,8,0,0,1-16,0V104a8,8,0,0,1,16,0Zm48,0v64a8,8,0,0,1-16,0V104a8,8,0,0,1,16,0Z"/></svg></button>
    <button id="save" class="icon" title="Save — ⌘/Ctrl+S"><svg aria-hidden="true" viewBox="0 0 256 256" fill="currentColor"><path d="M219.31,72,184,36.69A15.86,15.86,0,0,0,172.69,32H48A16,16,0,0,0,32,48V208a16,16,0,0,0,16,16H208a16,16,0,0,0,16-16V83.31A15.86,15.86,0,0,0,219.31,72ZM208,208H184V152a16,16,0,0,0-16-16H88a16,16,0,0,0-16,16v56H48V48H172.69L208,83.31ZM160,72a8,8,0,0,1-8,8H96a8,8,0,0,1,0-16h56A8,8,0,0,1,160,72Z"/></svg></button>
    <button id="publish" class="primary" title="Save, commit this post, push — Cloudflare Pages deploys"><svg aria-hidden="true" viewBox="0 0 256 256" fill="currentColor"><path d="M231.4,44.34s0,.1,0,.15l-58.2,191.94a15.88,15.88,0,0,1-14,11.51q-.69.06-1.38.06a15.86,15.86,0,0,1-14.42-9.15L107,164.15a4,4,0,0,1,.77-4.58l57.92-57.92a8,8,0,0,0-11.31-11.31L96.43,148.26a4,4,0,0,1-4.58.77L17.08,112.64a16,16,0,0,1,2.49-29.8l191.94-58.2.15,0A16,16,0,0,1,231.4,44.34Z"/></svg>Publish</button>
  </header>
  <div id="meta">
    <label>Title<input type="text" id="f-title" placeholder="Title"></label>
    <label>Summary<input type="text" id="f-summary" placeholder="One line, shown under the title and in the list"></label>
    <label class="only-post">Date<input type="date" id="f-date"></label>
    <label class="check no-topic" title="Drafts are saved but hidden from the site"><input type="checkbox" id="f-draft"> Draft</label>
    <label class="wide no-topic"><span>Topics <span class="refs" id="topics-known"></span></span><input type="text" id="f-topics" spellcheck="false" placeholder="comma separated, e.g. ar, interfaces"></label>
    <label class="wide only-topic"><span>Pages, in reading order <span class="refs">(wiki or post slugs, comma separated; listing a page tags it with this topic on save)</span></span><input type="text" id="f-pages" spellcheck="false" placeholder="layers, faces, …"></label>
    <div class="slugwrap"><span>ethanlambeth.com<span id="urlbase">/blog/</span></span><input type="text" id="f-slug" spellcheck="false" placeholder="slug"></div>
  </div>
  <div id="panes">
    <div id="editor"></div>
    <div id="preview"><div class="page">
      <h1 class="title" id="p-title"></h1><p class="summary" id="p-summary"></p>
      <article class="prose" id="p-body"></article>
      <div class="only-topic"><h2 class="notes-h">Notes</h2><ul class="notes" id="p-pages"></ul></div>
      <section id="p-backs-wrap" hidden><h2 class="notes-h">Linked from</h2><ul class="notes" id="p-backs"></ul></section>
    </div></div>
  </div>
  <div id="zenstat"></div>
</main>
<div id="palette" hidden><div class="box">
  <input id="pal-q" type="text" spellcheck="false" autocomplete="off">
  <div id="pal-list"></div>
  <div id="pal-foot"><span>↑↓ choose</span><span>↵ <span id="pal-verb">open</span></span><span>esc close</span></div>
</div></div>

<script type="module">
import { EditorView, minimalSetup } from "https://esm.sh/codemirror@6.0.2";
import { keymap, placeholder, Decoration, WidgetType, hoverTooltip, ViewPlugin } from "https://esm.sh/@codemirror/view@6";
import { EditorSelection, Prec, StateEffect, StateField } from "https://esm.sh/@codemirror/state@6";
import { indentWithTab } from "https://esm.sh/@codemirror/commands@6";
import { autocompletion, completionStatus, startCompletion } from "https://esm.sh/@codemirror/autocomplete@6";
import { markdown, markdownLanguage } from "https://esm.sh/@codemirror/lang-markdown@6";
import { languages } from "https://esm.sh/@codemirror/language-data@6";
import { HighlightStyle, syntaxHighlighting } from "https://esm.sh/@codemirror/language@6";
import { tags as t } from "https://esm.sh/@lezer/highlight@1";
import { footnotePopovers } from "/lib/footnotes.mjs";

const $ = (s) => document.querySelector(s);
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const F = {
  title: $("#f-title"), summary: $("#f-summary"), date: $("#f-date"), draft: $("#f-draft"), slug: $("#f-slug"),
  topics: $("#f-topics"), pages: $("#f-pages"),
};
const today = () => new Date().toLocaleDateString("en-CA");
const slugify = (s) => s.toLowerCase().normalize("NFKD").replace(/[^\w\s-]/g, "").trim().replace(/[\s_]+/g, "-").replace(/-+/g, "-");
const csv = (s) => s.split(",").map((x) => x.trim()).filter(Boolean);
const URLS = { post: "/blog/", topic: "/topics/", wiki: "/wiki/" };
const NOUN = { post: "post", topic: "topic", wiki: "wiki page" };
const PREFIX = { wiki: "wiki", post: "blog", topic: "topics" };
const PREFIX_KIND = { wiki: "wiki", blog: "post", post: "post", topics: "topic", topic: "topic" };
const store = { get: (k, d) => { try { return localStorage.getItem(k) ?? d; } catch { return d; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch {} } };

let kind = "post";      // kind of the open entry
let listKind = "post";  // sidebar tab
let current = null;     // slug as saved on disk (null = unsaved new entry)
let slugTouched = false;
let dirty = false;
let saved = "";         // form snapshot as last loaded/saved; dirty = form differs from it
let notes = [];         // every wiki page / post / topic: {kind, slug, title, summary, draft}
let backs = [];         // notes linking to the open one

const snapshot = () => JSON.stringify([
  kind, F.title.value, F.summary.value, F.date.value, F.draft.checked, F.slug.value,
  csv(F.topics.value), csv(F.pages.value), getBody(),
]);
const setDirty = (v) => {
  dirty = v;
  document.body.classList.toggle("dirty", v);
  document.title = (v ? "● " : "") + (F.title.value || "writing admin");
};
const markSaved = () => { saved = snapshot(); setDirty(false); };
const refreshDirty = () => setDirty(snapshot() !== saved);
let msgTimer;
const flash = (text, sticky) => {
  clearTimeout(msgTimer); $("#msg").textContent = text;
  if (!sticky) msgTimer = setTimeout(updateCount, 3500);
};

/* ---------- note links (mirror of src/lib/notes.mjs) ---------- */
const WIKI_RE = /\[\[([^\]|\n]+)(?:\|([^\]\n]+))?\]\]/g;
function resolve(target) {
  const tt = target.trim();
  const m = tt.match(/^(wiki|blog|post|topics?)\/(.+)$/);
  const pool = m ? notes.filter((n) => n.kind === PREFIX_KIND[m[1]]) : notes;
  const name = m ? m[2] : tt;
  return pool.find((n) => n.slug === name) ?? pool.find((n) => n.title.toLowerCase() === name.toLowerCase()) ?? pool.find((n) => n.slug === slugify(name));
}
/** Shortest [[target]] that lands on n. */
const targetOf = (n) => (resolve(n.slug) === n ? n.slug : PREFIX[n.kind] + "/" + n.slug);
const humanize = (s) => { const x = s.replace(/^[a-z]+\//, "").replace(/[-_]+/g, " ").trim(); return x.charAt(0).toUpperCase() + x.slice(1); };
const subseq = (q, s) => { let i = 0; for (const c of s) if (c === q[i]) i++; return i === q.length; };
function rank(q, pool) {
  q = q.trim().toLowerCase();
  if (!q) return pool.slice();
  return pool.map((n) => {
    const a = n.title.toLowerCase(), b = n.slug.toLowerCase();
    const s = a.startsWith(q) || b.startsWith(q) ? 4 : a.includes(" " + q) ? 3 : a.includes(q) || b.includes(q) ? 2 : subseq(q, a) || subseq(q, b) ? 1 : 0;
    return [s, n];
  }).filter(([s]) => s).sort((x, y) => y[0] - x[0] || x[1].title.localeCompare(y[1].title)).map(([, n]) => n);
}
const recent = () => { try { return JSON.parse(store.get("blog-admin-recent", "[]")); } catch { return []; } };
const remember = (k, slug) => store.set("blog-admin-recent", JSON.stringify([k + "/" + slug, ...recent().filter((r) => r !== k + "/" + slug)].slice(0, 12)));
const byRecent = (pool) => {
  const r = recent();
  const pos = (n) => { const i = r.indexOf(n.kind + "/" + n.slug); return i < 0 ? 99 : i; };
  return pool.slice().sort((a, b) => pos(a) - pos(b));
};
async function loadNotes() {
  notes = await fetch("/api/notes").then((r) => r.json());
  $("#topics-known").textContent = "(" + notes.filter((n) => n.kind === "topic").map((n) => n.slug).join(", ") + ")";
  view.dispatch({ effects: refreshDeco.of(null) });
}

/* ---------- editor ---------- */
const mdStyle = HighlightStyle.define([
  { tag: t.heading1, fontWeight: "inherit" },
  { tag: t.heading2, fontWeight: "inherit" },
  { tag: [t.heading3, t.heading4, t.heading5, t.heading6], fontWeight: "700" },
  { tag: t.strong, fontWeight: "600" },
  { tag: t.emphasis, fontStyle: "italic" },
  { tag: t.strikethrough, textDecoration: "line-through" },
  { tag: t.link, textDecoration: "underline" },
  { tag: t.url, color: "var(--muted)" },
  { tag: [t.processingInstruction, t.contentSeparator, t.meta], color: "var(--muted)" },
  { tag: t.quote, color: "var(--muted)" },
  { tag: t.monospace, color: "var(--accent)" },
  { tag: [t.keyword, t.typeName], color: "#a855f7" },
  { tag: [t.string], color: "#16a34a" },
  { tag: [t.comment], color: "var(--muted)", fontStyle: "italic" },
  { tag: [t.number, t.bool], color: "#ea580c" },
]);

// Mod-b / Mod-i: wrap selection (or cursor) in a markdown mark
const wrap = (mark) => (view) => {
  view.dispatch(view.state.changeByRange((r) => ({
    changes: { from: r.from, to: r.to, insert: mark + view.state.sliceDoc(r.from, r.to) + mark },
    range: EditorSelection.range(r.from + mark.length, r.to + mark.length),
  })));
  return true;
};

/* scan: images + [[links]] outside fenced code */
const IMG_RE = /!\[([^\]\n]*)\]\(([^)\s]+)(?:\s+"[^"\n]*")?\)/g;
const SIZE_RE = /\s*\|\s*(\d+)(px|%)?(?:x\d+)?\s*$/;
const FN_RE = /\[\^([^\]\s]+)\](:)?/g;
function scan(doc) {
  const imgs = [], links = [], fns = [];
  let fence = false;
  for (let i = 1; i <= doc.lines; i++) {
    const line = doc.line(i);
    if (/^\s*(\x60\x60\x60|~~~)/.test(line.text)) { fence = !fence; continue; }
    if (fence) continue;
    for (const m of line.text.matchAll(IMG_RE)) {
      const from = line.from + m.index, size = m[1].match(SIZE_RE);
      imgs.push({ from, to: from + m[0].length, altFrom: from + 2, altTo: from + 2 + m[1].length, alt: m[1], src: m[2], lineTo: line.to,
                  width: size ? size[1] + (size[2] === "%" ? "%" : "") : null });
    }
    for (const m of line.text.matchAll(WIKI_RE)) {
      const from = line.from + m.index;
      links.push({ from, to: from + m[0].length, target: m[1], label: m[2] });
    }
    for (const m of line.text.matchAll(FN_RE)) {
      const from = line.from + m.index, def = !!m[2] && /^ {0,3}$/.test(line.text.slice(0, m.index));
      fns.push({ from, to: from + m[0].length - (m[2] && !def ? 1 : 0), label: m[1], def, line: i });
    }
  }
  return { imgs, links, fns };
}
const altWithWidth = (alt, w) => alt.replace(SIZE_RE, "") + (w ? "|" + w : "");
function setImageWidth(img, w) {
  if (!img) return;
  view.dispatch({ changes: { from: img.altFrom, to: img.altTo, insert: altWithWidth(img.alt, w) } });
}
/** n-th image with this src (n counted among same-src images). */
const findImage = (src, n) => scan(view.state.doc).imgs.filter((i) => i.src === src)[n];

/** Corner-drag to resize: box is sized live, done(width) commits ("420" | "100%"). */
function dragResize(e, box, maxW, done) {
  e.preventDefault(); e.stopPropagation();
  const startX = e.clientX, startW = box.getBoundingClientRect().width;
  const label = box.querySelector(".rs-size");
  let w = startW;
  box.classList.add("resizing"); document.body.classList.add("dragging");
  const move = (ev) => {
    w = Math.max(60, Math.min(maxW(), startW + (ev.clientX - startX) * (box.dataset.center ? 2 : 1)));
    box.style.width = w + "px";
    Object.assign(box.querySelector("img").style, { width: "100%", maxHeight: "none" });
    if (label) label.textContent = w >= maxW() - 6 ? "full" : Math.round(w) + "px";
  };
  const up = () => {
    removeEventListener("pointermove", move); removeEventListener("pointerup", up);
    box.classList.remove("resizing"); document.body.classList.remove("dragging");
    if (Math.abs(w - startW) > 2) done(w >= maxW() - 6 ? "100%" : String(Math.round(w)));
  };
  addEventListener("pointermove", move); addEventListener("pointerup", up);
}

const SIZES = [["S", "240"], ["M", "420"], ["L", "620"], ["Full", "100%"], ["Auto", null]];
class ImgWidget extends WidgetType {
  constructor(src, width, idx) { super(); this.src = src; this.width = width; this.idx = idx; }
  eq(o) { return o.src === this.src && o.width === this.width && o.idx === this.idx; }
  toDOM(view) {
    const wrapEl = el("div", "cm-img");
    const box = el("div", "cm-img-box" + (this.width ? " sized" : ""));
    box.dataset.center = "1";
    if (this.width) box.style.width = /%$/.test(this.width) ? this.width : this.width + "px";
    const img = el("img");
    img.src = this.src; img.draggable = false;
    img.onerror = () => { box.className = "cm-img-box broken"; box.textContent = "image not found: " + this.src; };
    const bar = el("div", "rs-bar");
    const mine = () => findImage(this.src, this.idx);
    for (const [name, w] of SIZES) {
      const b = el("button", w === this.width || (!w && !this.width) ? "on" : "", name);
      b.title = w ? (w.endsWith("%") ? "column width" : w + "px wide") : "natural size (tall images capped)";
      b.onmousedown = (e) => { e.preventDefault(); setImageWidth(mine(), w); };
      bar.append(b);
    }
    const handle = el("div", "rs-handle");
    handle.title = "Drag to resize";
    handle.onpointerdown = (e) => dragResize(e, box, () => wrapEl.clientWidth, (w) => setImageWidth(mine(), w));
    box.append(img, bar, handle, el("span", "rs-size", this.width ? (this.width === "100%" ? "full" : this.width.replace(/(\d)$/, "$1px")) : "auto"));
    wrapEl.append(box);
    return wrapEl;
  }
  ignoreEvent() { return true; }
}

const refreshDeco = StateEffect.define();
const inCode = (state, pos) => {
  for (let node = state.field(proseField).tree.resolveInner(pos, 1); node; node = node.parent) {
    if (["InlineCode", "FencedCode", "CodeBlock", "HTMLBlock"].includes(node.name)) return true;
  }
  return false;
};
const markLink = (ok) => Decoration.mark({ class: ok ? "cm-wl" : "cm-wl missing" });
const markBr = Decoration.mark({ class: "cm-wl-br" });
function buildDeco(state) {
  const { imgs, links, fns } = scan(state.doc);
  const out = [];
  const seen = {};
  for (const i of imgs) {
    const idx = (seen[i.src] = (seen[i.src] ?? -1) + 1);
    out.push(Decoration.widget({ widget: new ImgWidget(i.src, i.width, idx), block: true, side: 1 }).range(i.lineTo));
  }
  for (const l of links) {
    if (inCode(state, l.from)) continue;
    // [[target|label]]: brackets + "target|" recede, the label reads as the link
    const at = l.label === undefined ? l.from + 2 : l.from + 3 + l.target.length;
    const show = state.field(proseField).source || editingRange(state, l.from, l.to);
    out.push((show ? markBr : Decoration.replace({})).range(l.from, at), markLink(!!resolve(l.target)).range(at, l.to - 2), (show ? markBr : Decoration.replace({})).range(l.to - 2, l.to));
  }
  const defined = new Set(fns.filter((f) => f.def).map((f) => f.label));
  for (const f of fns) {
    if (inCode(state, f.from)) continue;
    out.push(Decoration.mark({ class: "cm-fn" + (f.def ? " def" : defined.has(f.label) ? "" : " missing") }).range(f.from, f.to));
  }
  return Decoration.set(out, true);
}
const decoField = StateField.define({
  create: buildDeco,
  update: (d, tr) => (tr.docChanged || tr.selection || tr.effects.some((e) => e.is(refreshDeco) || e.is(sourceMode)) ? buildDeco(tr.state) : d),
  provide: (f) => EditorView.decorations.from(f),
});
const linkAt = (state, pos) => scan(state.doc).links.find((l) => pos >= l.from && pos <= l.to);

/* ---------- footnotes: [^n] marks, [^n]: notes (src/lib/footnotes.mjs) ---------- */
// a mark under pos, or the note whose first line holds pos
const fnAt = (state, pos) => {
  const line = state.doc.lineAt(pos).number;
  return scan(state.doc).fns.find((f) => (pos >= f.from && pos <= f.to) || (f.def && f.line === line));
};
/** A note's text: its first line plus indented continuation paragraphs. */
function fnText(doc, def) {
  const out = [doc.line(def.line).text.slice(def.to - doc.line(def.line).from).trim()];
  for (let i = def.line + 1; i <= doc.lines; i++) {
    const text = doc.line(i).text;
    if (/^( {2,}|\t)/.test(text)) out.push(text.trim());
    else if (!text.trim() && i < doc.lines && /^( {2,}|\t)\S/.test(doc.line(i + 1).text)) out.push("");
    else break;
  }
  return out.join("\n").replace(/\n{3,}/g, "\n\n");
}
/** Mark → its note, note → its (first) mark. */
function hopFootnote(view, f) {
  const { fns } = scan(view.state.doc);
  const other = fns.find((x) => x.label === f.label && x.def !== f.def);
  if (!other) { flash(f.def ? "nothing in the text points at [^" + f.label + "] yet" : "no note for [^" + f.label + "] — ⌘⌥F adds one"); return; }
  const anchor = other.def ? other.to + (view.state.sliceDoc(other.to, other.to + 1) === " " ? 1 : 0) : other.to;
  view.dispatch({ selection: { anchor }, scrollIntoView: true });
  view.focus();
}
/** ⌘⌥F: [^n] at the cursor, "[^n]: " at the end of the body, cursor there. */
function addFootnote(view) {
  const { state } = view, doc = state.doc.toString();
  const used = new Set(scan(state.doc).fns.map((f) => f.label));
  let n = 1;
  while (used.has(String(n))) n++;
  const end = doc.replace(/\s+$/, "").length;
  const at = Math.min(state.selection.main.to, end);
  const mark = "[^" + n + "]", def = (end ? "\n\n" : "") + mark + ": ";
  view.dispatch({
    changes: [{ from: at, insert: mark }, { from: end, to: doc.length, insert: def + "\n" }],
    selection: { anchor: end + mark.length + def.length },
    scrollIntoView: true,
  });
  flash("footnote " + n + " — write it here (indent 4 spaces for more paragraphs) · ⌘↩ back to the text");
  return true;
}
const fnTip = hoverTooltip((view, pos) => {
  const f = scan(view.state.doc).fns.find((x) => !x.def && pos >= x.from && pos <= x.to);
  if (!f || inCode(view.state, f.from)) return null;
  return {
    pos: f.from, end: f.to, above: true,
    create() {
      const def = scan(view.state.doc).fns.find((x) => x.def && x.label === f.label);
      const dom = el("div", "wl-tip" + (def ? "" : " missing"));
      dom.append(el("b", null, "Footnote " + f.label));
      dom.append(el("p", "fn-tip", def ? fnText(view.state.doc, def) || "(empty)" : "no [^" + f.label + "]: note yet"));
      dom.append(el("small", null, "⌘/Ctrl-click or ⌘↩ to jump to it"));
      return { dom };
    },
  };
}, { hoverTime: 250 });

const linkTip = hoverTooltip((view, pos) => {
  const l = linkAt(view.state, pos);
  if (!l) return null;
  return {
    pos: l.from, end: l.to, above: true,
    create() {
      const n = resolve(l.target);
      const dom = el("div", "wl-tip" + (n ? "" : " missing"));
      dom.append(el("b", null, n ? n.title : humanize(l.target)));
      if (n?.summary) dom.append(el("p", null, n.summary));
      dom.append(el("small", null, n ? NOUN[n.kind] + " · " + n.slug + (n.draft ? " · draft" : "") + "  —  ⌘/Ctrl-click to open" : "no such note — ⌘/Ctrl-click to create it"));
      return { dom };
    },
  };
}, { hoverTime: 250 });

// [[ → note picker
function wikiComplete(ctx) {
  const m = ctx.matchBefore(/\[\[[^\]\[\n|]*$/);
  if (!m) return null;
  const q = m.text.slice(2);
  const closes = ctx.state.sliceDoc(ctx.pos, ctx.pos + 2) === "]]";
  const put = (target) => (view, _c, from, to) => {
    const insert = target + "]]";
    view.dispatch({ changes: { from, to: to + (closes ? 2 : 0), insert }, selection: { anchor: from + insert.length } });
  };
  const pool = q.trim() ? rank(q, notes) : byRecent(notes);
  const options = pool.slice(0, 40).map((n, i) => ({
    label: n.title, detail: (n.kind === "wiki" ? "" : NOUN[n.kind] + " · ") + n.slug, apply: put(targetOf(n)), boost: -i,
  }));
  if (q.trim() && !resolve(q)) {
    options.push({
      label: "New wiki page “" + q.trim() + "”", detail: "creates " + slugify(q) + ".md", boost: -99,
      apply: (view, c, from, to) => { put(slugify(q))(view, c, from, to); createNote("wiki", q.trim()); },
    });
  }
  return { from: m.from + 2, options, filter: false };
}

/* ---------- spellcheck: nspell + en-US hunspell dictionary, fetched on first use ---------- */
// ⌘; toggles · ⌘' jumps to the next typo and lists fixes (⌘⇧' previous) · prose only: code, URLs, [[links]] skipped
const DICT = "https://cdn.jsdelivr.net/npm/dictionary-en@4.0.0/index.";
const WORD_RE = /(?<![\w'’])[A-Za-zÀ-ɏ]+(?:['’][A-Za-zÀ-ɏ]+)*(?!\w)/g;
const NO_SPELL = ["InlineCode", "FencedCode", "CodeBlock", "HTMLBlock", "HTMLTag", "Comment", "CommentBlock", "URL", "Autolink", "LinkLabel"];
let speller = null, spellOn = store.get("blog-admin-spell", "0") === "1", spellAsk = false;
const spellCache = new Map();
const myWords = () => { try { return JSON.parse(store.get("blog-admin-words", "[]")); } catch { return []; } };
async function loadSpeller() {
  if (speller) return speller;
  flash("loading dictionary…", true);
  const [{ default: nspell }, aff, dic] = await Promise.all([
    import("https://esm.sh/nspell@2.1.5"),
    ...["aff", "dic"].map((x) => fetch(DICT + x).then((r) => { if (!r.ok) throw new Error(r.status); return r.text(); })),
  ]);
  speller = nspell(aff, dic);
  for (const w of ["ok", ...myWords()]) speller.add(w);
  updateCount();
  return speller;
}
const plain = (w) => w.replace(/’/g, "'");
const spelledOk = (w) => {
  const k = plain(w);
  // single letters, acronyms and camelCase pass
  if (!spellCache.has(k)) spellCache.set(k, k.length < 2 || /[A-Z]/.test(k.slice(1)) || speller.correct(k));
  return spellCache.get(k);
};
/** Misspelled words in [from, to] (whole lines), outside code, URLs, [[links]] and footnote marks. */
function typos(state, from = 0, to = state.doc.length) {
  if (!speller) return [];
  from = state.doc.lineAt(from).from; to = state.doc.lineAt(to).to;
  const { links, fns } = scan(state.doc), skip = [...links, ...fns];
  const tree = state.field(proseField).tree, out = [];
  for (const m of state.sliceDoc(from, to).matchAll(WORD_RE)) {
    const a = from + m.index, b = a + m[0].length;
    if (spelledOk(m[0]) || skip.some((x) => a < x.to && b > x.from)) continue;
    let prose = true;
    for (let n = tree.resolveInner(a, 1); n && prose; n = n.parent) if (NO_SPELL.includes(n.name)) prose = false;
    if (prose) out.push({ from: a, to: b, word: m[0] });
  }
  return out;
}
const typoMark = Decoration.mark({ class: "cm-typo" });
const spellPlugin = ViewPlugin.fromClass(class {
  constructor(v) { this.typing = -1; this.decorations = this.build(v); }
  update(u) {
    // the word being typed isn't flagged until you leave it
    if (u.docChanged || u.selectionSet) this.typing = u.transactions.some((tr) => tr.isUserEvent("input.type")) ? u.state.selection.main.head : -1;
    if (u.docChanged || u.viewportChanged || u.selectionSet || u.transactions.some((tr) => tr.effects.some((e) => e.is(refreshDeco)))) this.decorations = this.build(u.view);
  }
  build(v) {
    if (!spellOn || !speller) return Decoration.none;
    const out = [];
    for (const r of v.visibleRanges) for (const w of typos(v.state, r.from, r.to)) if (w.to !== this.typing) out.push(typoMark.range(w.from, w.to));
    return Decoration.set(out, true);
  }
}, { decorations: (p) => p.decorations });
async function setSpell(on) {
  spellOn = on;
  store.set("blog-admin-spell", on ? "1" : "0");
  $("#spellbtn").classList.toggle("on", on);
  if (on) {
    try { await loadSpeller(); }
    catch { flash("couldn't load the dictionary (offline?)"); spellOn = false; $("#spellbtn").classList.remove("on"); return; }
  }
  view.dispatch({ effects: refreshDeco.of(null) });
  updateCount();
  flash(on ? "spellcheck on — ⌘' fixes the next typo" : "spellcheck off");
}
/** ⌘' / ⌘⇧': cursor to the next / previous typo, its fixes open. */
const hopTypo = (dir) => (v) => {
  if (!spellOn || !speller) { flash("spellcheck is off — ⌘; turns it on"); return true; }
  const all = typos(v.state), head = v.state.selection.main.head;
  if (!all.length) { flash("no typos ✓"); return true; }
  const t = dir > 0
    ? all.find((w) => w.to > head || (w.to === head && !completionStatus(v.state))) ?? all[0]
    : all.findLast((w) => w.to < head) ?? all.at(-1);
  v.dispatch({ selection: { anchor: t.to }, scrollIntoView: true });
  spellAsk = true;
  startCompletion(v);
  return true;
};
// fixes for the typo under the cursor; only on ⌘' (or Ctrl-Space), never while typing
function spellComplete(ctx) {
  if (!(spellAsk || ctx.explicit) || !spellOn || !speller) return null;
  spellAsk = false;
  const w = typos(ctx.state, ctx.pos, ctx.pos).find((x) => ctx.pos >= x.from && ctx.pos <= x.to);
  if (!w) return null;
  const curly = w.word.includes("’");
  const learn = (keep) => (v) => {
    speller.add(plain(w.word)); spellCache.set(plain(w.word), true);
    if (keep) store.set("blog-admin-words", JSON.stringify([...new Set([...myWords(), plain(w.word)])]));
    v.dispatch({ effects: refreshDeco.of(null) });
    updateCount();
  };
  const fixes = speller.suggest(plain(w.word)).slice(0, 8).map((s, i) => ({ label: curly ? s.replace(/'/g, "’") : s, boost: -i }));
  return {
    from: w.from, to: w.to, filter: false,
    options: [
      ...fixes,
      { label: "Add “" + w.word + "” to dictionary", detail: "remembered", apply: learn(true), boost: -98 },
      { label: "Ignore", detail: "until reload", apply: learn(false), boost: -99 },
    ],
  };
}
if (spellOn) loadSpeller().then(() => view.dispatch({ effects: refreshDeco.of(null) })).catch(() => setSpell(false));

/* Preview-like presentation; decorations never change the saved Markdown.
 * Parse the whole document so formatting also works beyond the visible viewport.
 * Only rebuild the tree on edits; cursor movement just updates marker visibility.
 */
const markdownSupport = markdown({ base: markdownLanguage, codeLanguages: languages });
const sourceMode = StateEffect.define();
const editingRange = (state, from, to) => state.selection.ranges.some((r) => r.from <= to && r.to >= from);
const editingLine = (state, pos) => {
  const line = state.doc.lineAt(pos);
  return editingRange(state, line.from, line.to);
};
class ProseWidget extends WidgetType {
  constructor(kind) { super(); this.kind = kind; }
  eq(other) { return this.kind === other.kind; }
  toDOM() {
    const span = el("span", "cm-prose-" + this.kind, this.kind === "bullet" ? "•" : "");
    span.setAttribute("aria-hidden", "true");
    return span;
  }
  ignoreEvent() { return false; }
}
function proseDecorations(state, tree) {
  const out = [], lineClasses = new Map();
  const hide = (from, to, widget) => {
    if (to > from) out.push(Decoration.replace(widget ? { widget } : {}).range(from, to));
  };
  const lineClass = (pos, cls) => {
    const from = state.doc.lineAt(pos).from;
    if (!lineClasses.has(from)) lineClasses.set(from, new Set());
    lineClasses.get(from).add(cls);
  };
  const lines = (from, to, cls) => {
    for (let n = state.doc.lineAt(from).number; n <= state.doc.lineAt(to).number; n++) lineClass(state.doc.line(n).from, cls);
  };
  for (let n = 1; n <= state.doc.lines; n++) {
    const line = state.doc.line(n);
    if (!line.length) lineClass(line.from, "cm-prose-gap");
  }
  tree.iterate({ enter(ref) {
    const { name, from, to, node } = ref;
    if (name === "FencedCode" || name === "CodeBlock" || name === "HTMLBlock") {
      lines(from, to, "cm-prose-code");
      return false;
    }
    // Images have their existing preview + resize controls; keep their source editable.
    if (name === "Image") return false;
    if (/^(ATX|Setext)Heading[1-6]$/.test(name)) {
      lineClass(from, "cm-prose-heading");
      lineClass(from, "cm-prose-h" + name.slice(-1));
      for (let child = node.firstChild; child; child = child.nextSibling) {
        if (child.name !== "HeaderMark" || editingRange(state, from, to)) continue;
        let end = child.to;
        while (end < to && state.doc.sliceString(end, end + 1) === " ") end++;
        hide(child.from, end);
      }
    }
    if (name === "Emphasis" || name === "StrongEmphasis" || name === "Strikethrough" || name === "InlineCode") {
      if (name === "InlineCode") out.push(Decoration.mark({ class: "cm-prose-inline-code" }).range(from, to));
      if (!editingRange(state, from, to)) {
        for (let child = node.firstChild; child; child = child.nextSibling) {
          if (["EmphasisMark", "StrikethroughMark", "CodeMark"].includes(child.name)) hide(child.from, child.to);
        }
      }
      if (name === "InlineCode") return false;
    }
    if (name === "Link" && state.sliceDoc(from, from + 2) !== "[^") {
      out.push(Decoration.mark({ class: "cm-prose-link" }).range(from, to));
      if (!editingRange(state, from, to)) {
        const first = node.firstChild;
        if (first?.name === "LinkMark" && state.doc.sliceString(first.from, first.to) === "[") {
          hide(first.from, first.to);
          for (let child = first.nextSibling; child; child = child.nextSibling) {
            if (child.name === "LinkMark" && state.doc.sliceString(child.from, child.to) === "]") { hide(child.from, to); break; }
          }
        }
      }
    }
    if (name === "Blockquote") lines(from, to, "cm-prose-quote");
    if (name === "QuoteMark" && !editingLine(state, from)) {
      hide(from, to + (state.doc.sliceString(to, to + 1) === " " ? 1 : 0));
    }
    if (name === "ListItem") lines(from, to, "cm-prose-list");
    if (name === "ListMark" && !editingLine(state, from) && /^[*+-]$/.test(state.doc.sliceString(from, to))) {
      hide(from, to + (state.doc.sliceString(to, to + 1) === " " ? 1 : 0), new ProseWidget("bullet"));
    }
    if (name === "HorizontalRule" && !editingLine(state, from)) hide(from, to, new ProseWidget("rule"));
  } });
  for (const [pos, classes] of lineClasses) out.push(Decoration.line({ class: [...classes].join(" ") }).range(pos));
  return Decoration.set(out, true);
}
const proseField = StateField.define({
  create(state) {
    const tree = markdownSupport.language.parser.parse(state.doc.toString());
    return { tree, source: false, decorations: proseDecorations(state, tree) };
  },
  update(value, tr) {
    let source = value.source;
    for (const effect of tr.effects) if (effect.is(sourceMode)) source = effect.value;
    if (!tr.docChanged && !tr.selection && source === value.source) return value;
    const tree = tr.docChanged ? markdownSupport.language.parser.parse(tr.state.doc.toString()) : value.tree;
    return { tree, source, decorations: source ? Decoration.none : proseDecorations(tr.state, tree) };
  },
  provide: (field) => EditorView.decorations.from(field, (value) => value.decorations),
});

const view = new EditorView({
  parent: $("#editor"),
  extensions: [
    Prec.high(keymap.of([
      { key: "Mod-b", run: wrap("**") },
      { key: "Mod-i", run: wrap("_") },
      { key: "Mod-\\", run: () => (cycleMode(), true) },
      { key: "Mod-Enter", run: (v) => {
        const head = v.state.selection.main.head, l = linkAt(v.state, head);
        if (l) { follow(l.target, l.label); return true; }
        const f = fnAt(v.state, head);
        if (f) { hopFootnote(v, f); return true; }
        return false;
      } },
      { key: "Mod-Alt-f", run: addFootnote },
      { key: "Mod-'", run: hopTypo(1) },
      { key: 'Mod-"', run: hopTypo(-1) },
    ])),
    minimalSetup,
    EditorView.lineWrapping,
    markdownSupport,
    proseField,
    syntaxHighlighting(mdStyle),
    placeholder("Start writing…  ([[ links a note · paste or drop images, then drag their corner to size)"),
    keymap.of([indentWithTab]),
    decoField,
    linkTip,
    fnTip,
    spellPlugin,
    autocompletion({ override: [wikiComplete, spellComplete], icons: false, closeOnBlur: true }),
    EditorView.updateListener.of((u) => { if (u.docChanged) { refreshDirty(); schedulePreview(); } }),
    EditorView.domEventHandlers({
      mousedown: (e, v) => {
        if (!(e.metaKey || e.ctrlKey)) return false;
        const pos = v.posAtCoords({ x: e.clientX, y: e.clientY });
        const l = pos != null && linkAt(v.state, pos);
        if (l) { e.preventDefault(); follow(l.target, l.label); return true; }
        const f = pos != null && scan(v.state.doc).fns.find((x) => pos >= x.from && pos <= x.to);
        if (f) { e.preventDefault(); hopFootnote(v, f); return true; }
        return false;
      },
      paste: (e) => uploadFiles(e.clipboardData?.files, e),
      drop: (e) => { $("#editor").classList.remove("drop"); return uploadFiles(e.dataTransfer?.files, e); },
      dragover: (e) => { if (e.dataTransfer?.types.includes("Files")) { e.preventDefault(); $("#editor").classList.add("drop"); } },
      dragleave: () => $("#editor").classList.remove("drop"),
    }),
  ],
});
const getBody = () => view.state.doc.toString();
const setBody = (s) => view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: s } });
// ⌘/Ctrl held → links look clickable
const modKey = (e) => document.body.classList.toggle("modkey", e.metaKey || e.ctrlKey);
addEventListener("keydown", modKey); addEventListener("keyup", modKey); addEventListener("blur", () => document.body.classList.remove("modkey"));

/* ---------- images ---------- */
function uploadFiles(files, e) {
  const imgs = [...(files || [])].filter((f) => f.type.startsWith("image/"));
  if (!imgs.length) return false;
  e.preventDefault();
  const slug = ensureSlug();
  if (!slug) { flash("add a title first (images are stored under the slug)"); return true; }
  const pos = e.type === "drop" ? (view.posAtCoords({ x: e.clientX, y: e.clientY }) ?? view.state.selection.main.head) : view.state.selection.main.head;
  (async () => {
    let insert = "";
    for (const f of imgs) {
      flash("uploading " + (f.name || "image") + "…", true);
      const q = "kind=" + kind + "&slug=" + encodeURIComponent(slug) + "&name=" + encodeURIComponent(f.name || "pasted.png");
      const r = await fetch("/api/upload?" + q, { method: "POST", body: f });
      const j = await r.json();
      if (!r.ok) { flash("upload failed: " + j.error); return; }
      insert += "![](" + j.url + ")\n";
    }
    view.dispatch({ changes: { from: pos, insert }, selection: { anchor: pos + 2 } });
    view.focus();
    flash("image saved ✓ — type alt text between the [ ], drag the corner to size it");
  })();
  return true;
}

/* ---------- preview ---------- */
let previewTimer, previewSeq = 0;
function schedulePreview() { clearTimeout(previewTimer); previewTimer = setTimeout(renderPreview, 120); updateCount(); }
async function renderPreview() {
  const seq = ++previewSeq;
  $("#p-title").textContent = F.title.value || "Untitled";
  $("#crumb").innerHTML = "";
  $("#crumb").append(el("span", null, (current ? NOUN[kind] : "new " + NOUN[kind]) + " / "), F.title.value || "Untitled");
  // topic pages show the intro in place of a summary line
  const showSummary = kind !== "topic" && F.summary.value;
  $("#p-summary").textContent = F.summary.value;
  $("#p-summary").style.display = showSummary ? "" : "none";
  renderPages();
  const body = getBody();
  if (!body.trim()) { $("#p-body").innerHTML = '<p class="empty">Nothing yet.</p>'; return; }
  const r = await fetch("/api/preview?kind=" + kind, { method: "POST", body });
  const html = await r.text();
  if (seq !== previewSeq) return;
  $("#p-body").innerHTML = html;
  decoratePreview();
}
/** Internal links get a class; images get a resize handle. */
function decoratePreview() {
  for (const a of $("#p-body").querySelectorAll("a[href]")) if (/^\/(wiki|blog|topics)\/[^/]+$/.test(a.getAttribute("href"))) a.classList.add("int");
  const count = {};
  for (const img of $("#p-body").querySelectorAll("img")) {
    const src = img.getAttribute("src"), n = (count[src] = (count[src] ?? -1) + 1);
    const box = el("span", "rs-wrap"), w = img.style.width; // "400px" | "60%" | ""
    if (w) { box.style.width = w; img.style.width = "100%"; }
    box.dataset.center = "1";
    img.replaceWith(box);
    const handle = el("span", "rs-handle");
    handle.title = "Drag to resize";
    handle.onpointerdown = (e) => dragResize(e, box, () => $("#p-body").clientWidth, (w) => setImageWidth(findImage(src, n), w));
    box.append(img, handle, el("span", "rs-size", w === "100%" ? "full" : w || "auto"));
  }
}
footnotePopovers($("#p-body"));
// shortcut hints read Mac by default; spell them out elsewhere
if (!/Mac|iPhone|iPad/.test(navigator.platform)) for (const k of document.querySelectorAll(".keys kbd"))
  k.textContent = k.textContent.replace("⌘⌥", "Ctrl+Alt+").replace("⌘↩", "Ctrl+Enter").replace("⌘-", "Ctrl-").replace("⌘", "Ctrl+");
addEventListener("click", (e) => {
  const a = e.target.closest?.("a[href]");
  if (!a || e.defaultPrevented || !a.closest("#preview, .fn-pop")) return;
  const href = a.getAttribute("href");
  let m;
  if ((m = href.match(/^#missing:(.+)$/))) { e.preventDefault(); follow(decodeURIComponent(m[1]), a.textContent); }
  else if (href.startsWith("#")) {
    e.preventDefault();
    const target = $("#p-body").querySelector('[id="' + CSS.escape(decodeURIComponent(href.slice(1))) + '"]');
    if (!target) return;
    target.scrollIntoView({ block: "center", behavior: "smooth" });
    target.classList.add("flash"); setTimeout(() => target.classList.remove("flash"), 1200);
  }
  else if ((m = href.match(/^\/(wiki|blog|topics)\/([^/#?]+)$/))) { e.preventDefault(); go(PREFIX_KIND[m[1]], m[2]); }
  else if (/^https?:/.test(href)) { e.preventDefault(); window.open(href, "_blank", "noopener"); }
});
function noteRow(n, sub) {
  const li = el("li"), a = el("a");
  a.href = URLS[n.kind] + n.slug;
  a.onclick = (e) => { e.preventDefault(); go(n.kind, n.slug); };
  a.append(el("b", null, n.title));
  if (sub) a.append(el("small", null, sub));
  li.append(a);
  return li;
}
function renderPages() {
  const ul = $("#p-pages");
  ul.innerHTML = "";
  if (kind !== "topic") return;
  for (const s of csv(F.pages.value)) {
    const n = notes.find((x) => x.slug === s && x.kind !== "topic");
    if (n) { ul.append(noteRow(n, n.summary)); continue; }
    const li = el("li", "missing", s);
    li.insertAdjacentHTML("beforeend", " <span>— no such wiki page or post</span>");
    ul.append(li);
  }
}
async function loadBacklinks() {
  const k = kind, s = current;
  backs = s ? await fetch("/api/backlinks?kind=" + k + "&slug=" + encodeURIComponent(s)).then((r) => r.json()) : [];
  if (k !== kind || s !== current) return;
  $("#backs").hidden = !backs.length;
  $("#backs").textContent = "↩ " + backs.length;
  $("#p-backs-wrap").hidden = !backs.length;
  $("#p-backs").innerHTML = "";
  for (const b of backs) $("#p-backs").append(noteRow(b, (b.kind === "wiki" ? "" : NOUN[b.kind] + " · ") + (b.summary || b.slug)));
}
$("#backs").onclick = () => palette("backlinks");
function updateCount() {
  const words = (getBody().match(/\S+/g) || []).length;
  const n = spellOn ? typos(view.state).length : 0;
  const text = words + " words · " + Math.max(1, Math.round(words / 230)) + " min read" + (n ? " · " + n + " typo" + (n > 1 ? "s" : "") + " (⌘')" : "");
  $("#msg").textContent = text;
  $("#zenstat").textContent = words + " words";
}

/* ---------- modes, zen, chrome ---------- */
const MODES = ["write", "preview", "source"];
function setMode(m) {
  if (!MODES.includes(m)) m = "write";
  view.dispatch({ effects: sourceMode.of(m === "source") });
  document.body.classList.remove(...MODES.map((x) => "mode-" + x));
  document.body.classList.add("mode-" + m);
  document.querySelectorAll("#modes button").forEach((b) => b.classList.toggle("on", b.dataset.mode === m));
  store.set("blog-admin-mode", m);
}
const cycleMode = () => {
  const cur = MODES.find((m) => document.body.classList.contains("mode-" + m));
  setMode(MODES[(MODES.indexOf(cur) + 1) % MODES.length]);
};
document.querySelectorAll("#modes button").forEach((b) => (b.onclick = () => setMode(b.dataset.mode)));
setMode(store.get("blog-admin-mode", "write"));
$("#toggleside").onclick = () => document.body.classList.toggle("nosidebar");
$("#theme").onclick = () => {
  const dark = document.documentElement.dataset.theme !== "dark";
  if (dark) document.documentElement.dataset.theme = "dark"; else delete document.documentElement.dataset.theme;
  store.set("blog-admin-theme", dark ? "dark" : "light");
};
function setZen(on) {
  document.body.classList.toggle("zen", on);
  document.body.classList.remove("peek");
  $("#zenbtn").classList.toggle("on", on);
  store.set("blog-admin-zen", on ? "1" : "0");
  if (on) { flash("zen — move to the top edge for the menu, Esc to leave"); view.focus(); }
}
$("#zenbtn").onclick = () => setZen(!document.body.classList.contains("zen"));
$("#spellbtn").onclick = () => { setSpell(!spellOn); view.focus(); };
$("#spellbtn").classList.toggle("on", spellOn);
$("#zenbtn").classList.toggle("on", document.body.classList.contains("zen"));
$("#peek").onmouseenter = () => document.body.classList.add("peek");
$("header").onmouseleave = () => document.body.classList.remove("peek");
function setMeta(show) {
  document.body.classList.toggle("nometa", !show);
  $("#togglemeta").classList.toggle("on", show);
  store.set("blog-admin-nometa", show ? "0" : "1");
}
$("#togglemeta").onclick = () => setMeta(document.body.classList.contains("nometa"));
$("#togglemeta").classList.toggle("on", !document.body.classList.contains("nometa"));

/* ---------- kinds: posts / topics / wiki ---------- */
function setKind(k) {
  kind = k;
  document.body.classList.remove("kind-post", "kind-topic", "kind-wiki");
  document.body.classList.add("kind-" + k);
  $("#urlbase").textContent = URLS[k];
  F.title.placeholder = k === "post" ? "Post title" : k === "topic" ? "Topic name" : "Page title";
}
const newKind = () => (listKind === "all" ? "wiki" : listKind);
function setListKind(k) {
  if (k === listKind && entries.length) return loadList();
  listKind = k;
  topicFilter = null;
  selected.clear();
  document.querySelectorAll("#kinds button").forEach((b) => b.classList.toggle("on", b.dataset.kind === k));
  $("#new").title = "New " + NOUN[newKind()];
  store.set("blog-admin-kind", k);
  loadList();
}
document.querySelectorAll("#kinds button").forEach((b) => (b.onclick = () => setListKind(b.dataset.kind)));

/* ---------- list: filter · sort · select · bulk ---------- */
let entries = [];
let shown = [];            // rows on screen, in order
let topicFilter = null;    // topic slug, "" = untagged, null = all
let statusFilter = store.get("blog-admin-status", "all");
const selected = new Set(); // "kind/slug"
let anchor = null;          // last row clicked, for ⇧-click ranges
const keyOf = (p) => p.kind + "/" + p.slug;
const STATUS = {
  all: ["All", () => true],
  draft: ["Drafts", (p) => p.draft],
  public: ["Public", (p) => !p.draft && !p.deleted],
  changed: ["Changed", (p) => !!p.git, "Edited, new or deleted since the last publish — not live yet"],
};
const SORTS = {
  edited: ["Edited", (a, b) => b.mtime - a.mtime],
  title: ["A–Z", (a, b) => a.title.localeCompare(b.title)],
  date: ["Date", (a, b) => b.publishedAt.localeCompare(a.publishedAt) || b.mtime - a.mtime],
  words: ["Length", (a, b) => b.words - a.words],
};
const defaultSort = () => (listKind === "post" ? "date" : listKind === "all" ? "edited" : "title");
const sortKey = () => { const s = store.get("blog-admin-sort-" + listKind, ""); return SORTS[s] ? s : defaultSort(); };
const ago = (ms) => {
  if (!ms) return "";
  const s = (Date.now() - ms) / 1000;
  return s < 60 ? "now" : s < 3600 ? Math.floor(s / 60) + "m" : s < 86400 ? Math.floor(s / 3600) + "h" : s < 86400 * 30 ? Math.floor(s / 86400) + "d"
    : s < 86400 * 365 ? Math.floor(s / 86400 / 30) + "mo" : Math.floor(s / 86400 / 365) + "y";
};
const GIT_TIP = { changed: "edited since the last publish", new: "never published", deleted: "deleted here — publish to remove it from the site" };

async function loadList() {
  const k = listKind;
  const rows = await fetch("/api/list?kind=" + k).then((r) => r.json());
  if (k !== listKind) return; // tab switched mid-fetch
  entries = rows;
  const have = new Set(rows.map(keyOf));
  for (const s of selected) if (!have.has(s)) selected.delete(s);
  renderList();
}
const matchText = (p, q) => !q || [p.title, p.slug, p.summary, p.topics.join(" ")].some((s) => s.toLowerCase().includes(q));
const matchTopic = (p) => topicFilter == null || (p.kind === "topic" ? p.slug === topicFilter : topicFilter ? p.topics.includes(topicFilter) : !p.topics.length);
const matchStatus = (p) => STATUS[statusFilter][1](p);

function renderList() {
  const q = $("#filter").value.trim().toLowerCase();
  renderChips(q);
  const [, cmp] = SORTS[sortKey()];
  shown = entries.filter((p) => matchText(p, q) && matchTopic(p) && matchStatus(p)).sort(cmp);
  const box = $("#posts"), focusKey = document.activeElement?.closest?.(".post")?.dataset.key;
  box.innerHTML = "";
  for (const p of shown) box.append(row(p));
  if (!shown.length) box.append(el("div", "empty-list", entries.length ? "Nothing matches." : "Nothing here yet."));
  if (focusKey) box.querySelector('[data-key="' + CSS.escape(focusKey) + '"]')?.focus();
  $("#count").textContent = shown.length === entries.length ? shown.length + " notes" : shown.length + " of " + entries.length;
  $("#sort").textContent = SORTS[sortKey()][0] + " ↓";
  renderSelection();
}
function row(p) {
  const k = keyOf(p);
  const b = el("button", "post" + (p.kind === kind && p.slug === current ? " active" : "") + (p.deleted ? " deleted" : ""));
  b.dataset.key = k;
  b.setAttribute("role", "option");
  const ck = el("span", "ck");
  ck.onclick = (e) => { e.stopPropagation(); clickSelect(p, e.shiftKey); };
  const t = el("span", "t");
  t.append(el("span", "", p.title));
  if (p.draft) t.append(el("i", "badge", "draft"));
  if (p.git) { const g = el("i", "gs " + p.git); g.title = GIT_TIP[p.git]; t.append(g); }
  const meta = listKind === "all" ? [NOUN[p.kind]] : [];
  if (p.deleted) meta.push("deleted");
  else if (p.kind === "post") meta.push(p.publishedAt);
  else if (p.kind === "topic") meta.push(p.pages.length + " pages");
  else meta.push(p.topics.join(", ") || "no topic");
  if (sortKey() === "words" && !p.deleted) meta.push(p.words + " words");
  const d = el("span", "d");
  d.append(el("span", "m", meta.join(" · ")), el("span", "ago", ago(p.mtime)));
  b.title = p.summary || "";
  b.append(ck, t, d);
  b.onclick = (e) => {
    if (e.shiftKey || e.metaKey || e.ctrlKey || p.deleted) return clickSelect(p, e.shiftKey);
    go(p.kind, p.slug);
  };
  return b;
}
/** Toggle one row, or (⇧) set the range from the last clicked row to this one. */
function clickSelect(p, range) {
  const k = keyOf(p), keys = shown.map(keyOf);
  const a = keys.indexOf(anchor), b = keys.indexOf(k);
  if (range && a >= 0 && b >= 0) {
    const on = !selected.has(k) || selected.has(anchor);
    for (const x of keys.slice(Math.min(a, b), Math.max(a, b) + 1)) on ? selected.add(x) : selected.delete(x);
  } else selected.has(k) ? selected.delete(k) : selected.add(k);
  anchor = k;
  renderSelection();
}
function renderSelection() {
  for (const b of document.querySelectorAll("#posts .post")) {
    const on = selected.has(b.dataset.key);
    b.classList.toggle("sel", on);
    b.setAttribute("aria-selected", on);
    b.querySelector(".ck").classList.toggle("on", on);
  }
  const n = selected.size, inView = shown.filter((p) => selected.has(keyOf(p))).length;
  document.body.classList.toggle("selecting", n > 0);
  const all = $("#selall");
  all.classList.toggle("on", inView > 0 && inView === shown.length);
  all.classList.toggle("some", inView > 0 && inView < shown.length);
  $("#bulk").hidden = !n;
  if (!n) { $("#bk-menu").hidden = true; return; }
  $("#bk-n").textContent = n + " selected";
  $("#bk-hidden").textContent = n > inView ? "(" + (n - inView) + " hidden by filters)" : "";
  const items = selectedItems(), notes_ = items.filter((p) => p.kind !== "topic" && !p.deleted);
  const allDraft = notes_.length && notes_.every((p) => p.draft);
  const dr = $("#bk-draft");
  dr.textContent = allDraft ? "Undraft" : "Draft";
  dr.title = allDraft ? "Make the selected notes public (on next publish)" : "Hide the selected notes from the site";
  dr.disabled = !notes_.length;
  $("#bk-topics").disabled = !notes_.length;
  $("#bk-trash").disabled = !items.some((p) => !p.deleted);
  if (!$("#bk-menu").hidden) topicMenu();
}
const selectedItems = () => entries.filter((p) => selected.has(keyOf(p)));
$("#selall").onclick = () => {
  const keys = shown.map(keyOf), allOn = keys.length && keys.every((k) => selected.has(k));
  for (const k of keys) allOn ? selected.delete(k) : selected.add(k);
  renderSelection();
};
$("#bk-clear").onclick = () => { selected.clear(); renderSelection(); };
$("#sort").onclick = () => {
  const ks = Object.keys(SORTS).filter((s) => s !== "date" || listKind === "post" || listKind === "all");
  store.set("blog-admin-sort-" + listKind, ks[(ks.indexOf(sortKey()) + 1) % ks.length]);
  renderList();
};

/** Status chips (always) + topic chips (posts / wiki / all); counts follow the other filters. */
function renderChips(q) {
  const sb = $("#statusbar"), tb = $("#topicbar");
  sb.innerHTML = ""; tb.innerHTML = "";
  const base = entries.filter((p) => matchText(p, q) && matchTopic(p));
  for (const [s, [label, fn, tip]] of Object.entries(STATUS)) {
    const n = base.filter(fn).length;
    if (!n && s !== "all" && statusFilter !== s) continue;
    const b = el("button", statusFilter === s ? "on" : "", label);
    if (s === "changed") b.prepend(el("i", "gs changed"));
    if (tip) b.title = tip;
    b.append(el("i", "", n));
    b.onclick = () => { statusFilter = statusFilter === s && s !== "all" ? "all" : s; store.set("blog-admin-status", statusFilter); renderList(); };
    sb.append(b);
  }
  if (listKind === "topic") return;
  const count = new Map();
  for (const p of entries) {
    if (p.kind === "topic" || p.deleted || !matchText(p, q) || !matchStatus(p)) continue;
    for (const t of p.topics.length ? p.topics : [""]) count.set(t, (count.get(t) || 0) + 1);
  }
  if (count.size < 2 && topicFilter == null) return;
  if (topicFilter != null && !count.has(topicFilter)) count.set(topicFilter, 0);
  for (const [t, n] of [...count].sort((a, b) => (a[0] === "") - (b[0] === "") || b[1] - a[1])) {
    const b = el("button", topicFilter === t ? "on" : "", t || "no topic");
    b.append(el("i", "", n));
    b.onclick = () => { topicFilter = topicFilter === t ? null : t; renderList(); };
    tb.append(b);
  }
}

/* bulk actions */
async function runBulk(action, extra = {}) {
  const items = selectedItems().map(({ kind, slug }) => ({ kind, slug }));
  if (!items.length) return;
  const openHit = current && items.some((i) => i.kind === kind && i.slug === current);
  if (openHit && dirty && !(await save())) return;
  const r = await fetch("/api/bulk", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action, items, ...extra }) });
  const j = await r.json();
  if (!r.ok) { flash("failed: " + j.error, true); loadList(); return null; }
  await loadNotes();
  if (openHit) {
    if (action === "trash") { markSaved(); current = null; await newEntry(); }
    else if (action !== "publish") await open(kind, current, false);
  }
  await loadList();
  if (j.skipped.length) flash("skipped " + j.skipped.join(", "), true);
  return j;
}
const plural = (n, w) => n + " " + w + (n === 1 ? "" : "s");
$("#bk-draft").onclick = async () => {
  const to = $("#bk-draft").textContent === "Draft" ? "draft" : "undraft";
  const j = await runBulk(to);
  if (j && !j.skipped.length) flash((to === "draft" ? "drafted " : "undrafted ") + plural(j.done.length, "note") + " (on disk — publish to make it live)");
};
$("#bk-publish").onclick = async () => {
  const items = selectedItems();
  const lines = items.slice(0, 12).map((p) => "  · " + p.title + (p.deleted ? "  (delete)" : p.draft ? "  (draft — stays hidden)" : ""));
  if (items.length > 12) lines.push("  · …and " + (items.length - 12) + " more");
  if (!confirm("Commit + push " + plural(items.length, "note") + " to main? Cloudflare Pages will deploy.\n\n" + lines.join("\n"))) return;
  $("#bk-publish").disabled = true; flash("pushing…", true);
  const j = await runBulk("publish");
  $("#bk-publish").disabled = false;
  if (j) { flash("published ✓ — " + j.gitOut.trim().split("\n").pop()); selected.clear(); renderSelection(); }
};
$("#bk-trash").onclick = async () => {
  const items = selectedItems().filter((p) => !p.deleted);
  if (!confirm("Move " + plural(items.length, "note") + " to the trash?\n\n" + items.slice(0, 12).map((p) => "  · " + p.title).join("\n") +
    "\n\nRestorable from the file manager. Not committed — select them under Changed and Publish to remove them from the site.")) return;
  const j = await runBulk("trash");
  if (j) { flash("trashed " + plural(j.done.length, "note")); selected.clear(); renderSelection(); }
};
/** Topic menu: ✓ = every selected note has it, – = some. Click adds to all (or removes when all have it). */
function topicMenu() {
  const menu = $("#bk-menu"), items = selectedItems().filter((p) => p.kind !== "topic" && !p.deleted);
  menu.innerHTML = "";
  menu.append(el("div", "hint", "Tag " + plural(items.length, "note") + " — click to add, again to remove"));
  for (const tp of notes.filter((n) => n.kind === "topic").sort((a, b) => a.title.localeCompare(b.title))) {
    const n = items.filter((p) => p.topics.includes(tp.slug)).length;
    const r = el("div", "row");
    r.append(el("span", "ck" + (n === items.length && n ? " on" : n ? " some" : "")), el("span", "t", tp.title), el("span", "s", n ? n + "/" + items.length : ""));
    r.onmousedown = async (e) => {
      e.preventDefault();
      const all = n === items.length;
      const j = await runBulk(all ? "untag" : "tag", { topic: tp.slug });
      if (j) flash((all ? "removed “" : "added “") + tp.title + "” " + (all ? "from " : "to ") + plural(j.done.length, "note") + (j.files.length ? " · synced the topic page" : ""));
    };
    menu.append(r);
  }
}
$("#bk-topics").onclick = () => { const m = $("#bk-menu"); m.hidden = !m.hidden; if (!m.hidden) topicMenu(); };
addEventListener("mousedown", (e) => { if (!e.target.closest("#bk-menu, #bk-topics")) $("#bk-menu").hidden = true; });

/* list keys: ↑↓ move · ⇧↑↓ extend · x select · ⌘A all · Esc clear · ↵ open */
$("#posts").addEventListener("keydown", (e) => {
  const rows = [...document.querySelectorAll("#posts .post")], i = rows.indexOf(document.activeElement);
  if (i < 0) return;
  const mod = e.metaKey || e.ctrlKey;
  if (e.key === "ArrowDown" || e.key === "ArrowUp" || e.key === "j" || e.key === "k") {
    e.preventDefault();
    const to = e.key === "ArrowDown" || e.key === "j" ? Math.min(rows.length - 1, i + 1) : i - 1;
    if (to < 0) return $("#filter").focus();
    if (e.shiftKey) {
      if (!selected.has(rows[i].dataset.key)) selected.add(rows[i].dataset.key);
      const nk = rows[to].dataset.key;
      selected.has(nk) && to !== i ? selected.delete(rows[i].dataset.key) : selected.add(nk);
      anchor = nk; renderSelection();
    }
    rows[to].focus();
    rows[to].scrollIntoView({ block: "nearest" });
  } else if (e.key === "x" || (e.key === " " && !e.repeat)) {
    e.preventDefault(); clickSelect(shown[i], false);
  } else if (mod && e.key === "a") {
    e.preventDefault(); shown.forEach((p) => selected.add(keyOf(p))); renderSelection();
  } else if (e.key === "Escape" && selected.size) {
    e.preventDefault(); e.stopPropagation(); selected.clear(); renderSelection();
  }
});
$("#posts").addEventListener("keyup", (e) => { if (e.key === " ") e.preventDefault(); });
$("#filter").oninput = renderList;
$("#filter").onkeydown = (e) => {
  if (e.key === "Enter") $("#posts .post:not(.deleted)")?.click();
  else if (e.key === "ArrowDown") { e.preventDefault(); $("#posts .post")?.focus(); }
  else if (e.key === "Escape") { $("#filter").value = ""; renderList(); view.focus(); }
};

const hashOf = (k, slug) => "#" + (slug ? (k === "post" ? "" : k + "/") + slug : "");
const parseHash = () => (([a, b]) => (b ? [a, b] : ["post", a]))(decodeURIComponent(location.hash.slice(1)).split("/"));

/** Leaving the open note: unsaved edits are saved, not lost (falls back to asking if the save fails). */
async function leave() {
  if (!dirty) return true;
  if (await save()) return true;
  return confirm("Couldn't save this note. Discard the changes?");
}
async function go(k, slug, push = true) {
  if (k === kind && slug === current) return;
  if (!(await leave())) return;
  await open(k, slug, push);
}
async function open(k, slug, push) {
  const r = await fetch("/api/entry?kind=" + k + "&slug=" + encodeURIComponent(slug));
  const p = await r.json();
  if (!r.ok) { flash("couldn't open: " + p.error, true); return; }
  setKind(k);
  current = p.slug; slugTouched = true;
  F.title.value = p.title; F.summary.value = p.summary; F.date.value = p.publishedAt;
  F.draft.checked = p.draft; F.slug.value = p.slug;
  F.topics.value = p.topics.join(", "); F.pages.value = p.pages.join(", ");
  setBody(p.body); view.dispatch({ selection: { anchor: 0 }, scrollIntoView: true });
  markSaved(); renderPreview(); setListKind(listKind === "all" ? "all" : k); loadBacklinks();
  $("#preview").scrollTop = 0;
  if (push && location.hash !== hashOf(k, slug)) history.pushState(null, "", hashOf(k, slug));
  remember(k, slug);
}
addEventListener("popstate", () => { const [k, s] = parseHash(); if (s && URLS[k]) go(k, s, false); });

async function newEntry(title = "") {
  if (!(await leave())) return;
  // new page made from an open topic → tagged with it
  const fromTopic = kind === "topic" && listKind !== "topic" ? current : null;
  setKind(newKind());
  current = null; slugTouched = false;
  for (const x of [F.title, F.summary, F.slug, F.topics, F.pages]) x.value = "";
  if (fromTopic) F.topics.value = fromTopic;
  F.title.value = title; F.slug.value = title ? slugify(title) : "";
  F.date.value = today(); F.draft.checked = kind !== "topic";
  setBody(""); markSaved(); renderPreview(); loadList(); loadBacklinks();
  history.pushState(null, "", hashOf(kind, ""));
  if (title || document.body.classList.contains("zen")) view.focus();
  else { setMeta(true); F.title.focus(); }
}
$("#new").onclick = () => newEntry();

/** Writes a fresh, empty note to disk (not published). */
async function createNote(k, title, slug = slugify(title)) {
  const payload = { kind: k, slug, prevSlug: null, title, summary: "", publishedAt: today(), draft: k !== "topic", topics: [], pages: [], body: "" };
  const r = await fetch("/api/entry", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
  const j = await r.json();
  if (!r.ok) { flash("couldn't create: " + j.error, true); return false; }
  await loadNotes(); loadList(); schedulePreview();
  flash("created " + NOUN[k] + " “" + title + "” (on disk, not published)");
  return true;
}
/** Open what [[target]] points at — or offer to create it. */
async function follow(target, label) {
  const n = resolve(target);
  if (n) return go(n.kind, n.slug);
  const m = target.trim().match(/^(wiki|blog|post|topics?)\/(.+)$/);
  const k = m ? PREFIX_KIND[m[1]] : "wiki";
  const title = label?.trim() || humanize(target.trim());
  if (!confirm("“" + title + "” doesn't exist yet. Create a " + NOUN[k] + "?")) return;
  if (await createNote(k, title, slugify(m ? m[2] : target))) go(k, slugify(m ? m[2] : target));
}

function ensureSlug() {
  if (!F.slug.value && F.title.value) F.slug.value = slugify(F.title.value);
  return F.slug.value;
}
F.title.oninput = () => { if (!slugTouched) F.slug.value = slugify(F.title.value); refreshDirty(); schedulePreview(); };
F.summary.oninput = () => { refreshDirty(); schedulePreview(); };
F.slug.oninput = () => { slugTouched = true; refreshDirty(); };
F.pages.oninput = () => { refreshDirty(); renderPages(); };
F.topics.oninput = F.date.oninput = F.draft.onchange = refreshDirty;
/** Comma-separated slug field with a dropdown of what exists: ↑↓ choose · ↵/Tab add · Esc close. */
function slugPicker(input, pool, newKind) {
  const box = el("div", "pick");
  box.hidden = true;
  input.after(box);
  let rows = [], sel = 0;
  // the comma-separated item under the cursor
  const token = () => {
    const v = input.value, c = input.selectionStart;
    const a = v.lastIndexOf(",", c - 1) + 1, b = v.indexOf(",", c) < 0 ? v.length : v.indexOf(",", c);
    return { a, b, q: v.slice(a, b).trim() };
  };
  const close = () => { box.hidden = true; rows = []; };
  const render = () => {
    const { a, b, q } = token(), have = new Set(csv(input.value.slice(0, a) + "," + input.value.slice(b)));
    rows = (q ? rank(q, pool()) : byRecent(pool())).filter((n) => !have.has(n.slug)).slice(0, 8)
      .map((n) => ({ title: n.title, sub: (n.kind === "wiki" ? "" : NOUN[n.kind] + " · ") + n.slug, slug: n.slug }));
    if (q && !pool().some((n) => n.slug === slugify(q))) rows.push({ title: "New " + NOUN[newKind] + " “" + q + "”", sub: "", slug: slugify(q), make: q, cls: "new" });
    sel = Math.min(sel, Math.max(0, rows.length - 1));
    box.innerHTML = "";
    rows.forEach((r, i) => {
      const row = el("div", "row" + (r.cls ? " " + r.cls : "") + (i === sel ? " sel" : ""));
      row.append(el("span", "t", r.title), el("span", "s", r.sub));
      row.onmousedown = (e) => { e.preventDefault(); pick(r); };
      box.append(row);
    });
    box.hidden = !rows.length;
    box.querySelector(".sel")?.scrollIntoView({ block: "nearest" });
  };
  const pick = async (r) => {
    const { a, b } = token(), v = input.value;
    const head = [...csv(v.slice(0, a)), r.slug].join(", ") + ", ";
    input.value = head + csv(v.slice(b)).join(", ");
    input.setSelectionRange(head.length, head.length);
    input.dispatchEvent(new Event("input"));
    if (r.make) await createNote(newKind, r.make, r.slug);
    sel = 0; render();
  };
  // focus lands after the last item; the list opens once you start a new one (or press ↓)
  input.addEventListener("focus", () => { const n = input.value.length; input.setSelectionRange(n, n); sel = 0; if (!token().q) render(); });
  input.addEventListener("blur", close);
  input.addEventListener("input", () => { sel = 0; render(); });
  input.addEventListener("click", render);
  input.addEventListener("keydown", (e) => {
    const open = !box.hidden && rows.length;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!open) return render();
      sel = (sel + (e.key === "ArrowDown" ? 1 : rows.length - 1)) % rows.length; render();
    } else if ((e.key === "Enter" || (e.key === "Tab" && token().q)) && open) {
      e.preventDefault(); e.stopImmediatePropagation(); pick(rows[sel]);
    } else if (e.key === "Escape" && open) { e.preventDefault(); e.stopPropagation(); close(); }
  });
}
slugPicker(F.topics, () => notes.filter((n) => n.kind === "topic"), "topic");
slugPicker(F.pages, () => notes.filter((n) => n.kind !== "topic"), "wiki");
for (const x of Object.values(F)) x.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && x.type === "text") { e.preventDefault(); view.focus(); }
});

async function save(andPublish = false) {
  const slug = ensureSlug();
  if (!F.title.value.trim()) { flash("needs a title"); setMeta(true); F.title.focus(); return false; }
  const payload = {
    kind, slug, prevSlug: current, title: F.title.value.trim(), summary: F.summary.value.trim(),
    publishedAt: F.date.value || today(), draft: F.draft.checked,
    topics: csv(F.topics.value), pages: csv(F.pages.value), body: getBody(), publish: andPublish,
  };
  const r = await fetch("/api/entry", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
  const j = await r.json();
  if (!r.ok) { flash("failed: " + j.error, true); return false; }
  if (j.body !== payload.body) setBody(j.body); // image paths followed a slug rename
  const renamed = current && current !== slug;
  current = slug; slugTouched = true; markSaved(); loadList(); loadNotes().then(() => { renderPages(); loadBacklinks(); });
  history.replaceState(null, "", hashOf(kind, slug));
  remember(kind, slug);
  let done = andPublish ? "published ✓ — " + j.gitOut.trim().split("\n").pop() : "saved ✓";
  if (j.relinked.length) done += " · updated links in " + j.relinked.length + " note" + (j.relinked.length > 1 ? "s" : "") + (andPublish ? " (committed too)" : "");
  else if (renamed) done += " · renamed";
  if (j.synced.length) done += " · synced " + j.synced.length + (kind === "topic" ? " note" : " topic") + (j.synced.length > 1 ? "s" : "");
  if (j.warnings.length) flash(done + "  ⚠ " + j.warnings.join(" · "), true);
  else flash(done);
  return true;
}
$("#save").onclick = () => save();
$("#publish").onclick = async () => {
  const draftNote = kind !== "topic" && F.draft.checked ? "\n\n(It's marked Draft, so it'll be committed but hidden on the site.)" : "";
  if (!confirm("Commit + push this " + NOUN[kind] + " to main? Cloudflare Pages will deploy." + draftNote)) return;
  $("#publish").disabled = true; flash("pushing…", true);
  await save(true);
  $("#publish").disabled = false;
};

$("#trash").onclick = async () => {
  if (!current) { if (!dirty || confirm("Discard this unsaved " + NOUN[kind] + "?")) { markSaved(); newEntry(); } return; }
  const linked = backs.length ? "\n\n" + backs.length + " note" + (backs.length > 1 ? "s link" : " links") + " here — those links will go red." : "";
  if (!confirm("Move “" + (F.title.value || current) + "” to the trash?\n\nRestorable from the file manager (or gio trash --restore). Not committed — it stays on the live site until you commit the deletion." + linked)) return;
  const r = await fetch("/api/trash", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ kind, slug: current }) });
  const j = await r.json();
  if (!r.ok) { flash("couldn't trash: " + j.error, true); return; }
  markSaved(); current = null; // nothing left to save
  await loadNotes();
  newEntry();
  flash("trashed " + j.trashed.join(" + "));
};

/* ---------- palette: ⌘P open · ⌘K link · ↩ backlinks ---------- */
let pal = null; // { items: (q) => [{title, sub, run, cls}] }
let palSel = 0, palRows = [];
function palette(mode) {
  const sel = view.state.selection.main;
  const selText = view.state.sliceDoc(sel.from, sel.to);
  const noteItem = (n, run) => ({ title: n.title, sub: (n.kind === "wiki" ? "" : NOUN[n.kind] + " · ") + n.slug + (n.draft ? " · draft" : ""), run });
  const insertLink = (target) => {
    const text = selText && selText !== target ? "[[" + target + "|" + selText + "]]" : "[[" + target + "]]";
    view.dispatch({ changes: { from: sel.from, to: sel.to, insert: text }, selection: { anchor: sel.from + text.length } });
  };
  const modes = {
    open: {
      ph: "Jump to a note…", verb: "open",
      items: (q) => [
        ...(q.trim() ? rank(q, notes) : byRecent(notes).filter((n) => !(n.kind === kind && n.slug === current))).map((n) => noteItem(n, () => go(n.kind, n.slug))),
        ...(q.trim() ? [{ title: "New " + NOUN[newKind()] + " “" + q.trim() + "”", sub: "", cls: "new", run: () => newEntry(q.trim()) }] : []),
      ],
    },
    link: {
      ph: selText ? "Link “" + selText.slice(0, 40) + "” to…" : "Insert a link to…", verb: "link",
      items: (q) => [
        ...(q.trim() || !selText ? rank(q, notes) : rank(selText, notes).concat(byRecent(notes))).filter((n, i, a) => a.indexOf(n) === i)
          .map((n) => noteItem(n, () => insertLink(targetOf(n)))),
        ...((q.trim() || selText) && !resolve(q.trim() || selText) ? [{ title: "New wiki page “" + (q.trim() || selText) + "”", sub: "", cls: "new",
          run: async () => { const tt = q.trim() || selText; insertLink(slugify(tt)); await createNote("wiki", tt); } }] : []),
      ],
    },
    backlinks: { ph: "Notes linking here…", verb: "open", items: (q) => rank(q, backs).map((n) => noteItem(n, () => go(n.kind, n.slug))) },
  };
  pal = modes[mode];
  $("#pal-q").value = ""; $("#pal-q").placeholder = pal.ph; $("#pal-verb").textContent = pal.verb;
  $("#palette").hidden = false; $("#pal-q").focus();
  palRender();
}
function palRender() {
  palRows = pal.items($("#pal-q").value).slice(0, 60);
  palSel = Math.min(palSel, Math.max(0, palRows.length - 1));
  const list = $("#pal-list");
  list.innerHTML = "";
  if (!palRows.length) list.append(el("div", "none", "Nothing matches."));
  palRows.forEach((r, i) => {
    const row = el("div", "row" + (r.cls ? " " + r.cls : "") + (i === palSel ? " sel" : ""));
    row.append(el("span", "t", r.title), el("span", "s", r.sub));
    row.onmousemove = () => { if (palSel !== i) { palSel = i; palRender(); } };
    row.onclick = () => palRun(i);
    list.append(row);
  });
  list.querySelector(".sel")?.scrollIntoView({ block: "nearest" });
}
function palClose() { $("#palette").hidden = true; pal = null; view.focus(); }
function palRun(i) { const r = palRows[i]; palClose(); r?.run(); }
$("#pal-q").oninput = () => { palSel = 0; palRender(); };
$("#pal-q").onkeydown = (e) => {
  if (e.key === "ArrowDown") { e.preventDefault(); palSel = Math.min(palRows.length - 1, palSel + 1); palRender(); }
  else if (e.key === "ArrowUp") { e.preventDefault(); palSel = Math.max(0, palSel - 1); palRender(); }
  else if (e.key === "Enter") { e.preventDefault(); palRun(palSel); }
  else if (e.key === "Escape") { e.preventDefault(); palClose(); }
};
$("#palette").onmousedown = (e) => { if (e.target === $("#palette")) palClose(); };

/* ---------- global keys ---------- */
addEventListener("keydown", (e) => {
  const mod = e.metaKey || e.ctrlKey;
  if (pal && !(mod && e.key === "p")) return; // palette owns the keyboard
  if (mod && !e.shiftKey && e.key === "s") { e.preventDefault(); save(); }
  else if (mod && e.key === "p") { e.preventDefault(); pal ? palClose() : palette("open"); }
  else if (mod && e.key === "k") { e.preventDefault(); palette("link"); }
  else if (e.key === "/" && !mod && !e.target.closest("input, textarea, .cm-editor")) { e.preventDefault(); if (document.body.classList.contains("zen")) setZen(false); $("#filter").focus(); $("#filter").select(); }
  else if (mod && e.key === ";") { e.preventDefault(); setSpell(!spellOn); }
  else if (mod && e.key === ".") { e.preventDefault(); setZen(!document.body.classList.contains("zen")); }
  else if (e.altKey && e.key === "ArrowLeft") { e.preventDefault(); history.back(); }
  else if (e.altKey && e.key === "ArrowRight") { e.preventDefault(); history.forward(); }
  else if (e.key === "Escape" && !e.defaultPrevented && document.body.classList.contains("zen") && !completionStatus(view.state)) setZen(false);
});

window.addEventListener("beforeunload", (e) => { if (dirty) e.preventDefault(); });

await loadNotes();
// #slug = post, #wiki/slug, #topic/slug
const [hashKind, hashSlug] = parseHash();
if (hashSlug && URLS[hashKind]) await open(hashKind, hashSlug, false);
else { setListKind(URLS[store.get("blog-admin-kind", "post")] ? store.get("blog-admin-kind", "post") : "post"); newEntry(); }
</script>
</body>
</html>`;

createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");
  const json = (code, body) => {
    res.writeHead(code, { "content-type": "application/json" });
    res.end(JSON.stringify(body));
  };
  try {
    if (req.method === "GET" && url.pathname === "/") {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end(PAGE);
    } else if (req.method === "GET" && url.pathname === "/api/list") {
      json(200, listEntries(url.searchParams.get("kind") || "post"));
    } else if (req.method === "GET" && url.pathname === "/api/notes") {
      json(200, noteIndex(ROOT));
    } else if (req.method === "GET" && url.pathname === "/api/backlinks") {
      json(200, backlinks(url.searchParams.get("kind") || "post", url.searchParams.get("slug") || ""));
    } else if (req.method === "GET" && url.pathname === "/api/entry") {
      const slug = url.searchParams.get("slug");
      if (!SLUG_RE.test(slug || "")) return json(400, { error: "bad slug" });
      json(200, readEntry(url.searchParams.get("kind") || "post", slug));
    } else if (req.method === "POST" && url.pathname === "/api/entry") {
      const p = JSON.parse(await readBody(req));
      const renamed = p.prevSlug && p.prevSlug !== p.slug;
      const before = renamed ? noteIndex(ROOT) : null;
      const was = p.prevSlug ? readEntry(p.kind, p.prevSlug) : { topics: [], pages: [] };
      const body = writeEntry(p);
      const relinked = renamed ? rewriteRefs(p.kind, p.prevSlug, p.slug, before).filter((f) => f !== fileOf(p.kind, p.slug)) : [];
      const synced = syncTopics(p, was).filter((f) => f !== fileOf(p.kind, p.slug));
      // the renamed note may link to itself — re-read so the editor gets the rewritten body
      const finalBody = renamed ? readEntry(p.kind, p.slug).body : body;
      const gitOut = p.publish ? publish(p.kind, p.slug, p.prevSlug, p.title, [...new Set([...relinked, ...synced])]) : "";
      json(200, { ok: true, gitOut, warnings: unknownRefs(p), relinked, synced, body: finalBody.trim() === p.body.trim() ? p.body : finalBody });
    } else if (req.method === "POST" && url.pathname === "/api/trash") {
      const p = JSON.parse(await readBody(req));
      json(200, { ok: true, trashed: trashEntry(p.kind, p.slug) });
    } else if (req.method === "POST" && url.pathname === "/api/bulk") {
      json(200, { ok: true, ...bulk(JSON.parse(await readBody(req))) });
    } else if (req.method === "POST" && url.pathname === "/api/preview") {
      const md = String(await readBody(req));
      const linked = linkNotes(md, noteIndex(ROOT), {
        includeDrafts: true,
        missing: (label, target) => `[${label}](#missing:${encodeURIComponent(target)})`,
      });
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end(await render(linked));
    } else if (req.method === "POST" && url.pathname === "/api/upload") {
      const slug = url.searchParams.get("slug") || "";
      if (!SLUG_RE.test(slug)) return json(400, { error: "bad slug" });
      const imgDir = kindOf(url.searchParams.get("kind") || "post").img;
      const raw = url.searchParams.get("name") || "image.png";
      const ext = (extname(raw).toLowerCase() || ".png").replace(".jpeg", ".jpg");
      if (!MIME[ext]?.startsWith("image/")) return json(400, { error: "not an image" });
      let base = slugify(raw.slice(0, -extname(raw).length || undefined)) || "image";
      if (base === "image" || base === "pasted") base = `img-${Date.now().toString(36)}`;
      const dir = join(PUBLIC, imgDir, slug);
      mkdirSync(dir, { recursive: true });
      let name = base + ext;
      for (let i = 2; existsSync(join(dir, name)); i++) name = `${base}-${i}${ext}`;
      writeFileSync(join(dir, name), await readBody(req));
      json(200, { url: `/${imgDir}/${slug}/${name}` });
    } else if (req.method === "GET" && /^\/(blog|wiki|topics)\/.+\.\w+$/.test(url.pathname)) {
      const rel = decodeURIComponent(url.pathname).replace(/\.\.+/g, "");
      serveFile(res, join(PUBLIC, rel));
    } else if (req.method === "GET" && url.pathname === "/lib/footnotes.mjs") {
      serveFile(res, join(LIB, "footnotes.mjs"));
    } else if (req.method === "GET" && url.pathname.startsWith("/fonts/")) {
      serveFile(res, join(FONTS, decodeURIComponent(url.pathname.slice(7)).replace(/\.\.+/g, "")));
    } else {
      res.writeHead(404).end();
    }
  } catch (e) {
    json(500, { error: String(e.stderr || e.message || e) });
  }
}).listen(PORT, "127.0.0.1", () => {
  console.log(`blog admin → http://127.0.0.1:${PORT}`);
});
