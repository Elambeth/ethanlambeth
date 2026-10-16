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
 * Publish button = git commit + push of that one entry (Cloudflare Pages deploys on push).
 */
import { createServer } from "http";
import { execFileSync } from "child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "fs";
import { extname, join } from "path";
import matter from "gray-matter";
import rehypePrettyCode from "rehype-pretty-code";
import rehypeStringify from "rehype-stringify";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import { unified } from "unified";
import { WIKILINK, linkNotes, noteIndex, rehypeImageSize, resolveTarget, slugify } from "../src/lib/notes.mjs";

const ROOT = join(import.meta.dirname, "..");
const PUBLIC = join(ROOT, "public");
const FONTS = join(ROOT, "node_modules/geist/dist/fonts");
const PORT = Number(process.env.PORT) || 4174;

const SLUG_RE = /^[A-Za-z0-9_-]+$/;
const MIME = {
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif",
  ".webp": "image/webp", ".avif": "image/avif", ".svg": "image/svg+xml",
  ".woff2": "font/woff2", ".html": "text/html; charset=utf-8",
};

// Same pipeline as markdownToHTML in src/data/blog.ts
const pipeline = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkRehype)
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

function listEntries(kind) {
  kindOf(kind);
  const rows = slugsOf(kind).map((slug) => {
    const { data } = matter(readFileSync(join(ROOT, fileOf(kind, slug)), "utf8"));
    return {
      slug, title: data.title || slug, publishedAt: dateStr(data.publishedAt), draft: !!data.draft,
      topics: list(data.topics), pages: list(data.pages),
    };
  });
  return kind === "post"
    ? rows.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))
    : rows.sort((a, b) => a.title.localeCompare(b.title));
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

