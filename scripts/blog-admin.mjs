#!/usr/bin/env node
/**
 * Local admin for /blog, /topics and /wiki — never deployed.
 *
 *   node scripts/blog-admin.mjs   (or: pnpm admin:blog)
 *
 * Serves http://127.0.0.1:4174 — CodeMirror markdown editor + live preview
 * rendered through the site's own pipeline (src/data/blog.ts settings).
 * Posts → content/<slug>.mdx, topics → content/topics/<slug>.md, wiki → content/wiki/<slug>.md.
 * Paste/drop images → public/{blog,topics,wiki}/<slug>/.
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

const ROOT = join(import.meta.dirname, "..");
const CONTENT = join(ROOT, "content");
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
  .use(rehypePrettyCode, { theme: { light: "min-light", dark: "min-dark" }, keepBackground: false })
  .use(rehypeStringify);
const render = async (md) => String(await pipeline.process(md));

const dateStr = (d) => (d instanceof Date ? d.toISOString().slice(0, 10) : String(d ?? ""));
const list = (v) => (Array.isArray(v) ? v.map(String) : v ? [String(v)] : []);

// What the admin edits. `own` = frontmatter keys the form owns; everything else is kept verbatim.
// `img` = public/<img>/<slug>/ for pasted images; `msg` = commit message prefix.
const KINDS = {
  post: { dir: "content", ext: ".mdx", img: "blog", msg: "blog", own: ["title", "publishedAt", "summary", "topics", "draft"] },
  topic: { dir: "content/topics", ext: ".md", img: "topics", msg: "topic", own: ["title", "summary", "pages"] },
  wiki: { dir: "content/wiki", ext: ".md", img: "wiki", msg: "wiki", own: ["title", "summary", "topics"] },
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

/** Files that still point at a renamed wiki page via [[old]] or a topic's pages list. */
function referrers(kind, oldSlug) {
  if (kind !== "wiki") return [];
  const esc = oldSlug.replace(/[-]/g, "\\-");
  const link = new RegExp(`\\[\\[\\s*${esc}\\s*(\\||\\]\\])`);
  const listed = new RegExp(`^\\s*-\\s*${esc}\\s*$`, "m");
  return [...slugsOf("wiki").map((s) => ["wiki", s]), ...slugsOf("topic").map((s) => ["topic", s])]
    .map(([k, s]) => fileOf(k, s))
    .filter((f) => {
      const text = readFileSync(join(ROOT, f), "utf8");
      return link.test(text) || listed.test(text);
    });
}

function writeEntry({ kind, slug, prevSlug, title, summary, publishedAt, draft, topics = [], pages = [], body }) {
  const K = kindOf(kind);
  if (!SLUG_RE.test(slug)) throw new Error("slug: letters, numbers, - and _ only");
  const file = join(ROOT, fileOf(kind, slug));
  const prev = prevSlug && prevSlug !== slug ? join(ROOT, fileOf(kind, prevSlug)) : null;
  if ((prev || !prevSlug) && existsSync(file)) throw new Error(`${fileOf(kind, slug)} already exists`);

  // keep frontmatter the editor doesn't know about (gallery, image, …) verbatim
  const extra = prevSlug ? extraFrontmatter(kind, prevSlug) : "";
  const inline = (xs) => `[${xs.join(", ")}]`;
  const fm = [`title: ${JSON.stringify(title)}`];
  if (kind === "post") fm.push(`publishedAt: ${JSON.stringify(publishedAt)}`);
  fm.push(`summary: ${JSON.stringify(summary)}`);
  if (kind !== "topic" && topics.length) fm.push(`topics: ${inline(topics)}`);
  if (kind === "topic") fm.push(pages.length ? ["pages:", ...pages.map((p) => `  - ${p}`)].join("\n") : "pages: []");
  if (kind === "post" && draft) fm.push("draft: true");
  mkdirSync(join(ROOT, K.dir), { recursive: true });
  writeFileSync(file, `---\n${fm.join("\n")}\n${extra}---\n\n${body.trim()}\n`);

  if (prev) {
    unlinkSync(prev); // slug renamed — new file already written
    const oldImgs = join(PUBLIC, K.img, prevSlug);
    if (existsSync(oldImgs) && !existsSync(join(PUBLIC, K.img, slug))) {
      renameSync(oldImgs, join(PUBLIC, K.img, slug));
    }
  }
}

