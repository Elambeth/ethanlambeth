import fs from "fs";
import matter from "gray-matter";
import path from "path";
import { markdownToHTML } from "@/data/blog";
import type { GlyphKind } from "@/components/glyph";
import { WIKILINK, linkNotes, noteIndex, resolveTarget } from "@/lib/notes.mjs";

// Topics live in content/topics/<slug>.md, wiki pages in content/wiki/<slug>.md.
// Posts in content/*.mdx join a topic with `topics: [slug]` in their frontmatter.
// [[slug]] or [[slug|text]] links any wiki page, post or topic (see src/lib/notes.mjs).

const TOPICS_DIR = path.join(process.cwd(), "content", "topics");
const WIKI_DIR = path.join(process.cwd(), "content", "wiki");
const POSTS_DIR = path.join(process.cwd(), "content");

export type Topic = {
  slug: string;
  title: string;
  summary: string;
  pages: string[]; // reading order
  glyph?: GlyphKind; // animated thumbnail in the header
  introHtml: string;
};

export type WikiPage = {
  slug: string;
  title: string;
  summary: string;
  topics: string[];
  links: string[]; // outgoing [[links]]
  html: string;
};

export type TopicPost = { slug: string; title: string; summary: string };

function readDir(dir: string, ext: string) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((file) => path.extname(file) === ext)
    .map((file) => ({
      slug: path.basename(file, ext),
      ...matter(fs.readFileSync(path.join(dir, file), "utf-8")),
    }));
}

function rawPages() {
  return readDir(WIKI_DIR, ".md").filter((p) => !p.data.draft);
}

type Notes = ReturnType<typeof noteIndex>;

const render = (markdown: string, notes: Notes) => markdownToHTML(linkNotes(markdown, notes));

export async function getWikiPages(): Promise<WikiPage[]> {
  const notes = noteIndex();
  return Promise.all(
    rawPages().map(async (p) => ({
      slug: p.slug,
      title: String(p.data.title ?? p.slug),
      summary: String(p.data.summary ?? ""),
      topics: (p.data.topics as string[] | undefined) ?? [],
      links: Array.from(p.content.matchAll(WIKILINK), (m) => resolveTarget(m[1], notes))
        .filter((n) => n?.kind === "wiki")
        .map((n) => n!.slug),
      html: await render(p.content, notes),
    }))
  );
}

export async function getWikiPage(slug: string) {
  const pages = await getWikiPages();
  return pages.find((p) => p.slug === slug);
}

export async function getTopics(): Promise<Topic[]> {
  const notes = noteIndex();
  return Promise.all(
    readDir(TOPICS_DIR, ".md").map(async (t) => ({
      slug: t.slug,
      title: String(t.data.title ?? t.slug),
      summary: String(t.data.summary ?? ""),
      pages: (t.data.pages as string[] | undefined) ?? [],
      glyph: t.data.glyph as GlyphKind | undefined,
      introHtml: await render(t.content, notes),
    }))
  );
}

export async function getTopic(slug: string) {
  const topics = await getTopics();
  return topics.find((t) => t.slug === slug);
}

/** Published posts that list this topic in their frontmatter. */
export function getTopicPosts(topic: string): TopicPost[] {
  return readDir(POSTS_DIR, ".mdx")
    .filter((p) => !p.data.draft && (p.data.topics as string[] | undefined)?.includes(topic))
    .map((p) => ({
      slug: p.slug,
      title: String(p.data.title),
      summary: String(p.data.summary ?? ""),
    }));
}