function publish(kind, slug, prevSlug, title, alsoFiles = []) {
  const K = kindOf(kind);
  const git = (...args) => execFileSync("git", args, { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  const paths = [fileOf(kind, slug), ...alsoFiles];
  if (existsSync(join(PUBLIC, K.img, slug))) paths.push(`public/${K.img}/${slug}`);
  if (prevSlug && prevSlug !== slug) paths.push(fileOf(kind, prevSlug), `public/${K.img}/${prevSlug}`);
  const tracked = paths.filter((p) => existsSync(join(ROOT, p)) || git("ls-files", "--", p).trim());
  git("add", "-A", "--", ...tracked);
  if (!git("diff", "--cached", "--name-only", "--", ...tracked).trim()) return "nothing to commit";
  git("commit", "--no-verify", "-m", `${K.msg}: ${title || slug}`, "--", ...tracked);
  return git("push") || "pushed";
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
         display: grid; grid-template-columns: 240px 1fr; overflow: hidden; transition: grid-template-columns .18s ease; }
  body.nosidebar, body.zen { grid-template-columns: 0 1fr; }
  button, input { font: inherit; color: inherit; }
  button { background: transparent; border: 1px solid var(--border); border-radius: 8px; padding: 5px 12px; cursor: pointer; }
  button:hover { background: var(--soft); }
  button:disabled { opacity: .45; cursor: default; }
  button.primary { background: var(--fg); color: var(--bg); border-color: var(--fg); }
  button.primary:hover { opacity: .85; }
  button.icon { padding: 5px 9px; }
  kbd { font: 11px "Geist Mono", monospace; color: var(--muted); border: 1px solid var(--border); border-radius: 4px; padding: 0 4px; }

  /* sidebar */
  aside { border-right: 1px solid var(--border); background: var(--panel); display: flex; flex-direction: column; min-width: 0; overflow: hidden; }
  aside .top { display: flex; align-items: center; justify-content: space-between; padding: 14px 14px 10px; }
  aside .top b { font-size: 13px; font-weight: 600; }
  #kinds { margin: 0 14px 8px; display: flex; flex: none; }
  #kinds button { flex: 1; }
  #filter { margin: 0 14px 8px; border: 1px solid var(--border); border-radius: 7px; background: var(--bg); padding: 5px 8px; font-size: 13px; outline: none; }
  #filter:focus { border-color: var(--muted); }
  #posts { overflow-y: auto; padding: 0 8px 16px; }
  .post { display: block; width: 100%; text-align: left; border: 0; border-radius: 7px; padding: 7px 8px; }
  .post.active { background: var(--soft); }
  .post .t { display: block; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  body.dirty .post.active .t::before { content: "● "; color: var(--warn); }
  .post .d { font-size: 11.5px; color: var(--muted); }
  .badge { font-size: 10px; text-transform: uppercase; letter-spacing: .04em; border: 1px solid var(--border);
           border-radius: 4px; padding: 0 4px; margin-left: 4px; color: var(--muted); }
  aside .keys { margin-top: auto; padding: 10px 14px 12px; border-top: 1px solid var(--border); font-size: 11.5px; color: var(--muted);
                display: grid; grid-template-columns: auto 1fr; gap: 4px 8px; align-items: center; }

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
  #togglemeta.on, #zenbtn.on { background: var(--soft); }

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

  #panes { grid-row: 3; display: grid; grid-template-columns: 1fr 1fr; min-height: 0; }
  body.mode-write #panes { grid-template-columns: 1fr 0; }
  body.mode-preview #panes { grid-template-columns: 0 1fr; }
  #editor, #preview { min-height: 0; overflow: hidden; }
  body.mode-split #editor { border-right: 1px solid var(--border); }
  #editor .cm-editor { height: 100%; outline: none !important; }
  #editor .cm-scroller { font: 15px/1.7 "Geist Mono", ui-monospace, monospace; padding: 28px 0 40vh; }
  #editor .cm-content { max-width: 72ch; margin: 0 auto; padding: 0 28px; caret-color: var(--fg); }
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
  .empty { color: var(--muted); }

  /* zen: no chrome — header slides in when the pointer touches the top edge */
  #peek { display: none; position: fixed; inset: 0 0 auto 0; height: 10px; z-index: 30; }
  body.zen #peek { display: block; }
  body.zen main { grid-template-rows: minmax(0, 1fr); }
  body.zen #panes { grid-row: 1; }
  body.zen header { position: fixed; inset: 0 0 auto 0; z-index: 31; transform: translateY(-100%); opacity: 0;
                    transition: transform .2s ease, opacity .2s ease; box-shadow: 0 1px 0 var(--border); }
  body.zen.peek header, body.zen header:focus-within { transform: none; opacity: 1; }
  body.zen #editor .cm-scroller { font-size: 16.5px; line-height: 1.8; padding-top: 12vh; }
  body.zen.mode-split #panes { grid-template-columns: 1fr 0; } /* zen = write; the Preview tab still works */
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
  #pal-foot { border-top: 1px solid var(--border); padding: 7px 14px; font-size: 11.5px; color: var(--muted); display: flex; gap: 14px; }

  @media (max-width: 800px) {
    body { grid-template-columns: 0 1fr; }
    #meta { grid-template-columns: 1fr 1fr; }
    body.mode-split #panes { grid-template-columns: 1fr 0; }
  }
</style>
</head>
<body class="mode-split">
<script>try {
  if (localStorage.getItem("blog-admin-theme") === "dark") document.documentElement.dataset.theme = "dark";
  if (localStorage.getItem("blog-admin-zen") === "1") document.body.classList.add("zen");
  if (localStorage.getItem("blog-admin-nometa") === "1") document.body.classList.add("nometa");
} catch {}</script>
<aside>
  <div class="top"><b>Writing</b><button id="new" title="New">+ New</button></div>
  <div class="seg" id="kinds">
    <button data-kind="post">Posts</button><button data-kind="topic">Topics</button><button data-kind="wiki">Wiki</button>
  </div>
  <input id="filter" type="text" placeholder="Filter…" spellcheck="false">
  <div id="posts"></div>
  <div class="keys">
    <kbd>⌘P</kbd><span>jump to any note</span>
    <kbd>[[</kbd><span>link a note</span>
    <kbd>⌘K</kbd><span>link the selection</span>
    <kbd>⌘-click</kbd><span>follow a link</span>
    <kbd>⌘.</kbd><span>zen mode</span>
    <kbd>Alt ←</kbd><span>back</span>
  </div>
</aside>
<main>
  <div id="peek"></div>
  <header>
    <button id="toggleside" class="icon" title="Toggle sidebar">☰</button>
    <div id="crumb"></div>
    <span id="dirty" title="Changes not written to disk yet — ⌘/Ctrl+S">Unsaved</span>
    <span id="msg"></span>
    <button id="backs" hidden title="Notes linking here"></button>
    <div class="seg" id="modes">
      <button data-mode="write">Write</button><button data-mode="split">Split</button><button data-mode="preview">Preview</button>
    </div>
    <button id="togglemeta" class="icon" title="Show / hide title, summary, slug">Details</button>
    <button id="zenbtn" class="icon" title="Zen mode — ⌘/Ctrl+.  (Esc leaves)">Zen</button>
    <button id="theme" class="icon" title="Light / dark"></button>
    <button id="save" title="⌘/Ctrl+S">Save</button>
    <button id="publish" class="primary" title="Save, commit this post, push — Cloudflare Pages deploys">Publish</button>
  </header>
  <div id="meta">
    <label>Title<input type="text" id="f-title" placeholder="Title"></label>
    <label>Summary<input type="text" id="f-summary" placeholder="One line, shown under the title and in the list"></label>
    <label class="only-post">Date<input type="date" id="f-date"></label>
    <label class="check no-topic" title="Drafts are saved but hidden from the site"><input type="checkbox" id="f-draft"> Draft</label>
    <label class="wide no-topic"><span>Topics <span class="refs" id="topics-known"></span></span><input type="text" id="f-topics" spellcheck="false" placeholder="comma separated, e.g. ar, interfaces"></label>
    <label class="wide only-topic"><span>Pages, in reading order <span class="refs">(wiki or post slugs, comma separated; tagged ones not listed here go last)</span></span><input type="text" id="f-pages" spellcheck="false" placeholder="layers, faces, …"></label>
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
import { keymap, placeholder, Decoration, WidgetType, hoverTooltip } from "https://esm.sh/@codemirror/view@6";
import { EditorSelection, Prec, StateEffect, StateField } from "https://esm.sh/@codemirror/state@6";
import { indentWithTab } from "https://esm.sh/@codemirror/commands@6";
import { autocompletion, completionStatus } from "https://esm.sh/@codemirror/autocomplete@6";
import { markdown, markdownLanguage } from "https://esm.sh/@codemirror/lang-markdown@6";
import { languages } from "https://esm.sh/@codemirror/language-data@6";
import { HighlightStyle, syntaxHighlighting } from "https://esm.sh/@codemirror/language@6";
import { tags as t } from "https://esm.sh/@lezer/highlight@1";

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
  { tag: t.heading1, fontWeight: "700", fontSize: "1.25em" },
  { tag: t.heading2, fontWeight: "700", fontSize: "1.12em" },
  { tag: [t.heading3, t.heading4, t.heading5, t.heading6], fontWeight: "700" },
  { tag: t.strong, fontWeight: "700" },
  { tag: t.emphasis, fontStyle: "italic" },
  { tag: t.strikethrough, textDecoration: "line-through" },
  { tag: [t.link, t.url], color: "var(--muted)", textDecoration: "underline" },
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
function scan(doc) {
  const imgs = [], links = [];
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
  }
  return { imgs, links };
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
const markLink = (ok) => Decoration.mark({ class: ok ? "cm-wl" : "cm-wl missing" });
const markBr = Decoration.mark({ class: "cm-wl-br" });
function buildDeco(state) {
  const { imgs, links } = scan(state.doc);
  const out = [];
  const seen = {};
  for (const i of imgs) {
    const idx = (seen[i.src] = (seen[i.src] ?? -1) + 1);
    out.push(Decoration.widget({ widget: new ImgWidget(i.src, i.width, idx), block: true, side: 1 }).range(i.lineTo));
  }
  for (const l of links) {
    // [[target|label]]: brackets + "target|" recede, the label reads as the link
    const at = l.label === undefined ? l.from + 2 : l.from + 3 + l.target.length;
    out.push(markBr.range(l.from, at), markLink(!!resolve(l.target)).range(at, l.to - 2), markBr.range(l.to - 2, l.to));
  }
  return Decoration.set(out, true);
}
const decoField = StateField.define({
  create: buildDeco,
  update: (d, tr) => (tr.docChanged || tr.effects.some((e) => e.is(refreshDeco)) ? buildDeco(tr.state) : d),
  provide: (f) => EditorView.decorations.from(f),
});
const linkAt = (state, pos) => scan(state.doc).links.find((l) => pos >= l.from && pos <= l.to);

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

const view = new EditorView({
  parent: $("#editor"),
  extensions: [
    Prec.high(keymap.of([
      { key: "Mod-b", run: wrap("**") },
      { key: "Mod-i", run: wrap("_") },
      { key: "Mod-\\", run: () => (cycleMode(), true) },
      { key: "Mod-Enter", run: (v) => { const l = linkAt(v.state, v.state.selection.main.head); if (!l) return false; follow(l.target, l.label); return true; } },
    ])),
    minimalSetup,
    EditorView.lineWrapping,
    markdown({ base: markdownLanguage, codeLanguages: languages }),
    syntaxHighlighting(mdStyle),
    placeholder("Start writing…  ([[ links a note · paste or drop images, then drag their corner to size)"),
    keymap.of([indentWithTab]),
    decoField,
    linkTip,
    autocompletion({ override: [wikiComplete], icons: false, closeOnBlur: true }),
    EditorView.updateListener.of((u) => { if (u.docChanged) { refreshDirty(); schedulePreview(); } }),
    EditorView.domEventHandlers({
      mousedown: (e, v) => {
        if (!(e.metaKey || e.ctrlKey)) return false;
        const pos = v.posAtCoords({ x: e.clientX, y: e.clientY });
        const l = pos != null && linkAt(v.state, pos);
        if (!l) return false;
        e.preventDefault(); follow(l.target, l.label);
        return true;
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
$("#preview").addEventListener("click", (e) => {
  const a = e.target.closest("a[href]");
  if (!a) return;
  const href = a.getAttribute("href");
  let m;
  if ((m = href.match(/^#missing:(.+)$/))) { e.preventDefault(); follow(decodeURIComponent(m[1]), a.textContent); }
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
  const text = words + " words · " + Math.max(1, Math.round(words / 230)) + " min read";
  $("#msg").textContent = text;
  $("#zenstat").textContent = words + " words";
}

/* ---------- modes, zen, chrome ---------- */
const MODES = ["write", "split", "preview"];
function setMode(m) {
  document.body.classList.remove(...MODES.map((x) => "mode-" + x));
  document.body.classList.add("mode-" + m);
  document.querySelectorAll("#modes button").forEach((b) => b.classList.toggle("on", b.dataset.mode === m));
  store.set("blog-admin-mode", m);
}
const cycleMode = () => {
  const cur = MODES.find((m) => document.body.classList.contains("mode-" + m));
  setMode(MODES[(MODES.indexOf(cur) + 1) % 3]);
};
document.querySelectorAll("#modes button").forEach((b) => (b.onclick = () => setMode(b.dataset.mode)));
setMode(store.get("blog-admin-mode", "split"));
$("#toggleside").onclick = () => document.body.classList.toggle("nosidebar");
const themeIcon = () => ($("#theme").textContent = document.documentElement.dataset.theme === "dark" ? "☀" : "☾");
$("#theme").onclick = () => {
  const dark = document.documentElement.dataset.theme !== "dark";
  if (dark) document.documentElement.dataset.theme = "dark"; else delete document.documentElement.dataset.theme;
  store.set("blog-admin-theme", dark ? "dark" : "light");
  themeIcon();
};
themeIcon();
function setZen(on) {
  document.body.classList.toggle("zen", on);
  document.body.classList.remove("peek");
  $("#zenbtn").classList.toggle("on", on);
  store.set("blog-admin-zen", on ? "1" : "0");
  if (on) { flash("zen — move to the top edge for the menu, Esc to leave"); view.focus(); }
}
$("#zenbtn").onclick = () => setZen(!document.body.classList.contains("zen"));
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
function setListKind(k) {
  listKind = k;
  document.querySelectorAll("#kinds button").forEach((b) => b.classList.toggle("on", b.dataset.kind === k));
  $("#new").title = "New " + NOUN[k];
  store.set("blog-admin-kind", k);
  loadList();
}
document.querySelectorAll("#kinds button").forEach((b) => (b.onclick = () => setListKind(b.dataset.kind)));

/* ---------- list ---------- */
let entries = [];
async function loadList() {
  const k = listKind;
  const rows = await fetch("/api/list?kind=" + k).then((r) => r.json());
  if (k !== listKind) return; // tab switched mid-fetch
  entries = rows;
  renderList();
}
function renderList() {
  const k = listKind, q = $("#filter").value.trim().toLowerCase();
  $("#posts").innerHTML = "";
  for (const p of entries) {
    if (q && !(p.title.toLowerCase().includes(q) || p.slug.includes(q))) continue;
    const b = el("button", "post" + (k === kind && p.slug === current ? " active" : ""));
    b.append(el("span", "t", p.title), el("span", "d", k === "post" ? p.publishedAt : k === "topic" ? p.pages.length + " pages" : p.topics.join(", ") || "no topic"));
    if (p.draft) b.querySelector(".d").insertAdjacentHTML("beforeend", '<span class="badge">draft</span>');
    b.onclick = () => go(k, p.slug);
    $("#posts").append(b);
  }
}
$("#filter").oninput = renderList;
$("#filter").onkeydown = (e) => { if (e.key === "Enter") $("#posts .post")?.click(); if (e.key === "Escape") { $("#filter").value = ""; renderList(); view.focus(); } };

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
  markSaved(); renderPreview(); setListKind(k); loadBacklinks();
  $("#preview").scrollTop = 0;
  if (push && location.hash !== hashOf(k, slug)) history.pushState(null, "", hashOf(k, slug));
  remember(k, slug);
}
addEventListener("popstate", () => { const [k, s] = parseHash(); if (s && URLS[k]) go(k, s, false); });

async function newEntry(title = "") {
  if (!(await leave())) return;
  setKind(listKind);
  current = null; slugTouched = false;
  for (const x of [F.title, F.summary, F.slug, F.topics, F.pages]) x.value = "";
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
        ...(q.trim() ? [{ title: "New " + NOUN[listKind] + " “" + q.trim() + "”", sub: "", cls: "new", run: () => newEntry(q.trim()) }] : []),
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
      const body = writeEntry(p);
      const relinked = renamed ? rewriteRefs(p.kind, p.prevSlug, p.slug, before).filter((f) => f !== fileOf(p.kind, p.slug)) : [];
      // the renamed note may link to itself — re-read so the editor gets the rewritten body
      const finalBody = renamed ? readEntry(p.kind, p.slug).body : body;
      const gitOut = p.publish ? publish(p.kind, p.slug, p.prevSlug, p.title, relinked) : "";
      json(200, { ok: true, gitOut, warnings: unknownRefs(p), relinked, body: finalBody.trim() === p.body.trim() ? p.body : finalBody });
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