function publish(kind, slug, prevSlug, title) {
  const K = kindOf(kind);
  const git = (...args) => execFileSync("git", args, { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  const paths = [fileOf(kind, slug)];
  if (existsSync(join(PUBLIC, K.img, slug))) paths.push(`public/${K.img}/${slug}`);
  if (prevSlug && prevSlug !== slug) paths.push(fileOf(kind, prevSlug), `public/${K.img}/${prevSlug}`);
  const tracked = paths.filter((p) => existsSync(join(ROOT, p)) || git("ls-files", "--", p).trim());
  git("add", "-A", "--", ...tracked);
  if (!git("diff", "--cached", "--name-only", "--", ...tracked).trim()) return "nothing to commit";
  git("commit", "--no-verify", "-m", `${K.msg}: ${title || slug}`, "--", ...tracked);
  return git("push") || "pushed";
}

// [[slug]] / [[slug|text]] → markdown links, as renderWiki in src/data/wiki.ts
const WIKILINK = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g;
function linkWiki(md) {
  const titles = new Map(listEntries("wiki").map((p) => [p.slug, p.title]));
  return md.replace(WIKILINK, (_, slug, text) => {
    const target = slug.trim();
    const label = text?.trim() ?? titles.get(target) ?? target;
    return titles.has(target) ? `[${label}](/wiki/${target})` : label;
  });
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
    --border: hsl(0 0% 88%); --accent: #1d4ed8; --panel: hsl(40 20% 97.5%); --warn: #d97706;
    color-scheme: light;
  }
  /* light by default; ☀/☾ button switches */
  :root[data-theme="dark"] {
    --bg: hsl(0 0% 7%); --fg: hsl(0 0% 92%); --muted: hsl(0 0% 64%); --soft: hsl(0 0% 16%);
    --border: hsl(0 0% 20%); --accent: #3b82f6; --panel: hsl(0 0% 9%); --warn: #f59e0b;
    color-scheme: dark;
  }
  pre[data-theme] span { color: var(--shiki-light); }
  :root[data-theme="dark"] pre[data-theme] span { color: var(--shiki-dark); }
  * { box-sizing: border-box; }
  html, body { height: 100%; }
  body { margin: 0; font: 14px/1.45 Geist, system-ui, sans-serif; background: var(--bg); color: var(--fg);
         display: grid; grid-template-columns: 240px 1fr; overflow: hidden; }
  body.nosidebar { grid-template-columns: 0 1fr; }
  button, input { font: inherit; color: inherit; }
  button { background: transparent; border: 1px solid var(--border); border-radius: 8px; padding: 5px 12px; cursor: pointer; }
  button:hover { background: var(--soft); }
  button:disabled { opacity: .45; cursor: default; }
  button.primary { background: var(--fg); color: var(--bg); border-color: var(--fg); }
  button.primary:hover { opacity: .85; }
  kbd { font: 11px "Geist Mono", monospace; color: var(--muted); }

  /* sidebar */
  aside { border-right: 1px solid var(--border); background: var(--panel); display: flex; flex-direction: column; min-width: 0; overflow: hidden; }
  aside .top { display: flex; align-items: center; justify-content: space-between; padding: 14px 14px 10px; }
  aside .top b { font-size: 13px; font-weight: 600; }
  #kinds { margin: 0 14px 10px; display: flex; flex: none; }
  #kinds button { flex: 1; }
  #posts { overflow-y: auto; padding: 0 8px 16px; }
  .post { display: block; width: 100%; text-align: left; border: 0; border-radius: 7px; padding: 7px 8px; }
  .post.active { background: var(--soft); }
  .post .t { display: block; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  body.dirty .post.active .t::before { content: "● "; color: var(--warn); }
  .post .d { font-size: 11.5px; color: var(--muted); }
  .badge { font-size: 10px; text-transform: uppercase; letter-spacing: .04em; border: 1px solid var(--border);
           border-radius: 4px; padding: 0 4px; margin-left: 4px; color: var(--muted); }

  /* main */
  main { display: grid; grid-template-rows: auto auto 1fr; min-width: 0; min-height: 0; }
  header { display: flex; gap: 8px; align-items: center; padding: 10px 16px; border-bottom: 1px solid var(--border); }
  #msg { margin-right: auto; font-size: 12px; color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  /* unsaved: amber pill in the header, amber Save, ● on the sidebar row and the tab title */
  #dirty { display: none; flex: none; align-items: center; gap: 6px; font-size: 12px; font-weight: 500; color: var(--warn);
           border: 1px solid color-mix(in srgb, var(--warn) 45%, transparent); background: color-mix(in srgb, var(--warn) 10%, transparent);
           border-radius: 999px; padding: 2px 10px 2px 8px; }
  #dirty::before { content: ""; width: 7px; height: 7px; border-radius: 50%; background: var(--warn); }
  body.dirty #dirty { display: inline-flex; }
  body.dirty #save { border-color: var(--warn); color: var(--warn); font-weight: 600; }
  body:not(.dirty) #save { opacity: .45; }
  .seg { display: inline-flex; border: 1px solid var(--border); border-radius: 8px; overflow: hidden; }
  .seg button { border: 0; border-radius: 0; padding: 5px 10px; }
  .seg button.on { background: var(--soft); }
  #meta { display: grid; grid-template-columns: 1fr 1fr 130px auto; gap: 8px; padding: 10px 16px; border-bottom: 1px solid var(--border); }
  #meta label { display: flex; flex-direction: column; gap: 3px; font-size: 11px; color: var(--muted); }
  #meta label.check { flex-direction: row; align-items: center; gap: 6px; padding-top: 14px; font-size: 13px; color: var(--fg); }
  #meta input[type=text], #meta input[type=date] { width: 100%; background: transparent; border: 1px solid var(--border);
      border-radius: 7px; padding: 6px 8px; font-size: 13.5px; outline: none; }
  #meta input:focus { border-color: var(--muted); }
  #meta .wide { grid-column: 1 / -1; }
  body:not(.kind-post) #meta { grid-template-columns: 1fr 1fr; }
  body:not(.kind-post) .only-post, body.kind-topic .no-topic, body:not(.kind-topic) .only-topic { display: none !important; }
  .refs { font-size: 11px; color: var(--muted); }
  .page .notes-h { margin: 56px 0 0; padding-bottom: 12px; border-bottom: 1px solid var(--border); font-size: .875rem; font-weight: 500; }
  .page .notes { list-style: none; margin: 0; padding: 0; }
  .page .notes li { padding: 14px 0; border-bottom: 1px solid var(--border); }
  .page .notes li span { color: var(--muted); }
  .page .notes li.missing { color: #dc2626; }
  body.kind-topic .prose { margin-top: 24px; color: var(--muted); }
  #meta .slugwrap { grid-column: 1 / -1; display: flex; align-items: center; gap: 6px; font-size: 12px; color: var(--muted); }
  #meta .slugwrap input { border: 0 !important; padding: 0 !important; font: 12px "Geist Mono", monospace !important; color: var(--fg); width: auto !important; flex: 1; }

  #panes { display: grid; grid-template-columns: 1fr 1fr; min-height: 0; }
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
  .prose blockquote { margin: 1.6em 0; border-left: 1px solid var(--border); padding-left: 1.25rem; color: var(--muted); }
  .prose ul, .prose ol { padding-left: 1.6em; margin: 1.25em 0; }
  .prose li { margin: .5rem 0; line-height: 1.625; }
  .prose img { display: block; margin: 0 auto; max-width: 100%; max-height: 26rem; width: auto; border-radius: 6px; }
  .prose figure { margin: 1.6em 0; }
  .prose hr { border: 0; border-top: 1px solid var(--border); margin: 3em 0; }
  .prose strong { font-weight: 600; }
  .prose :not(pre) > code { font: .875em "Geist Mono", monospace; font-weight: 600; }
  .prose :not(pre) > code::before, .prose :not(pre) > code::after { content: "\0060"; }
  .prose pre { font: .875em/1.7 "Geist Mono", monospace; overflow-x: auto; padding: 1em 1.2em; border-radius: 6px; border: 1px solid var(--border); }
  .prose table { border-collapse: collapse; width: 100%; font-size: .9em; }
  .prose th, .prose td { border-bottom: 1px solid var(--border); padding: .5em .6em; text-align: left; }
  .empty { color: var(--muted); }

  @media (max-width: 800px) {
    body { grid-template-columns: 0 1fr; }
    #meta { grid-template-columns: 1fr 1fr; }
    body.mode-split #panes { grid-template-columns: 1fr 0; }
  }
</style>
</head>
<body class="mode-split">
<script>try { if (localStorage.getItem("blog-admin-theme") === "dark") document.documentElement.dataset.theme = "dark"; } catch {}</script>
<aside>
  <div class="top"><b>Writing</b><button id="new" title="New">+ New</button></div>
  <div class="seg" id="kinds">
    <button data-kind="post">Posts</button><button data-kind="topic">Topics</button><button data-kind="wiki">Wiki</button>
  </div>
  <div id="posts"></div>
</aside>
<main>
  <header>
    <button id="toggleside" title="Toggle sidebar" style="padding:5px 9px">☰</button>
    <span id="dirty" title="Changes not written to disk yet — ⌘/Ctrl+S">Unsaved</span>
    <span id="msg"></span>
    <div class="seg" id="modes">
      <button data-mode="write">Write</button><button data-mode="split">Split</button><button data-mode="preview">Preview</button>
    </div>
    <button id="theme" title="Light / dark" style="padding:5px 9px"></button>
    <button id="save" title="⌘/Ctrl+S">Save</button>
    <button id="publish" class="primary" title="Save, commit this post, push — Cloudflare Pages deploys">Publish</button>
  </header>
  <div id="meta">
    <label>Title<input type="text" id="f-title" placeholder="Title"></label>
    <label>Summary<input type="text" id="f-summary" placeholder="One line, shown under the title and in the list"></label>
    <label class="only-post">Date<input type="date" id="f-date"></label>
    <label class="check only-post" title="Drafts are saved but hidden from the site"><input type="checkbox" id="f-draft"> Draft</label>
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
    </div></div>
  </div>
</main>

<script type="module">
import { EditorView, minimalSetup } from "https://esm.sh/codemirror@6.0.2";
import { keymap, placeholder } from "https://esm.sh/@codemirror/view@6";
import { EditorSelection } from "https://esm.sh/@codemirror/state@6";
import { indentWithTab } from "https://esm.sh/@codemirror/commands@6";
import { markdown, markdownLanguage } from "https://esm.sh/@codemirror/lang-markdown@6";
import { languages } from "https://esm.sh/@codemirror/language-data@6";
import { HighlightStyle, syntaxHighlighting } from "https://esm.sh/@codemirror/language@6";
import { tags as t } from "https://esm.sh/@lezer/highlight@1";

const $ = (s) => document.querySelector(s);
const F = {
  title: $("#f-title"), summary: $("#f-summary"), date: $("#f-date"), draft: $("#f-draft"), slug: $("#f-slug"),
  topics: $("#f-topics"), pages: $("#f-pages"),
};
const today = () => new Date().toLocaleDateString("en-CA");
const slugify = (s) => s.toLowerCase().normalize("NFKD").replace(/[^\w\s-]/g, "").trim().replace(/[\s_]+/g, "-").replace(/-+/g, "-");
const csv = (s) => s.split(",").map((x) => x.trim()).filter(Boolean);
const URLS = { post: "/blog/", topic: "/topics/", wiki: "/wiki/" };
const NOUN = { post: "post", topic: "topic", wiki: "wiki page" };

let kind = "post";      // kind of the open entry
let listKind = "post";  // sidebar tab
let current = null;     // slug as saved on disk (null = unsaved new entry)
let slugTouched = false;
let dirty = false;
let saved = "";         // form snapshot as last loaded/saved; dirty = form differs from it
let wikiTitles = new Map();

const snapshot = () => JSON.stringify([
  kind, F.title.value, F.summary.value, F.date.value, F.draft.checked, F.slug.value,
  csv(F.topics.value), csv(F.pages.value), getBody(),
]);
const setDirty = (v) => {
  dirty = v;
  document.body.classList.toggle("dirty", v);
  document.title = (v ? "● " : "") + "writing admin";
};
const markSaved = () => { saved = snapshot(); setDirty(false); };
const refreshDirty = () => setDirty(snapshot() !== saved);
let msgTimer;
const flash = (text, sticky) => {
  clearTimeout(msgTimer); $("#msg").textContent = text;
  if (!sticky) msgTimer = setTimeout(updateCount, 3500);
};

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

const view = new EditorView({
  parent: $("#editor"),
  extensions: [
    minimalSetup,
    EditorView.lineWrapping,
    markdown({ base: markdownLanguage, codeLanguages: languages }),
    syntaxHighlighting(mdStyle),
    placeholder("Start writing…  (paste or drop images to upload; [[slug]] links a wiki page)"),
    keymap.of([
      { key: "Mod-s", preventDefault: true, run: () => (save(), true) },
      { key: "Mod-b", run: wrap("**") },
      { key: "Mod-i", run: wrap("_") },
      { key: "Mod-\\", run: () => (cycleMode(), true) },
      indentWithTab,
    ]),
    EditorView.updateListener.of((u) => { if (u.docChanged) { refreshDirty(); schedulePreview(); } }),
    EditorView.domEventHandlers({
      paste: (e) => uploadFiles(e.clipboardData?.files, e),
      drop: (e) => { $("#editor").classList.remove("drop"); return uploadFiles(e.dataTransfer?.files, e); },
      dragover: (e) => { if (e.dataTransfer?.types.includes("Files")) { e.preventDefault(); $("#editor").classList.add("drop"); } },
      dragleave: () => $("#editor").classList.remove("drop"),
    }),
  ],
});
const getBody = () => view.state.doc.toString();
const setBody = (s) => view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: s } });

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
    flash("image saved ✓ — type alt text between the [ ]");
  })();
  return true;
}

