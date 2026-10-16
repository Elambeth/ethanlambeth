// Note links + image sizing, shared by the site (src/data/*.ts) and the local admin (scripts/blog-admin.mjs).
//
//   [[slug]] / [[slug|text]]       link any wiki page, post or topic (wiki wins a slug clash, then posts, then topics)
//   [[blog/slug]] / [[topics/x]]   force a kind
//   [[Magic Ink]]                  titles work too (case-insensitive), as do un-slugged names
//   ![alt|400](src)                image 400px wide; ![alt|60%](src) = 60% of the column
import fs from "fs";
import matter from "gray-matter";
import path from "path";

export const WIKILINK = /\[\[([^\]|\n]+)(?:\|([^\]\n]+))?\]\]/g;

const SOURCES = [
  { kind: "wiki", dir: "content/wiki", ext: ".md", base: "/wiki/" },
  { kind: "post", dir: "content", ext: ".mdx", base: "/blog/" },
  { kind: "topic", dir: "content/topics", ext: ".md", base: "/topics/" },
];
const PREFIX_KIND = { wiki: "wiki", blog: "post", post: "post", topics: "topic", topic: "topic" };

export const slugify = (s) =>
  String(s).toLowerCase().normalize("NFKD").replace(/[^\w\s-]/g, "").trim().replace(/[\s_]+/g, "-").replace(/-+/g, "-");

/** Every linkable note, in resolution-priority order. */
export function noteIndex(root = process.cwd()) {
  const notes = [];
  for (const s of SOURCES) {
    const dir = path.join(root, s.dir);
    if (!fs.existsSync(dir)) continue;
    for (const file of fs.readdirSync(dir).sort()) {
      if (path.extname(file) !== s.ext) continue;
      const slug = file.slice(0, -s.ext.length);
      const { data } = matter(fs.readFileSync(path.join(dir, file), "utf8"));
      notes.push({
        kind: s.kind, slug, href: s.base + slug, title: String(data.title ?? slug),
        summary: String(data.summary ?? ""), draft: !!data.draft,
      });
    }
  }
  return notes;
}

/** Link target → note, or undefined. */
export function resolveTarget(target, notes) {
  const t = String(target).trim();
  const m = t.match(/^(wiki|blog|post|topics?)\/(.+)$/);
  const pool = m ? notes.filter((n) => n.kind === PREFIX_KIND[m[1]]) : notes;
  const name = m ? m[2] : t;
  const lower = name.toLowerCase();
  return (
    pool.find((n) => n.slug === name) ??
    pool.find((n) => n.title.toLowerCase() === lower) ??
    pool.find((n) => n.slug === slugify(name))
  );
}

/** [[links]] → markdown links. Unknown (or draft) targets go through `missing`, plain text by default. */
export function linkNotes(markdown, notes, { includeDrafts = false, missing = (label) => label } = {}) {
  return markdown.replace(WIKILINK, (_, target, text) => {
    const note = resolveTarget(target, notes);
    const ok = note && (includeDrafts || !note.draft);
    const label = text?.trim() || (ok ? note.title : target.trim());
    return ok ? `[${label}](${note.href})` : missing(label, target.trim());
  });
}

const SIZE = /^(.*?)\s*\|\s*(\d+)(px|%)?(?:x\d+)?\s*$/;

/** rehype: `alt|400` / `alt|60%` → sized <img>, alt cleaned. */
export function rehypeImageSize() {
  const walk = (node) => {
    if (node.type === "element" && node.tagName === "img") {
      const m = String(node.properties?.alt ?? "").match(SIZE);
      if (m) {
        node.properties.alt = m[1];
        node.properties.style = `width:${m[2]}${m[3] === "%" ? "%" : "px"};max-width:100%;max-height:none;height:auto`;
      }
    }
    node.children?.forEach(walk);
  };
  return walk;
}