/* ---------- preview ---------- */
let previewTimer, previewSeq = 0;
function schedulePreview() { clearTimeout(previewTimer); previewTimer = setTimeout(renderPreview, 120); updateCount(); }
async function renderPreview() {
  const seq = ++previewSeq;
  $("#p-title").textContent = F.title.value || "Untitled";
  // topic pages show the intro in place of a summary line
  const showSummary = kind !== "topic" && F.summary.value;
  $("#p-summary").textContent = F.summary.value;
  $("#p-summary").style.display = showSummary ? "" : "none";
  renderPages();
  const body = getBody();
  if (!body.trim()) { $("#p-body").innerHTML = '<p class="empty">Nothing yet.</p>'; return; }
  const r = await fetch("/api/preview?kind=" + kind, { method: "POST", body });
  const html = await r.text();
  if (seq === previewSeq) $("#p-body").innerHTML = html;
}
function renderPages() {
  const ul = $("#p-pages");
  ul.innerHTML = "";
  if (kind !== "topic") return;
  for (const s of csv(F.pages.value)) {
    const li = document.createElement("li");
    const title = wikiTitles.get(s);
    li.textContent = title || s;
    if (!title) { li.className = "missing"; li.insertAdjacentHTML("beforeend", " <span>— no such wiki page or post</span>"); }
    ul.appendChild(li);
  }
}
function updateCount() {
  const words = (getBody().match(/\S+/g) || []).length;
  $("#msg").textContent = words + " words · " + Math.max(1, Math.round(words / 230)) + " min read";
}

/* ---------- modes ---------- */
const MODES = ["write", "split", "preview"];
function setMode(m) {
  document.body.classList.remove(...MODES.map((x) => "mode-" + x));
  document.body.classList.add("mode-" + m);
  document.querySelectorAll("#modes button").forEach((b) => b.classList.toggle("on", b.dataset.mode === m));
  try { localStorage.setItem("blog-admin-mode", m); } catch {}
}
const cycleMode = () => {
  const cur = MODES.find((m) => document.body.classList.contains("mode-" + m));
  setMode(MODES[(MODES.indexOf(cur) + 1) % 3]);
};
document.querySelectorAll("#modes button").forEach((b) => (b.onclick = () => setMode(b.dataset.mode)));
let savedMode = "split";
try { savedMode = localStorage.getItem("blog-admin-mode") || "split"; } catch {}
setMode(savedMode);
$("#toggleside").onclick = () => document.body.classList.toggle("nosidebar");
const themeIcon = () => ($("#theme").textContent = document.documentElement.dataset.theme === "dark" ? "☀" : "☾");
$("#theme").onclick = () => {
  const dark = document.documentElement.dataset.theme !== "dark";
  if (dark) document.documentElement.dataset.theme = "dark"; else delete document.documentElement.dataset.theme;
  try { localStorage.setItem("blog-admin-theme", dark ? "dark" : "light"); } catch {}
  themeIcon();
};
themeIcon();

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
  try { localStorage.setItem("blog-admin-kind", k); } catch {}
  loadList();
}
document.querySelectorAll("#kinds button").forEach((b) => (b.onclick = () => setListKind(b.dataset.kind)));

/** Wiki + post titles (topic preview) and topic slugs (hint next to the Topics field). */
async function loadRefs() {
  const [wiki, posts, topics] = await Promise.all(["wiki", "post", "topic"].map((k) => fetch("/api/list?kind=" + k).then((r) => r.json())));
  wikiTitles = new Map([...wiki, ...posts].map((p) => [p.slug, p.title]));
  $("#topics-known").textContent = "(" + topics.map((t) => t.slug).join(", ") + ")";
}

/* ---------- list ---------- */
async function loadList() {
  const k = listKind;
  const entries = await fetch("/api/list?kind=" + k).then((r) => r.json());
  if (k !== listKind) return; // tab switched mid-fetch
  $("#posts").innerHTML = "";
  for (const p of entries) {
    const b = document.createElement("button");
    b.className = "post" + (k === kind && p.slug === current ? " active" : "");
    b.innerHTML = '<span class="t"></span><span class="d"></span>';
    b.querySelector(".t").textContent = p.title;
    b.querySelector(".d").textContent =
      k === "post" ? p.publishedAt : k === "topic" ? p.pages.length + " pages" : p.topics.join(", ") || "no topic";
    if (p.draft) b.querySelector(".d").insertAdjacentHTML("beforeend", '<span class="badge">draft</span>');
    b.onclick = () => open(k, p.slug);
    $("#posts").appendChild(b);
  }
}

const confirmDiscard = () => !dirty || confirm("You have unsaved changes. Discard them?");
const setHash = (k, slug) => history.replaceState(null, "", "#" + (slug ? (k === "post" ? "" : k + "/") + slug : ""));

async function open(k, slug) {
  if (!confirmDiscard()) return;
  const r = await fetch("/api/entry?kind=" + k + "&slug=" + encodeURIComponent(slug));
  const p = await r.json();
  if (!r.ok) { flash("couldn't open: " + p.error, true); return; }
  setKind(k);
  current = p.slug; slugTouched = true;
  F.title.value = p.title; F.summary.value = p.summary; F.date.value = p.publishedAt;
  F.draft.checked = p.draft; F.slug.value = p.slug;
  F.topics.value = p.topics.join(", "); F.pages.value = p.pages.join(", ");
  setBody(p.body); markSaved(); renderPreview(); setListKind(k);
  setHash(k, slug);
}

function newEntry() {
  if (!confirmDiscard()) return;
  setKind(listKind);
  current = null; slugTouched = false;
  for (const el of [F.title, F.summary, F.slug, F.topics, F.pages]) el.value = "";
  F.date.value = today(); F.draft.checked = kind === "post";
  setBody(""); markSaved(); renderPreview(); loadList();
  setHash(kind, "");
  F.title.focus();
}
$("#new").onclick = newEntry;

function ensureSlug() {
  if (!F.slug.value && F.title.value) F.slug.value = slugify(F.title.value);
  return F.slug.value;
}
F.title.oninput = () => { if (!slugTouched) F.slug.value = slugify(F.title.value); refreshDirty(); schedulePreview(); };
F.summary.oninput = () => { refreshDirty(); schedulePreview(); };
F.slug.oninput = () => { slugTouched = true; refreshDirty(); };
F.pages.oninput = () => { refreshDirty(); renderPages(); };
F.topics.oninput = F.date.oninput = F.draft.onchange = refreshDirty;
for (const el of Object.values(F)) el.addEventListener("keydown", (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key === "s") { e.preventDefault(); save(); }
  if (e.key === "Enter" && el.type === "text") { e.preventDefault(); view.focus(); }
});

async function save(andPublish = false) {
  const slug = ensureSlug();
  if (!F.title.value.trim()) { flash("needs a title"); F.title.focus(); return false; }
  const payload = {
    kind, slug, prevSlug: current, title: F.title.value.trim(), summary: F.summary.value.trim(),
    publishedAt: F.date.value || today(), draft: F.draft.checked,
    topics: csv(F.topics.value), pages: csv(F.pages.value), body: getBody(), publish: andPublish,
  };
  const r = await fetch("/api/entry", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
  const j = await r.json();
  if (!r.ok) { flash("failed: " + j.error, true); return false; }
  current = slug; slugTouched = true; markSaved(); loadList(); loadRefs().then(renderPages);
  setHash(kind, slug);
  const done = andPublish ? "published ✓ — " + j.gitOut.trim().split("\n").pop() : "saved ✓";
  if (j.warnings.length) flash(done + "  ⚠ " + j.warnings.join(" · "), true);
  else flash(done);
  return true;
}
$("#save").onclick = () => save();
$("#publish").onclick = async () => {
  const draftNote = kind === "post" && F.draft.checked ? "\n\n(It's marked Draft, so it'll be committed but hidden on the site.)" : "";
  if (!confirm("Commit + push this " + NOUN[kind] + " to main? Cloudflare Pages will deploy." + draftNote)) return;
  $("#publish").disabled = true; flash("pushing…", true);
  await save(true);
  $("#publish").disabled = false;
};

window.addEventListener("beforeunload", (e) => { if (dirty) e.preventDefault(); });

let startKind = "post";
try { startKind = localStorage.getItem("blog-admin-kind") || "post"; } catch {}
await loadRefs();
// #slug = post, #wiki/slug, #topic/slug
const [hashKind, hashSlug] = (([a, b]) => (b ? [a, b] : ["post", a]))(decodeURIComponent(location.hash.slice(1)).split("/"));
if (hashSlug && URLS[hashKind]) await open(hashKind, hashSlug);
else { setListKind(URLS[startKind] ? startKind : "post"); newEntry(); }
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
    } else if (req.method === "GET" && url.pathname === "/api/entry") {
      const slug = url.searchParams.get("slug");
      if (!SLUG_RE.test(slug || "")) return json(400, { error: "bad slug" });
      json(200, readEntry(url.searchParams.get("kind") || "post", slug));
    } else if (req.method === "POST" && url.pathname === "/api/entry") {
      const p = JSON.parse(await readBody(req));
      writeEntry(p);
      const renamed = p.prevSlug && p.prevSlug !== p.slug;
      const warnings = [...unknownRefs(p), ...(renamed ? referrers(p.kind, p.prevSlug).map((f) => `${f} still links "${p.prevSlug}"`) : [])];
      const gitOut = p.publish ? publish(p.kind, p.slug, p.prevSlug, p.title) : "";
      json(200, { ok: true, gitOut, warnings });
    } else if (req.method === "POST" && url.pathname === "/api/preview") {
      const md = String(await readBody(req));
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end(await render(url.searchParams.get("kind") === "post" ? md : linkWiki(md)));
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

function slugify(s) {
  return s.toLowerCase().normalize("NFKD").replace(/[^\w\s-]/g, "").trim().replace(/[\s_]+/g, "-").replace(/-+/g, "-");
}
